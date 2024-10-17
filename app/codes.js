export const codes = [
  {
    language: 'c',
    code: `
// SPDX-License-Identifier: GPL-2.0-only
/* binder_alloc.c
 *
 * Android IPC Subsystem
 *
 * Copyright (C) 2007-2017 Google, Inc.
 */

#define pr_fmt(fmt) KBUILD_MODNAME ": " fmt

#include <linux/list.h>
#include <linux/sched/mm.h>
#include <linux/module.h>
#include <linux/rtmutex.h>
#include <linux/rbtree.h>
#include <linux/seq_file.h>
#include <linux/vmalloc.h>
#include <linux/slab.h>
#include <linux/sched.h>
#include <linux/list_lru.h>
#include <linux/ratelimit.h>
#include <asm/cacheflush.h>
#include <linux/uaccess.h>
#include <linux/highmem.h>
#include <linux/sizes.h>
#include "binder_alloc.h"
#include "binder_trace.h"

struct list_lru binder_freelist;

static DEFINE_MUTEX(binder_alloc_mmap_lock);

enum {
	BINDER_DEBUG_USER_ERROR             = 1U << 0,
	BINDER_DEBUG_OPEN_CLOSE             = 1U << 1,
	BINDER_DEBUG_BUFFER_ALLOC           = 1U << 2,
	BINDER_DEBUG_BUFFER_ALLOC_ASYNC     = 1U << 3,
};
static uint32_t binder_alloc_debug_mask = BINDER_DEBUG_USER_ERROR;

module_param_named(debug_mask, binder_alloc_debug_mask,
		   uint, 0644);

#define binder_alloc_debug(mask, x...) \
	do { \
		if (binder_alloc_debug_mask & mask) \
			pr_info_ratelimited(x); \
	} while (0)

static struct binder_buffer *binder_buffer_next(struct binder_buffer *buffer)
{
	return list_entry(buffer->entry.next, struct binder_buffer, entry);
}

static struct binder_buffer *binder_buffer_prev(struct binder_buffer *buffer)
{
	return list_entry(buffer->entry.prev, struct binder_buffer, entry);
}

static size_t binder_alloc_buffer_size(struct binder_alloc *alloc,
				       struct binder_buffer *buffer)
{
	if (list_is_last(&buffer->entry, &alloc->buffers))
		return alloc->buffer + alloc->buffer_size - buffer->user_data;
	return binder_buffer_next(buffer)->user_data - buffer->user_data;
}

static void binder_insert_free_buffer(struct binder_alloc *alloc,
				      struct binder_buffer *new_buffer)
{
	struct rb_node **p = &alloc->free_buffers.rb_node;
	struct rb_node *parent = NULL;
	struct binder_buffer *buffer;
	size_t buffer_size;
	size_t new_buffer_size;

	BUG_ON(!new_buffer->free);

	new_buffer_size = binder_alloc_buffer_size(alloc, new_buffer);

	binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC,
		     "%d: add free buffer, size %zd, at %pK\n",
		      alloc->pid, new_buffer_size, new_buffer);

	while (*p) {
		parent = *p;
		buffer = rb_entry(parent, struct binder_buffer, rb_node);
		BUG_ON(!buffer->free);

		buffer_size = binder_alloc_buffer_size(alloc, buffer);

		if (new_buffer_size < buffer_size)
			p = &parent->rb_left;
		else
			p = &parent->rb_right;
	}
	rb_link_node(&new_buffer->rb_node, parent, p);
	rb_insert_color(&new_buffer->rb_node, &alloc->free_buffers);
}

static void binder_insert_allocated_buffer_locked(
		struct binder_alloc *alloc, struct binder_buffer *new_buffer)
{
	struct rb_node **p = &alloc->allocated_buffers.rb_node;
	struct rb_node *parent = NULL;
	struct binder_buffer *buffer;

	BUG_ON(new_buffer->free);

	while (*p) {
		parent = *p;
		buffer = rb_entry(parent, struct binder_buffer, rb_node);
		BUG_ON(buffer->free);

		if (new_buffer->user_data < buffer->user_data)
			p = &parent->rb_left;
		else if (new_buffer->user_data > buffer->user_data)
			p = &parent->rb_right;
		else
			BUG();
	}
	rb_link_node(&new_buffer->rb_node, parent, p);
	rb_insert_color(&new_buffer->rb_node, &alloc->allocated_buffers);
}

static struct binder_buffer *binder_alloc_prepare_to_free_locked(
		struct binder_alloc *alloc,
		unsigned long user_ptr)
{
	struct rb_node *n = alloc->allocated_buffers.rb_node;
	struct binder_buffer *buffer;

	while (n) {
		buffer = rb_entry(n, struct binder_buffer, rb_node);
		BUG_ON(buffer->free);

		if (user_ptr < buffer->user_data) {
			n = n->rb_left;
		} else if (user_ptr > buffer->user_data) {
			n = n->rb_right;
		} else {
			/*
			 * Guard against user threads attempting to
			 * free the buffer when in use by kernel or
			 * after it's already been freed.
			 */
			if (!buffer->allow_user_free)
				return ERR_PTR(-EPERM);
			buffer->allow_user_free = 0;
			return buffer;
		}
	}
	return NULL;
}

/**
 * binder_alloc_prepare_to_free() - get buffer given user ptr
 * @alloc:	binder_alloc for this proc
 * @user_ptr:	User pointer to buffer data
 *
 * Validate userspace pointer to buffer data and return buffer corresponding to
 * that user pointer. Search the rb tree for buffer that matches user data
 * pointer.
 *
 * Return:	Pointer to buffer or NULL
 */
struct binder_buffer *binder_alloc_prepare_to_free(struct binder_alloc *alloc,
						   unsigned long user_ptr)
{
	struct binder_buffer *buffer;

	spin_lock(&alloc->lock);
	buffer = binder_alloc_prepare_to_free_locked(alloc, user_ptr);
	spin_unlock(&alloc->lock);
	return buffer;
}

static inline void
binder_set_installed_page(struct binder_lru_page *lru_page,
			  struct page *page)
{
	/* Pairs with acquire in binder_get_installed_page() */
	smp_store_release(&lru_page->page_ptr, page);
}

static inline struct page *
binder_get_installed_page(struct binder_lru_page *lru_page)
{
	/* Pairs with release in binder_set_installed_page() */
	return smp_load_acquire(&lru_page->page_ptr);
}

static void binder_lru_freelist_add(struct binder_alloc *alloc,
				    unsigned long start, unsigned long end)
{
	struct binder_lru_page *page;
	unsigned long page_addr;

	trace_binder_update_page_range(alloc, false, start, end);

	for (page_addr = start; page_addr < end; page_addr += PAGE_SIZE) {
		size_t index;
		int ret;

		index = (page_addr - alloc->buffer) / PAGE_SIZE;
		page = &alloc->pages[index];

		if (!binder_get_installed_page(page))
			continue;

		trace_binder_free_lru_start(alloc, index);

		ret = list_lru_add_obj(&binder_freelist, &page->lru);
		WARN_ON(!ret);

		trace_binder_free_lru_end(alloc, index);
	}
}

static int binder_install_single_page(struct binder_alloc *alloc,
				      struct binder_lru_page *lru_page,
				      unsigned long addr)
{
	struct page *page;
	int ret = 0;

	if (!mmget_not_zero(alloc->mm))
		return -ESRCH;

	/*
	 * Protected with mmap_sem in write mode as multiple tasks
	 * might race to install the same page.
	 */
	mmap_write_lock(alloc->mm);
	if (binder_get_installed_page(lru_page))
		goto out;

	if (!alloc->vma) {
		pr_err("%d: %s failed, no vma\n", alloc->pid, __func__);
		ret = -ESRCH;
		goto out;
	}

	page = alloc_page(GFP_KERNEL | __GFP_HIGHMEM | __GFP_ZERO);
	if (!page) {
		pr_err("%d: failed to allocate page\n", alloc->pid);
		ret = -ENOMEM;
		goto out;
	}

	ret = vm_insert_page(alloc->vma, addr, page);
	if (ret) {
		pr_err("%d: %s failed to insert page at offset %lx with %d\n",
		       alloc->pid, __func__, addr - alloc->buffer, ret);
		__free_page(page);
		ret = -ENOMEM;
		goto out;
	}

	/* Mark page installation complete and safe to use */
	binder_set_installed_page(lru_page, page);
out:
	mmap_write_unlock(alloc->mm);
	mmput_async(alloc->mm);
	return ret;
}

static int binder_install_buffer_pages(struct binder_alloc *alloc,
				       struct binder_buffer *buffer,
				       size_t size)
{
	struct binder_lru_page *page;
	unsigned long start, final;
	unsigned long page_addr;

	start = buffer->user_data & PAGE_MASK;
	final = PAGE_ALIGN(buffer->user_data + size);

	for (page_addr = start; page_addr < final; page_addr += PAGE_SIZE) {
		unsigned long index;
		int ret;

		index = (page_addr - alloc->buffer) / PAGE_SIZE;
		page = &alloc->pages[index];

		if (binder_get_installed_page(page))
			continue;

		trace_binder_alloc_page_start(alloc, index);

		ret = binder_install_single_page(alloc, page, page_addr);
		if (ret)
			return ret;

		trace_binder_alloc_page_end(alloc, index);
	}

	return 0;
}

/* The range of pages should exclude those shared with other buffers */
static void binder_lru_freelist_del(struct binder_alloc *alloc,
				    unsigned long start, unsigned long end)
{
	struct binder_lru_page *page;
	unsigned long page_addr;

	trace_binder_update_page_range(alloc, true, start, end);

	for (page_addr = start; page_addr < end; page_addr += PAGE_SIZE) {
		unsigned long index;
		bool on_lru;

		index = (page_addr - alloc->buffer) / PAGE_SIZE;
		page = &alloc->pages[index];

		if (page->page_ptr) {
			trace_binder_alloc_lru_start(alloc, index);

			on_lru = list_lru_del_obj(&binder_freelist, &page->lru);
			WARN_ON(!on_lru);

			trace_binder_alloc_lru_end(alloc, index);
			continue;
		}

		if (index + 1 > alloc->pages_high)
			alloc->pages_high = index + 1;
	}
}

static inline void binder_alloc_set_vma(struct binder_alloc *alloc,
		struct vm_area_struct *vma)
{
	/* pairs with smp_load_acquire in binder_alloc_get_vma() */
	smp_store_release(&alloc->vma, vma);
}

static inline struct vm_area_struct *binder_alloc_get_vma(
		struct binder_alloc *alloc)
{
	/* pairs with smp_store_release in binder_alloc_set_vma() */
	return smp_load_acquire(&alloc->vma);
}

static void debug_no_space_locked(struct binder_alloc *alloc)
{
	size_t largest_alloc_size = 0;
	struct binder_buffer *buffer;
	size_t allocated_buffers = 0;
	size_t largest_free_size = 0;
	size_t total_alloc_size = 0;
	size_t total_free_size = 0;
	size_t free_buffers = 0;
	size_t buffer_size;
	struct rb_node *n;

	for (n = rb_first(&alloc->allocated_buffers); n; n = rb_next(n)) {
		buffer = rb_entry(n, struct binder_buffer, rb_node);
		buffer_size = binder_alloc_buffer_size(alloc, buffer);
		allocated_buffers++;
		total_alloc_size += buffer_size;
		if (buffer_size > largest_alloc_size)
			largest_alloc_size = buffer_size;
	}

	for (n = rb_first(&alloc->free_buffers); n; n = rb_next(n)) {
		buffer = rb_entry(n, struct binder_buffer, rb_node);
		buffer_size = binder_alloc_buffer_size(alloc, buffer);
		free_buffers++;
		total_free_size += buffer_size;
		if (buffer_size > largest_free_size)
			largest_free_size = buffer_size;
	}

	binder_alloc_debug(BINDER_DEBUG_USER_ERROR,
			   "allocated: %zd (num: %zd largest: %zd), free: %zd (num: %zd largest: %zd)\n",
			   total_alloc_size, allocated_buffers,
			   largest_alloc_size, total_free_size,
			   free_buffers, largest_free_size);
}

static bool debug_low_async_space_locked(struct binder_alloc *alloc)
{
	/*
	 * Find the amount and size of buffers allocated by the current caller;
	 * The idea is that once we cross the threshold, whoever is responsible
	 * for the low async space is likely to try to send another async txn,
	 * and at some point we'll catch them in the act. This is more efficient
	 * than keeping a map per pid.
	 */
	struct binder_buffer *buffer;
	size_t total_alloc_size = 0;
	int pid = current->tgid;
	size_t num_buffers = 0;
	struct rb_node *n;

	/*
	 * Only start detecting spammers once we have less than 20% of async
	 * space left (which is less than 10% of total buffer size).
	 */
	if (alloc->free_async_space >= alloc->buffer_size / 10) {
		alloc->oneway_spam_detected = false;
		return false;
	}

	for (n = rb_first(&alloc->allocated_buffers); n != NULL;
		 n = rb_next(n)) {
		buffer = rb_entry(n, struct binder_buffer, rb_node);
		if (buffer->pid != pid)
			continue;
		if (!buffer->async_transaction)
			continue;
		total_alloc_size += binder_alloc_buffer_size(alloc, buffer);
		num_buffers++;
	}

	/*
	 * Warn if this pid has more than 50 transactions, or more than 50% of
	 * async space (which is 25% of total buffer size). Oneway spam is only
	 * detected when the threshold is exceeded.
	 */
	if (num_buffers > 50 || total_alloc_size > alloc->buffer_size / 4) {
		binder_alloc_debug(BINDER_DEBUG_USER_ERROR,
			     "%d: pid %d spamming oneway? %zd buffers allocated for a total size of %zd\n",
			      alloc->pid, pid, num_buffers, total_alloc_size);
		if (!alloc->oneway_spam_detected) {
			alloc->oneway_spam_detected = true;
			return true;
		}
	}
	return false;
}

/* Callers preallocate @new_buffer, it is freed by this function if unused */
static struct binder_buffer *binder_alloc_new_buf_locked(
				struct binder_alloc *alloc,
				struct binder_buffer *new_buffer,
				size_t size,
				int is_async)
{
	struct rb_node *n = alloc->free_buffers.rb_node;
	struct rb_node *best_fit = NULL;
	struct binder_buffer *buffer;
	unsigned long next_used_page;
	unsigned long curr_last_page;
	size_t buffer_size;

	if (is_async && alloc->free_async_space < size) {
		binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC,
			     "%d: binder_alloc_buf size %zd failed, no async space left\n",
			      alloc->pid, size);
		buffer = ERR_PTR(-ENOSPC);
		goto out;
	}

	while (n) {
		buffer = rb_entry(n, struct binder_buffer, rb_node);
		BUG_ON(!buffer->free);
		buffer_size = binder_alloc_buffer_size(alloc, buffer);

		if (size < buffer_size) {
			best_fit = n;
			n = n->rb_left;
		} else if (size > buffer_size) {
			n = n->rb_right;
		} else {
			best_fit = n;
			break;
		}
	}

	if (unlikely(!best_fit)) {
		binder_alloc_debug(BINDER_DEBUG_USER_ERROR,
				   "%d: binder_alloc_buf size %zd failed, no address space\n",
				   alloc->pid, size);
		debug_no_space_locked(alloc);
		buffer = ERR_PTR(-ENOSPC);
		goto out;
	}

	if (buffer_size != size) {
		/* Found an oversized buffer and needs to be split */
		buffer = rb_entry(best_fit, struct binder_buffer, rb_node);
		buffer_size = binder_alloc_buffer_size(alloc, buffer);

		WARN_ON(n || buffer_size == size);
		new_buffer->user_data = buffer->user_data + size;
		list_add(&new_buffer->entry, &buffer->entry);
		new_buffer->free = 1;
		binder_insert_free_buffer(alloc, new_buffer);
		new_buffer = NULL;
	}

	binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC,
		     "%d: binder_alloc_buf size %zd got buffer %pK size %zd\n",
		      alloc->pid, size, buffer, buffer_size);

	/*
	 * Now we remove the pages from the freelist. A clever calculation
	 * with buffer_size determines if the last page is shared with an
	 * adjacent in-use buffer. In such case, the page has been already
	 * removed from the freelist so we trim our range short.
	 */
	next_used_page = (buffer->user_data + buffer_size) & PAGE_MASK;
	curr_last_page = PAGE_ALIGN(buffer->user_data + size);
	binder_lru_freelist_del(alloc, PAGE_ALIGN(buffer->user_data),
				min(next_used_page, curr_last_page));

	rb_erase(&buffer->rb_node, &alloc->free_buffers);
	buffer->free = 0;
	buffer->allow_user_free = 0;
	binder_insert_allocated_buffer_locked(alloc, buffer);
	buffer->async_transaction = is_async;
	buffer->oneway_spam_suspect = false;
	if (is_async) {
		alloc->free_async_space -= size;
		binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC_ASYNC,
			     "%d: binder_alloc_buf size %zd async free %zd\n",
			      alloc->pid, size, alloc->free_async_space);
		if (debug_low_async_space_locked(alloc))
			buffer->oneway_spam_suspect = true;
	}

out:
	/* Discard possibly unused new_buffer */
	kfree(new_buffer);
	return buffer;
}

/* Calculate the sanitized total size, returns 0 for invalid request */
static inline size_t sanitized_size(size_t data_size,
				    size_t offsets_size,
				    size_t extra_buffers_size)
{
	size_t total, tmp;

	/* Align to pointer size and check for overflows */
	tmp = ALIGN(data_size, sizeof(void *)) +
		ALIGN(offsets_size, sizeof(void *));
	if (tmp < data_size || tmp < offsets_size)
		return 0;
	total = tmp + ALIGN(extra_buffers_size, sizeof(void *));
	if (total < tmp || total < extra_buffers_size)
		return 0;

	/* Pad 0-sized buffers so they get a unique address */
	total = max(total, sizeof(void *));

	return total;
}

/**
 * binder_alloc_new_buf() - Allocate a new binder buffer
 * @alloc:              binder_alloc for this proc
 * @data_size:          size of user data buffer
 * @offsets_size:       user specified buffer offset
 * @extra_buffers_size: size of extra space for meta-data (eg, security context)
 * @is_async:           buffer for async transaction
 *
 * Allocate a new buffer given the requested sizes. Returns
 * the kernel version of the buffer pointer. The size allocated
 * is the sum of the three given sizes (each rounded up to
 * pointer-sized boundary)
 *
 * Return:	The allocated buffer or %ERR_PTR(-errno) if error
 */
struct binder_buffer *binder_alloc_new_buf(struct binder_alloc *alloc,
					   size_t data_size,
					   size_t offsets_size,
					   size_t extra_buffers_size,
					   int is_async)
{
	struct binder_buffer *buffer, *next;
	size_t size;
	int ret;

	/* Check binder_alloc is fully initialized */
	if (!binder_alloc_get_vma(alloc)) {
		binder_alloc_debug(BINDER_DEBUG_USER_ERROR,
				   "%d: binder_alloc_buf, no vma\n",
				   alloc->pid);
		return ERR_PTR(-ESRCH);
	}

	size = sanitized_size(data_size, offsets_size, extra_buffers_size);
	if (unlikely(!size)) {
		binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC,
				   "%d: got transaction with invalid size %zd-%zd-%zd\n",
				   alloc->pid, data_size, offsets_size,
				   extra_buffers_size);
		return ERR_PTR(-EINVAL);
	}

	/* Preallocate the next buffer */
	next = kzalloc(sizeof(*next), GFP_KERNEL);
	if (!next)
		return ERR_PTR(-ENOMEM);

	spin_lock(&alloc->lock);
	buffer = binder_alloc_new_buf_locked(alloc, next, size, is_async);
	if (IS_ERR(buffer)) {
		spin_unlock(&alloc->lock);
		goto out;
	}

	buffer->data_size = data_size;
	buffer->offsets_size = offsets_size;
	buffer->extra_buffers_size = extra_buffers_size;
	buffer->pid = current->tgid;
	spin_unlock(&alloc->lock);

	ret = binder_install_buffer_pages(alloc, buffer, size);
	if (ret) {
		binder_alloc_free_buf(alloc, buffer);
		buffer = ERR_PTR(ret);
	}
out:
	return buffer;
}

static unsigned long buffer_start_page(struct binder_buffer *buffer)
{
	return buffer->user_data & PAGE_MASK;
}

static unsigned long prev_buffer_end_page(struct binder_buffer *buffer)
{
	return (buffer->user_data - 1) & PAGE_MASK;
}

static void binder_delete_free_buffer(struct binder_alloc *alloc,
				      struct binder_buffer *buffer)
{
	struct binder_buffer *prev, *next;

	if (PAGE_ALIGNED(buffer->user_data))
		goto skip_freelist;

	BUG_ON(alloc->buffers.next == &buffer->entry);
	prev = binder_buffer_prev(buffer);
	BUG_ON(!prev->free);
	if (prev_buffer_end_page(prev) == buffer_start_page(buffer))
		goto skip_freelist;

	if (!list_is_last(&buffer->entry, &alloc->buffers)) {
		next = binder_buffer_next(buffer);
		if (buffer_start_page(next) == buffer_start_page(buffer))
			goto skip_freelist;
	}

	binder_lru_freelist_add(alloc, buffer_start_page(buffer),
				buffer_start_page(buffer) + PAGE_SIZE);
skip_freelist:
	list_del(&buffer->entry);
	kfree(buffer);
}

static void binder_free_buf_locked(struct binder_alloc *alloc,
				   struct binder_buffer *buffer)
{
	size_t size, buffer_size;

	buffer_size = binder_alloc_buffer_size(alloc, buffer);

	size = ALIGN(buffer->data_size, sizeof(void *)) +
		ALIGN(buffer->offsets_size, sizeof(void *)) +
		ALIGN(buffer->extra_buffers_size, sizeof(void *));

	binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC,
		     "%d: binder_free_buf %pK size %zd buffer_size %zd\n",
		      alloc->pid, buffer, size, buffer_size);

	BUG_ON(buffer->free);
	BUG_ON(size > buffer_size);
	BUG_ON(buffer->transaction != NULL);
	BUG_ON(buffer->user_data < alloc->buffer);
	BUG_ON(buffer->user_data > alloc->buffer + alloc->buffer_size);

	if (buffer->async_transaction) {
		alloc->free_async_space += buffer_size;
		binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC_ASYNC,
			     "%d: binder_free_buf size %zd async free %zd\n",
			      alloc->pid, size, alloc->free_async_space);
	}

	binder_lru_freelist_add(alloc, PAGE_ALIGN(buffer->user_data),
				(buffer->user_data + buffer_size) & PAGE_MASK);

	rb_erase(&buffer->rb_node, &alloc->allocated_buffers);
	buffer->free = 1;
	if (!list_is_last(&buffer->entry, &alloc->buffers)) {
		struct binder_buffer *next = binder_buffer_next(buffer);

		if (next->free) {
			rb_erase(&next->rb_node, &alloc->free_buffers);
			binder_delete_free_buffer(alloc, next);
		}
	}
	if (alloc->buffers.next != &buffer->entry) {
		struct binder_buffer *prev = binder_buffer_prev(buffer);

		if (prev->free) {
			binder_delete_free_buffer(alloc, buffer);
			rb_erase(&prev->rb_node, &alloc->free_buffers);
			buffer = prev;
		}
	}
	binder_insert_free_buffer(alloc, buffer);
}

/**
 * binder_alloc_get_page() - get kernel pointer for given buffer offset
 * @alloc: binder_alloc for this proc
 * @buffer: binder buffer to be accessed
 * @buffer_offset: offset into @buffer data
 * @pgoffp: address to copy final page offset to
 *
 * Lookup the struct page corresponding to the address
 * at @buffer_offset into @buffer->user_data. If @pgoffp is not
 * NULL, the byte-offset into the page is written there.
 *
 * The caller is responsible to ensure that the offset points
 * to a valid address within the @buffer and that @buffer is
 * not freeable by the user. Since it can't be freed, we are
 * guaranteed that the corresponding elements of @alloc->pages[]
 * cannot change.
 *
 * Return: struct page
 */
static struct page *binder_alloc_get_page(struct binder_alloc *alloc,
					  struct binder_buffer *buffer,
					  binder_size_t buffer_offset,
					  pgoff_t *pgoffp)
{
	binder_size_t buffer_space_offset = buffer_offset +
		(buffer->user_data - alloc->buffer);
	pgoff_t pgoff = buffer_space_offset & ~PAGE_MASK;
	size_t index = buffer_space_offset >> PAGE_SHIFT;
	struct binder_lru_page *lru_page;

	lru_page = &alloc->pages[index];
	*pgoffp = pgoff;
	return lru_page->page_ptr;
}

/**
 * binder_alloc_clear_buf() - zero out buffer
 * @alloc: binder_alloc for this proc
 * @buffer: binder buffer to be cleared
 *
 * memset the given buffer to 0
 */
static void binder_alloc_clear_buf(struct binder_alloc *alloc,
				   struct binder_buffer *buffer)
{
	size_t bytes = binder_alloc_buffer_size(alloc, buffer);
	binder_size_t buffer_offset = 0;

	while (bytes) {
		unsigned long size;
		struct page *page;
		pgoff_t pgoff;

		page = binder_alloc_get_page(alloc, buffer,
					     buffer_offset, &pgoff);
		size = min_t(size_t, bytes, PAGE_SIZE - pgoff);
		memset_page(page, pgoff, 0, size);
		bytes -= size;
		buffer_offset += size;
	}
}

/**
 * binder_alloc_free_buf() - free a binder buffer
 * @alloc:	binder_alloc for this proc
 * @buffer:	kernel pointer to buffer
 *
 * Free the buffer allocated via binder_alloc_new_buf()
 */
void binder_alloc_free_buf(struct binder_alloc *alloc,
			    struct binder_buffer *buffer)
{
	/*
	 * We could eliminate the call to binder_alloc_clear_buf()
	 * from binder_alloc_deferred_release() by moving this to
	 * binder_free_buf_locked(). However, that could
	 * increase contention for the alloc->lock if clear_on_free
	 * is used frequently for large buffers. This lock is not
	 * needed for correctness here.
	 */
	if (buffer->clear_on_free) {
		binder_alloc_clear_buf(alloc, buffer);
		buffer->clear_on_free = false;
	}
	spin_lock(&alloc->lock);
	binder_free_buf_locked(alloc, buffer);
	spin_unlock(&alloc->lock);
}

/**
 * binder_alloc_mmap_handler() - map virtual address space for proc
 * @alloc:	alloc structure for this proc
 * @vma:	vma passed to mmap()
 *
 * Called by binder_mmap() to initialize the space specified in
 * vma for allocating binder buffers
 *
 * Return:
 *      0 = success
 *      -EBUSY = address space already mapped
 *      -ENOMEM = failed to map memory to given address space
 */
int binder_alloc_mmap_handler(struct binder_alloc *alloc,
			      struct vm_area_struct *vma)
{
	struct binder_buffer *buffer;
	const char *failure_string;
	int ret, i;

	if (unlikely(vma->vm_mm != alloc->mm)) {
		ret = -EINVAL;
		failure_string = "invalid vma->vm_mm";
		goto err_invalid_mm;
	}

	mutex_lock(&binder_alloc_mmap_lock);
	if (alloc->buffer_size) {
		ret = -EBUSY;
		failure_string = "already mapped";
		goto err_already_mapped;
	}
	alloc->buffer_size = min_t(unsigned long, vma->vm_end - vma->vm_start,
				   SZ_4M);
	mutex_unlock(&binder_alloc_mmap_lock);

	alloc->buffer = vma->vm_start;

	alloc->pages = kvcalloc(alloc->buffer_size / PAGE_SIZE,
				sizeof(alloc->pages[0]),
				GFP_KERNEL);
	if (alloc->pages == NULL) {
		ret = -ENOMEM;
		failure_string = "alloc page array";
		goto err_alloc_pages_failed;
	}

	for (i = 0; i < alloc->buffer_size / PAGE_SIZE; i++) {
		alloc->pages[i].alloc = alloc;
		INIT_LIST_HEAD(&alloc->pages[i].lru);
	}

	buffer = kzalloc(sizeof(*buffer), GFP_KERNEL);
	if (!buffer) {
		ret = -ENOMEM;
		failure_string = "alloc buffer struct";
		goto err_alloc_buf_struct_failed;
	}

	buffer->user_data = alloc->buffer;
	list_add(&buffer->entry, &alloc->buffers);
	buffer->free = 1;
	binder_insert_free_buffer(alloc, buffer);
	alloc->free_async_space = alloc->buffer_size / 2;

	/* Signal binder_alloc is fully initialized */
	binder_alloc_set_vma(alloc, vma);

	return 0;

err_alloc_buf_struct_failed:
	kvfree(alloc->pages);
	alloc->pages = NULL;
err_alloc_pages_failed:
	alloc->buffer = 0;
	mutex_lock(&binder_alloc_mmap_lock);
	alloc->buffer_size = 0;
err_already_mapped:
	mutex_unlock(&binder_alloc_mmap_lock);
err_invalid_mm:
	binder_alloc_debug(BINDER_DEBUG_USER_ERROR,
			   "%s: %d %lx-%lx %s failed %d\n", __func__,
			   alloc->pid, vma->vm_start, vma->vm_end,
			   failure_string, ret);
	return ret;
}


void binder_alloc_deferred_release(struct binder_alloc *alloc)
{
	struct rb_node *n;
	int buffers, page_count;
	struct binder_buffer *buffer;

	buffers = 0;
	spin_lock(&alloc->lock);
	BUG_ON(alloc->vma);

	while ((n = rb_first(&alloc->allocated_buffers))) {
		buffer = rb_entry(n, struct binder_buffer, rb_node);

		/* Transaction should already have been freed */
		BUG_ON(buffer->transaction);

		if (buffer->clear_on_free) {
			binder_alloc_clear_buf(alloc, buffer);
			buffer->clear_on_free = false;
		}
		binder_free_buf_locked(alloc, buffer);
		buffers++;
	}

	while (!list_empty(&alloc->buffers)) {
		buffer = list_first_entry(&alloc->buffers,
					  struct binder_buffer, entry);
		WARN_ON(!buffer->free);

		list_del(&buffer->entry);
		WARN_ON_ONCE(!list_empty(&alloc->buffers));
		kfree(buffer);
	}

	page_count = 0;
	if (alloc->pages) {
		int i;

		for (i = 0; i < alloc->buffer_size / PAGE_SIZE; i++) {
			bool on_lru;

			if (!alloc->pages[i].page_ptr)
				continue;

			on_lru = list_lru_del_obj(&binder_freelist,
						  &alloc->pages[i].lru);
			binder_alloc_debug(BINDER_DEBUG_BUFFER_ALLOC,
				     "%s: %d: page %d %s\n",
				     __func__, alloc->pid, i,
				     on_lru ? "on lru" : "active");
			__free_page(alloc->pages[i].page_ptr);
			page_count++;
		}
	}
	spin_unlock(&alloc->lock);
	kvfree(alloc->pages);
	if (alloc->mm)
		mmdrop(alloc->mm);

	binder_alloc_debug(BINDER_DEBUG_OPEN_CLOSE,
		     "%s: %d buffers %d, pages %d\n",
		     __func__, alloc->pid, buffers, page_count);
}

/**
 * binder_alloc_print_allocated() - print buffer info
 * @m:     seq_file for output via seq_printf()
 * @alloc: binder_alloc for this proc
 *
 * Prints information about every buffer associated with
 * the binder_alloc state to the given seq_file
 */
void binder_alloc_print_allocated(struct seq_file *m,
				  struct binder_alloc *alloc)
{
	struct binder_buffer *buffer;
	struct rb_node *n;

	spin_lock(&alloc->lock);
	for (n = rb_first(&alloc->allocated_buffers); n; n = rb_next(n)) {
		buffer = rb_entry(n, struct binder_buffer, rb_node);
		seq_printf(m, "  buffer %d: %lx size %zd:%zd:%zd %s\n",
			   buffer->debug_id,
			   buffer->user_data - alloc->buffer,
			   buffer->data_size, buffer->offsets_size,
			   buffer->extra_buffers_size,
			   buffer->transaction ? "active" : "delivered");
	}
	spin_unlock(&alloc->lock);
}

/**
 * binder_alloc_print_pages() - print page usage
 * @m:     seq_file for output via seq_printf()
 * @alloc: binder_alloc for this proc
 */
void binder_alloc_print_pages(struct seq_file *m,
			      struct binder_alloc *alloc)
{
	struct binder_lru_page *page;
	int i;
	int active = 0;
	int lru = 0;
	int free = 0;

	spin_lock(&alloc->lock);
	/*
	 * Make sure the binder_alloc is fully initialized, otherwise we might
	 * read inconsistent state.
	 */
	if (binder_alloc_get_vma(alloc) != NULL) {
		for (i = 0; i < alloc->buffer_size / PAGE_SIZE; i++) {
			page = &alloc->pages[i];
			if (!page->page_ptr)
				free++;
			else if (list_empty(&page->lru))
				active++;
			else
				lru++;
		}
	}
	spin_unlock(&alloc->lock);
	seq_printf(m, "  pages: %d:%d:%d\n", active, lru, free);
	seq_printf(m, "  pages high watermark: %zu\n", alloc->pages_high);
}

/**
 * binder_alloc_get_allocated_count() - return count of buffers
 * @alloc: binder_alloc for this proc
 *
 * Return: count of allocated buffers
 */
int binder_alloc_get_allocated_count(struct binder_alloc *alloc)
{
	struct rb_node *n;
	int count = 0;

	spin_lock(&alloc->lock);
	for (n = rb_first(&alloc->allocated_buffers); n != NULL; n = rb_next(n))
		count++;
	spin_unlock(&alloc->lock);
	return count;
}


/**
 * binder_alloc_vma_close() - invalidate address space
 * @alloc: binder_alloc for this proc
 *
 * Called from binder_vma_close() when releasing address space.
 * Clears alloc->vma to prevent new incoming transactions from
 * allocating more buffers.
 */
void binder_alloc_vma_close(struct binder_alloc *alloc)
{
	binder_alloc_set_vma(alloc, NULL);
}

/**
 * binder_alloc_free_page() - shrinker callback to free pages
 * @item:   item to free
 * @lock:   lock protecting the item
 * @cb_arg: callback argument
 *
 * Called from list_lru_walk() in binder_shrink_scan() to free
 * up pages when the system is under memory pressure.
 */
enum lru_status binder_alloc_free_page(struct list_head *item,
				       struct list_lru_one *lru,
				       spinlock_t *lock,
				       void *cb_arg)
	__must_hold(lock)
{
	struct binder_lru_page *page = container_of(item, typeof(*page), lru);
	struct binder_alloc *alloc = page->alloc;
	struct mm_struct *mm = alloc->mm;
	struct vm_area_struct *vma;
	struct page *page_to_free;
	unsigned long page_addr;
	size_t index;

	if (!mmget_not_zero(mm))
		goto err_mmget;
	if (!mmap_read_trylock(mm))
		goto err_mmap_read_lock_failed;
	if (!spin_trylock(&alloc->lock))
		goto err_get_alloc_lock_failed;
	if (!page->page_ptr)
		goto err_page_already_freed;

	index = page - alloc->pages;
	page_addr = alloc->buffer + index * PAGE_SIZE;

	vma = vma_lookup(mm, page_addr);
	if (vma && vma != binder_alloc_get_vma(alloc))
		goto err_invalid_vma;

	trace_binder_unmap_kernel_start(alloc, index);

	page_to_free = page->page_ptr;
	page->page_ptr = NULL;

	trace_binder_unmap_kernel_end(alloc, index);

	list_lru_isolate(lru, item);
	spin_unlock(&alloc->lock);
	spin_unlock(lock);

	if (vma) {
		trace_binder_unmap_user_start(alloc, index);

		zap_page_range_single(vma, page_addr, PAGE_SIZE, NULL);

		trace_binder_unmap_user_end(alloc, index);
	}

	mmap_read_unlock(mm);
	mmput_async(mm);
	__free_page(page_to_free);

	spin_lock(lock);
	return LRU_REMOVED_RETRY;

err_invalid_vma:
err_page_already_freed:
	spin_unlock(&alloc->lock);
err_get_alloc_lock_failed:
	mmap_read_unlock(mm);
err_mmap_read_lock_failed:
	mmput_async(mm);
err_mmget:
	return LRU_SKIP;
}

static unsigned long
binder_shrink_count(struct shrinker *shrink, struct shrink_control *sc)
{
	return list_lru_count(&binder_freelist);
}

static unsigned long
binder_shrink_scan(struct shrinker *shrink, struct shrink_control *sc)
{
	return list_lru_walk(&binder_freelist, binder_alloc_free_page,
			    NULL, sc->nr_to_scan);
}

static struct shrinker *binder_shrinker;

/**
 * binder_alloc_init() - called by binder_open() for per-proc initialization
 * @alloc: binder_alloc for this proc
 *
 * Called from binder_open() to initialize binder_alloc fields for
 * new binder proc
 */
void binder_alloc_init(struct binder_alloc *alloc)
{
	alloc->pid = current->group_leader->pid;
	alloc->mm = current->mm;
	mmgrab(alloc->mm);
	spin_lock_init(&alloc->lock);
	INIT_LIST_HEAD(&alloc->buffers);
}

int binder_alloc_shrinker_init(void)
{
	int ret;

	ret = list_lru_init(&binder_freelist);
	if (ret)
		return ret;

	binder_shrinker = shrinker_alloc(0, "android-binder");
	if (!binder_shrinker) {
		list_lru_destroy(&binder_freelist);
		return -ENOMEM;
	}

	binder_shrinker->count_objects = binder_shrink_count;
	binder_shrinker->scan_objects = binder_shrink_scan;

	shrinker_register(binder_shrinker);

	return 0;
}

void binder_alloc_shrinker_exit(void)
{
	shrinker_free(binder_shrinker);
	list_lru_destroy(&binder_freelist);
}

/**
 * check_buffer() - verify that buffer/offset is safe to access
 * @alloc: binder_alloc for this proc
 * @buffer: binder buffer to be accessed
 * @offset: offset into @buffer data
 * @bytes: bytes to access from offset
 *
 * Check that the @offset/@bytes are within the size of the given
 * @buffer and that the buffer is currently active and not freeable.
 * Offsets must also be multiples of sizeof(u32). The kernel is
 * allowed to touch the buffer in two cases:
 *
 * 1) when the buffer is being created:
 *     (buffer->free == 0 && buffer->allow_user_free == 0)
 * 2) when the buffer is being torn down:
 *     (buffer->free == 0 && buffer->transaction == NULL).
 *
 * Return: true if the buffer is safe to access
 */
static inline bool check_buffer(struct binder_alloc *alloc,
				struct binder_buffer *buffer,
				binder_size_t offset, size_t bytes)
{
	size_t buffer_size = binder_alloc_buffer_size(alloc, buffer);

	return buffer_size >= bytes &&
		offset <= buffer_size - bytes &&
		IS_ALIGNED(offset, sizeof(u32)) &&
		!buffer->free &&
		(!buffer->allow_user_free || !buffer->transaction);
}

/**
 * binder_alloc_copy_user_to_buffer() - copy src user to tgt user
 * @alloc: binder_alloc for this proc
 * @buffer: binder buffer to be accessed
 * @buffer_offset: offset into @buffer data
 * @from: userspace pointer to source buffer
 * @bytes: bytes to copy
 *
 * Copy bytes from source userspace to target buffer.
 *
 * Return: bytes remaining to be copied
 */
unsigned long
binder_alloc_copy_user_to_buffer(struct binder_alloc *alloc,
				 struct binder_buffer *buffer,
				 binder_size_t buffer_offset,
				 const void __user *from,
				 size_t bytes)
{
	if (!check_buffer(alloc, buffer, buffer_offset, bytes))
		return bytes;

	while (bytes) {
		unsigned long size;
		unsigned long ret;
		struct page *page;
		pgoff_t pgoff;
		void *kptr;

		page = binder_alloc_get_page(alloc, buffer,
					     buffer_offset, &pgoff);
		size = min_t(size_t, bytes, PAGE_SIZE - pgoff);
		kptr = kmap_local_page(page) + pgoff;
		ret = copy_from_user(kptr, from, size);
		kunmap_local(kptr);
		if (ret)
			return bytes - size + ret;
		bytes -= size;
		from += size;
		buffer_offset += size;
	}
	return 0;
}

static int binder_alloc_do_buffer_copy(struct binder_alloc *alloc,
				       bool to_buffer,
				       struct binder_buffer *buffer,
				       binder_size_t buffer_offset,
				       void *ptr,
				       size_t bytes)
{
	/* All copies must be 32-bit aligned and 32-bit size */
	if (!check_buffer(alloc, buffer, buffer_offset, bytes))
		return -EINVAL;

	while (bytes) {
		unsigned long size;
		struct page *page;
		pgoff_t pgoff;

		page = binder_alloc_get_page(alloc, buffer,
					     buffer_offset, &pgoff);
		size = min_t(size_t, bytes, PAGE_SIZE - pgoff);
		if (to_buffer)
			memcpy_to_page(page, pgoff, ptr, size);
		else
			memcpy_from_page(ptr, page, pgoff, size);
		bytes -= size;
		pgoff = 0;
		ptr = ptr + size;
		buffer_offset += size;
	}
	return 0;
}

int binder_alloc_copy_to_buffer(struct binder_alloc *alloc,
				struct binder_buffer *buffer,
				binder_size_t buffer_offset,
				void *src,
				size_t bytes)
{
	return binder_alloc_do_buffer_copy(alloc, true, buffer, buffer_offset,
					   src, bytes);
}

int binder_alloc_copy_from_buffer(struct binder_alloc *alloc,
				  void *dest,
				  struct binder_buffer *buffer,
				  binder_size_t buffer_offset,
				  size_t bytes)
{
	return binder_alloc_do_buffer_copy(alloc, false, buffer, buffer_offset,
					   dest, bytes);
}
    `,
  },
  { 
    language: 'go',
    code: `
    package core

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/containerd/containerd/content"
	"github.com/containerd/containerd/images"
	"github.com/containerd/containerd/pkg/transfer/archive"
	"github.com/containerd/platforms"
	"github.com/distribution/reference"
	"github.com/moby/buildkit/client/llb"
	"github.com/moby/buildkit/client/llb/sourceresolver"
	"github.com/moby/buildkit/exporter/containerimage/exptypes"
	"github.com/moby/buildkit/frontend/dockerui"
	bkgw "github.com/moby/buildkit/frontend/gateway/client"
	"github.com/moby/buildkit/identity"
	"github.com/moby/buildkit/solver/pb"
	"github.com/moby/buildkit/util/leaseutil"
	"github.com/opencontainers/go-digest"
	specs "github.com/opencontainers/image-spec/specs-go/v1"
	"github.com/pkg/errors"
	"github.com/vektah/gqlparser/v2/ast"

	"github.com/dagger/dagger/dagql"
	"github.com/dagger/dagger/dagql/call"
	"github.com/dagger/dagger/engine/buildkit"
)

type DefaultTerminalCmdOpts struct {
	Args []string

	// Provide dagger access to the executed command
	// Do not use this option unless you trust the command being executed.
	// The command being executed WILL BE GRANTED FULL ACCESS TO YOUR HOST FILESYSTEM
	ExperimentalPrivilegedNesting dagql.Optional[dagql.Boolean] default:"false

	// Grant the process all root capabilities
	InsecureRootCapabilities dagql.Optional[dagql.Boolean] default:"false
}

type ContainerAnnotation struct {
	Key   string :"key
	Value string :"value
}

// Container is a content-addressed container.
type Container struct {
	Query *Query

	// The container's root filesystem.
	FS *pb.Definition :"fs

	// Image configuration (env, workdir, etc)
	Config specs.ImageConfig :"cfg

	// List of GPU devices that will be exposed to the container
	EnabledGPUs []string :"enabledGPUs,omitempty

	// Mount points configured for the container.
	Mounts ContainerMounts :"mounts,omitempty

	// Meta is the /dagger filesystem. It will be null if nothing has run yet.
	Meta *pb.Definition :"meta,omitempty

	// The platform of the container's rootfs.
	Platform Platform :"platform,omitempty

	// OCI annotations
	Annotations []ContainerAnnotation :"annotations,omitempty

	// Secrets to expose to the container.
	Secrets []ContainerSecret :"secret_env,omitempty

	// Sockets to expose to the container.
	Sockets []ContainerSocket :"sockets,omitempty

	// Image reference
	ImageRef string :"image_ref,omitempty

	// Ports to expose from the container.
	Ports []Port :"ports,omitempty

	// Services to start before running the container.
	Services ServiceBindings :"services,omitempty

	// Focused indicates whether subsequent operations will be
	// focused, i.e. shown more prominently in the UI.
	Focused bool :"focused

	// The args to invoke when using the terminal api on this container.
	DefaultTerminalCmd DefaultTerminalCmdOpts :"defaultTerminalCmd,omitempty

	// (Internal-only for now) Environment variables from the engine container, prefixed
	// with a special value, that will be inherited by this container if set.
	SystemEnvNames []string :"system_envs,omitempty
}

func (*Container) Type() *ast.Type {
	return &ast.Type{
		NamedType: "Container",
		NonNull:   true,
	}
}

func (*Container) TypeDescription() string {
	return "An OCI-compatible container, also known as a Docker container."
}

var _ HasPBDefinitions = (*Container)(nil)

func (container *Container) PBDefinitions(ctx context.Context) ([]*pb.Definition, error) {
	var defs []*pb.Definition
	if container.FS != nil {
		defs = append(defs, container.FS)
	}
	for _, mnt := range container.Mounts {
		if mnt.Source != nil {
			defs = append(defs, mnt.Source)
		}
	}
	for _, bnd := range container.Services {
		ctr := bnd.Service.Container
		if ctr == nil {
			continue
		}
		ctrDefs, err := ctr.PBDefinitions(ctx)
		if err != nil {
			return nil, err
		}
		defs = append(defs, ctrDefs...)
	}
	return defs, nil
}

func NewContainer(root *Query, platform Platform) (*Container, error) {
	if root == nil {
		panic("query must be non-nil")
	}
	return &Container{
		Query:    root,
		Platform: platform,
	}, nil
}

// Clone returns a deep copy of the container suitable for modifying in a
// WithXXX method.
func (container *Container) Clone() *Container {
	cp := *container
	cp.Config.ExposedPorts = cloneMap(cp.Config.ExposedPorts)
	cp.Config.Env = cloneSlice(cp.Config.Env)
	cp.Config.Entrypoint = cloneSlice(cp.Config.Entrypoint)
	cp.Config.Cmd = cloneSlice(cp.Config.Cmd)
	cp.Config.Volumes = cloneMap(cp.Config.Volumes)
	cp.Config.Labels = cloneMap(cp.Config.Labels)
	cp.Mounts = cloneSlice(cp.Mounts)
	cp.Secrets = cloneSlice(cp.Secrets)
	cp.Sockets = cloneSlice(cp.Sockets)
	cp.Ports = cloneSlice(cp.Ports)
	cp.Services = cloneSlice(cp.Services)
	cp.SystemEnvNames = cloneSlice(cp.SystemEnvNames)
	return &cp
}

// Ownership contains a UID/GID pair resolved from a user/group name or ID pair
// provided via the API. It primarily exists to distinguish an unspecified
// ownership from UID/GID 0 (root) ownership.
type Ownership struct {
	UID int :"uid
	GID int :"gid
}

func (owner Ownership) Opt() llb.ChownOption {
	return llb.WithUIDGID(owner.UID, owner.GID)
}

// ContainerSecret configures a secret to expose, either as an environment
// variable or mounted to a file path.
type ContainerSecret struct {
	Secret    *Secret     :"secret
	EnvName   string      :"env,omitempty
	MountPath string      :"path,omitempty
	Owner     *Ownership  :"owner,omitempty
	Mode      fs.FileMode :"mode,omitempty
}

// ContainerSocket configures a socket to expose, currently as a Unix socket,
// but potentially as a TCP or UDP address in the future.
type ContainerSocket struct {
	Source        *Socket    :"socket
	ContainerPath string     :"container_path,omitempty
	Owner         *Ownership :"owner,omitempty
}

// FSState returns the container's root filesystem mount state. If there is
// none (as with an empty container ID), it returns scratch.
func (container *Container) FSState() (llb.State, error) {
	if container.FS == nil {
		return llb.Scratch(), nil
	}

	return defToState(container.FS)
}

// MetaState returns the container's metadata mount state. If the container has
// yet to run, it returns nil.
func (container *Container) MetaState() (*llb.State, error) {
	if container.Meta == nil {
		return nil, nil
	}

	metaSt, err := defToState(container.Meta)
	if err != nil {
		return nil, err
	}

	return &metaSt, nil
}

// ContainerMount is a mount point configured in a container.
type ContainerMount struct {
	// The source of the mount.
	Source *pb.Definition :"source,omitempty

	// A path beneath the source to scope the mount to.
	SourcePath string :"source_path,omitempty

	// The path of the mount within the container.
	Target string :"target

	// Persist changes to the mount under this cache ID.
	CacheVolumeID string :"cache_volume_id,omitempty

	// How to share the cache across concurrent runs.
	CacheSharingMode CacheSharingMode :"cache_sharing,omitempty

	// Configure the mount as a tmpfs.
	Tmpfs bool :"tmpfs,omitempty

	// Configure the size of the mounted tmpfs in bytes
	Size int :"size,omitempty

	// Configure the mount as read-only.
	Readonly bool :"readonly,omitempty
}

// SourceState returns the state of the source of the mount.
func (mnt ContainerMount) SourceState() (llb.State, error) {
	if mnt.Source == nil {
		return llb.Scratch(), nil
	}

	return defToState(mnt.Source)
}

type ContainerMounts []ContainerMount

func (mnts ContainerMounts) With(newMnt ContainerMount) ContainerMounts {
	mntsCp := make(ContainerMounts, 0, len(mnts))

	// NB: this / might need to change on Windows, but I'm not even sure how
	// mounts work on Windows, so...
	parent := newMnt.Target + "/"

	for _, mnt := range mnts {
		if mnt.Target == newMnt.Target || strings.HasPrefix(mnt.Target, parent) {
			continue
		}

		mntsCp = append(mntsCp, mnt)
	}

	mntsCp = append(mntsCp, newMnt)

	return mntsCp
}

func (container *Container) From(ctx context.Context, addr string) (*Container, error) {
	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buildkit client: %w", err)
	}

	container = container.Clone()

	platform := container.Platform

	refName, err := reference.ParseNormalizedNamed(addr)
	if err != nil {
		return nil, err
	}

	ref := reference.TagNameOnly(refName).String()

	_, digest, cfgBytes, err := bk.ResolveImageConfig(ctx, ref, sourceresolver.Opt{
		Platform: ptr(platform.Spec()),
		ImageOpt: &sourceresolver.ResolveImageOpt{
			ResolveMode: llb.ResolveModeDefault.String(),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to resolve image %s: %w", ref, err)
	}

	digested, err := reference.WithDigest(refName, digest)
	if err != nil {
		return nil, err
	}

	var imgSpec specs.Image
	if err := json.Unmarshal(cfgBytes, &imgSpec); err != nil {
		return nil, err
	}

	fsSt := llb.Image(
		digested.String(),
		llb.WithCustomNamef("pull %s", ref),
	)

	def, err := fsSt.Marshal(ctx, llb.Platform(platform.Spec()))
	if err != nil {
		return nil, err
	}

	container.FS = def.ToPB()

	container.Config = mergeImageConfig(container.Config, imgSpec.Config)
	container.ImageRef = digested.String()
	container.Platform = Platform(platforms.Normalize(imgSpec.Platform))

	return container, nil
}

const defaultDockerfileName = "Dockerfile"

func (container *Container) Build(
	ctx context.Context,
	contextDir *Directory,
	dockerfile string,
	buildArgs []BuildArg,
	target string,
	secrets []*Secret,
	secretStore *SecretStore,
) (*Container, error) {
	container = container.Clone()

	container.Services.Merge(contextDir.Services)

	secretNameToLLBID := make(map[string]string)
	for _, secret := range secrets {
		secretName, ok := secretStore.GetSecretName(secret.IDDigest)
		if !ok {
			return nil, fmt.Errorf("secret not found: %s", secret.IDDigest)
		}
		container.Secrets = append(container.Secrets, ContainerSecret{
			Secret:    secret,
			MountPath: fmt.Sprintf("/run/secrets/%s", secretName),
		})
		secretNameToLLBID[secretName] = secret.IDDigest.String()
	}

	// set image ref to empty string
	container.ImageRef = ""

	svcs, err := container.Query.Services(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buildkit client: %w", err)
	}

	detach, _, err := svcs.StartBindings(ctx, container.Services)
	if err != nil {
		return nil, err
	}
	defer detach()

	platform := container.Platform

	opts := map[string]string{
		"platform":      platform.Format(),
		"contextsubdir": contextDir.Dir,
	}

	if dockerfile != "" {
		opts["filename"] = path.Join(contextDir.Dir, dockerfile)
	} else {
		opts["filename"] = path.Join(contextDir.Dir, defaultDockerfileName)
	}

	if target != "" {
		opts["target"] = target
	}

	for _, buildArg := range buildArgs {
		opts["build-arg:"+buildArg.Name] = buildArg.Value
	}

	inputs := map[string]*pb.Definition{
		dockerui.DefaultLocalNameContext:    contextDir.LLB,
		dockerui.DefaultLocalNameDockerfile: contextDir.LLB,
	}

	// FIXME: ew, this is a terrible way to pass this around
	//nolint:staticcheck
	solveCtx := context.WithValue(ctx, "secret-translator", func(name string) (string, error) {
		llbID, ok := secretNameToLLBID[name]
		if !ok {
			return "", fmt.Errorf("secret not found: %s", name)
		}
		return llbID, nil
	})

	res, err := bk.Solve(solveCtx, bkgw.SolveRequest{
		Frontend:       "dockerfile.v0",
		FrontendOpt:    opts,
		FrontendInputs: inputs,
	})
	if err != nil {
		return nil, err
	}

	bkref, err := res.SingleRef()
	if err != nil {
		return nil, err
	}

	var st llb.State
	if bkref == nil {
		st = llb.Scratch()
	} else {
		st, err = bkref.ToState()
		if err != nil {
			return nil, err
		}
	}

	def, err := st.Marshal(ctx, llb.Platform(platform.Spec()))
	if err != nil {
		return nil, err
	}

	container.FS = def.ToPB()
	container.FS.Source = nil

	cfgBytes, found := res.Metadata[exptypes.ExporterImageConfigKey]
	if found {
		var imgSpec specs.Image
		if err := json.Unmarshal(cfgBytes, &imgSpec); err != nil {
			return nil, err
		}

		container.Config = mergeImageConfig(container.Config, imgSpec.Config)
	}

	return container, nil
}

func (container *Container) RootFS(ctx context.Context) (*Directory, error) {
	return &Directory{
		Query:    container.Query,
		LLB:      container.FS,
		Dir:      "/",
		Platform: container.Platform,
		Services: container.Services,
	}, nil
}

func (container *Container) WithRootFS(ctx context.Context, dir *Directory) (*Container, error) {
	container = container.Clone()

	dirSt, err := dir.StateWithSourcePath()
	if err != nil {
		return nil, err
	}

	def, err := dirSt.Marshal(ctx, llb.Platform(dir.Platform.Spec()))
	if err != nil {
		return nil, err
	}

	container.FS = def.ToPB()

	container.Services.Merge(dir.Services)

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) WithDirectory(ctx context.Context, subdir string, src *Directory, filter CopyFilter, owner string) (*Container, error) {
	container = container.Clone()

	return container.writeToPath(ctx, subdir, func(dir *Directory) (*Directory, error) {
		ownership, err := container.ownership(ctx, owner)
		if err != nil {
			return nil, err
		}

		return dir.WithDirectory(ctx, ".", src, filter, ownership)
	})
}

func (container *Container) WithFile(ctx context.Context, destPath string, src *File, permissions *int, owner string) (*Container, error) {
	container = container.Clone()

	return container.writeToPath(ctx, path.Dir(destPath), func(dir *Directory) (*Directory, error) {
		ownership, err := container.ownership(ctx, owner)
		if err != nil {
			return nil, err
		}

		return dir.WithFile(ctx, path.Base(destPath), src, permissions, ownership)
	})
}

func (container *Container) WithoutPaths(ctx context.Context, destPaths ...string) (*Container, error) {
	container = container.Clone()

	for _, destPath := range destPaths {
		var err error
		container, err = container.writeToPath(ctx, path.Dir(destPath), func(dir *Directory) (*Directory, error) {
			return dir.Without(ctx, path.Base(destPath))
		})
		if err != nil {
			return nil, err
		}
	}
	return container, nil
}

func (container *Container) WithFiles(ctx context.Context, destDir string, src []*File, permissions *int, owner string) (*Container, error) {
	container = container.Clone()

	return container.writeToPath(ctx, path.Dir(destDir), func(dir *Directory) (*Directory, error) {
		ownership, err := container.ownership(ctx, owner)
		if err != nil {
			return nil, err
		}

		return dir.WithFiles(ctx, path.Base(destDir), src, permissions, ownership)
	})
}

func (container *Container) WithNewFile(ctx context.Context, dest string, content []byte, permissions fs.FileMode, owner string) (*Container, error) {
	container = container.Clone()

	dir, file := filepath.Split(dest)
	return container.writeToPath(ctx, dir, func(dir *Directory) (*Directory, error) {
		ownership, err := container.ownership(ctx, owner)
		if err != nil {
			return nil, err
		}

		return dir.WithNewFile(ctx, file, content, permissions, ownership)
	})
}

func (container *Container) WithMountedDirectory(ctx context.Context, target string, dir *Directory, owner string, readonly bool) (*Container, error) {
	container = container.Clone()

	return container.withMounted(ctx, target, dir.LLB, dir.Dir, dir.Services, owner, readonly)
}

func (container *Container) WithMountedFile(ctx context.Context, target string, file *File, owner string, readonly bool) (*Container, error) {
	container = container.Clone()

	return container.withMounted(ctx, target, file.LLB, file.File, file.Services, owner, readonly)
}

var SeenCacheKeys = new(sync.Map)

func (container *Container) WithMountedCache(ctx context.Context, target string, cache *CacheVolume, source *Directory, sharingMode CacheSharingMode, owner string) (*Container, error) {
	container = container.Clone()

	target = absPath(container.Config.WorkingDir, target)

	if sharingMode == "" {
		sharingMode = CacheSharingModeShared
	}

	mount := ContainerMount{
		Target:           target,
		CacheVolumeID:    cache.Sum(),
		CacheSharingMode: sharingMode,
	}

	if source != nil {
		mount.Source = source.LLB
		mount.SourcePath = source.Dir
	}

	if owner != "" {
		var err error
		mount.Source, mount.SourcePath, err = container.chown(
			ctx,
			mount.Source,
			mount.SourcePath,
			owner,
			llb.Platform(container.Platform.Spec()),
		)
		if err != nil {
			return nil, err
		}
	}

	container.Mounts = container.Mounts.With(mount)

	// set image ref to empty string
	container.ImageRef = ""

	SeenCacheKeys.Store(cache.Keys[0], struct{}{})

	return container, nil
}

func (container *Container) WithMountedTemp(ctx context.Context, target string, size int) (*Container, error) {
	container = container.Clone()

	target = absPath(container.Config.WorkingDir, target)

	container.Mounts = container.Mounts.With(ContainerMount{
		Target: target,
		Tmpfs:  true,
		Size:   size,
	})

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) WithMountedSecret(ctx context.Context, target string, source *Secret, owner string, mode fs.FileMode) (*Container, error) {
	container = container.Clone()

	target = absPath(container.Config.WorkingDir, target)

	ownership, err := container.ownership(ctx, owner)
	if err != nil {
		return nil, err
	}

	container.Secrets = append(container.Secrets, ContainerSecret{
		Secret:    source,
		MountPath: target,
		Owner:     ownership,
		Mode:      mode,
	})

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) WithoutMount(ctx context.Context, target string) (*Container, error) {
	container = container.Clone()

	target = absPath(container.Config.WorkingDir, target)

	var found bool
	var foundIdx int
	for i := len(container.Mounts) - 1; i >= 0; i-- {
		if container.Mounts[i].Target == target {
			found = true
			foundIdx = i
			break
		}
	}

	if found {
		container.Mounts = append(container.Mounts[:foundIdx], container.Mounts[foundIdx+1:]...)
	}

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) MountTargets(ctx context.Context) ([]string, error) {
	mounts := []string{}
	for _, mnt := range container.Mounts {
		mounts = append(mounts, mnt.Target)
	}

	return mounts, nil
}

func (container *Container) WithUnixSocket(ctx context.Context, target string, source *Socket, owner string) (*Container, error) {
	container = container.Clone()

	target = absPath(container.Config.WorkingDir, target)

	ownership, err := container.ownership(ctx, owner)
	if err != nil {
		return nil, err
	}

	newSocket := ContainerSocket{
		Source:        source,
		ContainerPath: target,
		Owner:         ownership,
	}

	var replaced bool
	for i, sock := range container.Sockets {
		if sock.ContainerPath == target {
			container.Sockets[i] = newSocket
			replaced = true
			break
		}
	}

	if !replaced {
		container.Sockets = append(container.Sockets, newSocket)
	}

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) WithoutUnixSocket(ctx context.Context, target string) (*Container, error) {
	container = container.Clone()

	target = absPath(container.Config.WorkingDir, target)

	for i, sock := range container.Sockets {
		if sock.ContainerPath == target {
			container.Sockets = append(container.Sockets[:i], container.Sockets[i+1:]...)
			break
		}
	}

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) WithSecretVariable(ctx context.Context, name string, secret *Secret) (*Container, error) {
	container = container.Clone()

	container.Secrets = append(container.Secrets, ContainerSecret{
		Secret:  secret,
		EnvName: name,
	})

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) WithoutSecretVariable(ctx context.Context, name string) (*Container, error) {
	container = container.Clone()

	for i, secret := range container.Secrets {
		if secret.EnvName == name {
			container.Secrets = append(container.Secrets[:i], container.Secrets[i+1:]...)
			break
		}
	}

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) Directory(ctx context.Context, dirPath string) (*Directory, error) {
	dir, _, err := locatePath(container, dirPath, NewDirectory)
	if err != nil {
		return nil, err
	}

	svcs, err := container.Query.Services(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buildkit client: %w", err)
	}

	// check that the directory actually exists so the user gets an error earlier
	// rather than when the dir is used
	info, err := dir.Stat(ctx, bk, svcs, ".")
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		return nil, fmt.Errorf("path %s is a file, not a directory", dirPath)
	}

	return dir, nil
}

func (container *Container) File(ctx context.Context, filePath string) (*File, error) {
	file, _, err := locatePath(container, filePath, NewFile)
	if err != nil {
		return nil, err
	}

	// check that the file actually exists so the user gets an error earlier
	// rather than when the file is used
	info, err := file.Stat(ctx)
	if err != nil {
		return nil, err
	}

	if info.IsDir() {
		return nil, fmt.Errorf("path %s is a directory, not a file", filePath)
	}

	return file, nil
}

func locatePath[T *File | *Directory](
	container *Container,
	containerPath string,
	init func(*Query, *pb.Definition, string, Platform, ServiceBindings) T,
) (T, *ContainerMount, error) {
	containerPath = absPath(container.Config.WorkingDir, containerPath)

	// NB(vito): iterate in reverse order so we'll find deeper mounts first
	for i := len(container.Mounts) - 1; i >= 0; i-- {
		mnt := container.Mounts[i]

		if containerPath == mnt.Target || strings.HasPrefix(containerPath, mnt.Target+"/") {
			if mnt.Tmpfs {
				return nil, nil, fmt.Errorf("%s: cannot retrieve path from tmpfs", containerPath)
			}

			if mnt.CacheVolumeID != "" {
				return nil, nil, fmt.Errorf("%s: cannot retrieve path from cache", containerPath)
			}

			sub := mnt.SourcePath
			if containerPath != mnt.Target {
				// make relative portion relative to the source path
				dirSub := strings.TrimPrefix(containerPath, mnt.Target+"/")
				if dirSub != "" {
					sub = path.Join(sub, dirSub)
				}
			}

			return init(
				container.Query,
				mnt.Source,
				sub,
				container.Platform,
				container.Services,
			), &mnt, nil
		}
	}

	// Not found in a mount
	return init(
		container.Query,
		container.FS,
		containerPath,
		container.Platform,
		container.Services,
	), nil, nil
}

func (container *Container) withMounted(
	ctx context.Context,
	target string,
	srcDef *pb.Definition,
	srcPath string,
	svcs ServiceBindings,
	owner string,
	readonly bool,
) (*Container, error) {
	target = absPath(container.Config.WorkingDir, target)

	var err error
	if owner != "" {
		srcDef, srcPath, err = container.chown(ctx, srcDef, srcPath, owner, llb.Platform(container.Platform.Spec()))
		if err != nil {
			return nil, err
		}
	}

	container.Mounts = container.Mounts.With(ContainerMount{
		Source:     srcDef,
		SourcePath: srcPath,
		Target:     target,
		Readonly:   readonly,
	})

	container.Services.Merge(svcs)

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) chown(
	ctx context.Context,
	srcDef *pb.Definition,
	srcPath string,
	owner string,
	opts ...llb.ConstraintsOpt,
) (*pb.Definition, string, error) {
	ownership, err := container.ownership(ctx, owner)
	if err != nil {
		return nil, "", err
	}

	if ownership == nil {
		return srcDef, srcPath, nil
	}

	var srcSt llb.State
	if srcDef == nil {
		// e.g. empty cache mount
		srcSt = llb.Scratch().File(
			llb.Mkdir("/chown", 0o755, ownership.Opt()),
		)

		srcPath = "/chown"
	} else {
		srcSt, err = defToState(srcDef)
		if err != nil {
			return nil, "", err
		}

		def, err := srcSt.Marshal(ctx, opts...)
		if err != nil {
			return nil, "", err
		}

		bk, err := container.Query.Buildkit(ctx)
		if err != nil {
			return nil, "", fmt.Errorf("failed to get buildkit client: %w", err)
		}
		ref, err := bkRef(ctx, bk, def.ToPB())
		if err != nil {
			return nil, "", err
		}

		stat, err := ref.StatFile(ctx, bkgw.StatRequest{
			Path: srcPath,
		})
		if err != nil {
			return nil, "", err
		}

		if stat.IsDir() {
			chowned := "/chown"

			// NB(vito): need to create intermediate directory with correct ownership
			// to handle the directory case, otherwise the mount will be owned by
			// root
			srcSt = llb.Scratch().File(
				llb.Mkdir(chowned, os.FileMode(stat.Mode), ownership.Opt()).
					Copy(srcSt, srcPath, chowned, &llb.CopyInfo{
						CopyDirContentsOnly: true,
					}, ownership.Opt()),
			)

			srcPath = chowned
		} else {
			srcSt = llb.Scratch().File(
				llb.Copy(srcSt, srcPath, ".", ownership.Opt()),
			)

			srcPath = filepath.Base(srcPath)
		}
	}

	def, err := srcSt.Marshal(ctx, opts...)
	if err != nil {
		return nil, "", err
	}

	return def.ToPB(), srcPath, nil
}

func (container *Container) writeToPath(ctx context.Context, subdir string, fn func(dir *Directory) (*Directory, error)) (*Container, error) {
	dir, mount, err := locatePath(container, subdir, NewDirectory)
	if err != nil {
		return nil, err
	}

	dir, err = fn(dir)
	if err != nil {
		return nil, err
	}

	// If not in a mount, replace rootfs
	if mount == nil {
		root, err := dir.Root()
		if err != nil {
			return nil, err
		}

		return container.WithRootFS(ctx, root)
	}

	return container.withMounted(ctx, mount.Target, dir.LLB, mount.SourcePath, nil, "", false)
}

func (container *Container) ImageConfig(ctx context.Context) (specs.ImageConfig, error) {
	return container.Config, nil
}

func (container *Container) UpdateImageConfig(ctx context.Context, updateFn func(specs.ImageConfig) specs.ImageConfig) (*Container, error) {
	container = container.Clone()
	container.Config = updateFn(container.Config)
	return container, nil
}

func (container *Container) WithPipeline(ctx context.Context, name, description string) (*Container, error) {
	container = container.Clone()
	container.Query = container.Query.WithPipeline(name, description)
	return container, nil
}

type ContainerGPUOpts struct {
	Devices []string
}

func (container *Container) WithGPU(ctx context.Context, gpuOpts ContainerGPUOpts) (*Container, error) {
	container = container.Clone()
	container.EnabledGPUs = gpuOpts.Devices
	return container, nil
}

func (container Container) Evaluate(ctx context.Context) (*buildkit.Result, error) {
	if container.FS == nil {
		return nil, nil
	}

	svcs, err := container.Query.Services(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	detach, _, err := svcs.StartBindings(ctx, container.Services)
	if err != nil {
		return nil, err
	}
	defer detach()

	st, err := container.FSState()
	if err != nil {
		return nil, err
	}

	def, err := st.Marshal(ctx, llb.Platform(container.Platform.Spec()))
	if err != nil {
		return nil, err
	}

	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buildkit client: %w", err)
	}
	return bk.Solve(ctx, bkgw.SolveRequest{
		Evaluate:   true,
		Definition: def.ToPB(),
	})
}

func (container *Container) WithAnnotation(ctx context.Context, key, value string) (*Container, error) {
	container = container.Clone()

	container.Annotations = append(container.Annotations, ContainerAnnotation{
		Key:   key,
		Value: value,
	})

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) WithoutAnnotation(ctx context.Context, name string) (*Container, error) {
	container = container.Clone()

	for i, annotation := range container.Annotations {
		if annotation.Key == name {
			container.Annotations = append(container.Annotations[:i], container.Annotations[i+1:]...)
			break
		}
	}

	// set image ref to empty string
	container.ImageRef = ""

	return container, nil
}

func (container *Container) Publish(
	ctx context.Context,
	ref string,
	platformVariants []*Container,
	forcedCompression ImageLayerCompression,
	mediaTypes ImageMediaTypes,
) (string, error) {
	if mediaTypes == "" {
		// Modern registry implementations support oci types and docker daemons
		// have been capable of pulling them since 2018:
		// https://github.com/moby/moby/pull/37359
		// So they are a safe default.
		mediaTypes = OCIMediaTypes
	}

	opts := map[string]string{
		string(exptypes.OptKeyName):     ref,
		string(exptypes.OptKeyPush):     strconv.FormatBool(true),
		string(exptypes.OptKeyOCITypes): strconv.FormatBool(mediaTypes == OCIMediaTypes),
	}
	if forcedCompression != "" {
		opts[string(exptypes.OptKeyLayerCompression)] = strings.ToLower(string(forcedCompression))
		opts[string(exptypes.OptKeyForceCompression)] = strconv.FormatBool(true)
	}

	inputByPlatform := map[string]buildkit.ContainerExport{}
	services := ServiceBindings{}

	variants := append([]*Container{container}, platformVariants...)
	for _, variant := range variants {
		if variant.FS == nil {
			continue
		}
		st, err := variant.FSState()
		if err != nil {
			return "", err
		}
		platformSpec := variant.Platform.Spec()
		def, err := st.Marshal(ctx, llb.Platform(platformSpec))
		if err != nil {
			return "", err
		}

		platformString := variant.Platform.Format()
		if _, ok := inputByPlatform[platformString]; ok {
			return "", fmt.Errorf("duplicate platform %q", platformString)
		}
		inputByPlatform[platformString] = buildkit.ContainerExport{
			Definition: def.ToPB(),
			Config:     variant.Config,
		}

		if len(variants) == 1 {
			// single platform case
			for _, annotation := range variant.Annotations {
				opts[exptypes.AnnotationManifestKey(nil, annotation.Key)] = annotation.Value
				opts[exptypes.AnnotationManifestDescriptorKey(nil, annotation.Key)] = annotation.Value
			}
		} else {
			// multi platform case
			for _, annotation := range variant.Annotations {
				opts[exptypes.AnnotationManifestKey(&platformSpec, annotation.Key)] = annotation.Value
				opts[exptypes.AnnotationManifestDescriptorKey(&platformSpec, annotation.Key)] = annotation.Value
			}
		}

		services.Merge(variant.Services)
	}
	if len(inputByPlatform) == 0 {
		// Could also just ignore and do nothing, airing on side of error until proven otherwise.
		return "", errors.New("no containers to export")
	}

	svcs, err := container.Query.Services(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get services: %w", err)
	}
	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get buildkit client: %w", err)
	}

	detach, _, err := svcs.StartBindings(ctx, services)
	if err != nil {
		return "", err
	}
	defer detach()

	resp, err := bk.PublishContainerImage(ctx, inputByPlatform, opts)
	if err != nil {
		return "", err
	}

	refName, err := reference.ParseNormalizedNamed(ref)
	if err != nil {
		return "", err
	}

	imageDigest, found := resp[exptypes.ExporterImageDigestKey]
	if found {
		dig, err := digest.Parse(imageDigest)
		if err != nil {
			return "", fmt.Errorf("parse digest: %w", err)
		}

		withDig, err := reference.WithDigest(refName, dig)
		if err != nil {
			return "", fmt.Errorf("with digest: %w", err)
		}

		return withDig.String(), nil
	}

	return ref, nil
}

func (container *Container) Export(
	ctx context.Context,
	dest string,
	platformVariants []*Container,
	forcedCompression ImageLayerCompression,
	mediaTypes ImageMediaTypes,
) error {
	svcs, err := container.Query.Services(ctx)
	if err != nil {
		return fmt.Errorf("failed to get services: %w", err)
	}
	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return fmt.Errorf("failed to get buildkit client: %w", err)
	}

	if mediaTypes == "" {
		// Modern registry implementations support oci types and docker daemons
		// have been capable of pulling them since 2018:
		// https://github.com/moby/moby/pull/37359
		// So they are a safe default.
		mediaTypes = OCIMediaTypes
	}

	opts := map[string]string{
		"tar":                           strconv.FormatBool(true),
		string(exptypes.OptKeyOCITypes): strconv.FormatBool(mediaTypes == OCIMediaTypes),
	}
	if forcedCompression != "" {
		opts[string(exptypes.OptKeyLayerCompression)] = strings.ToLower(string(forcedCompression))
		opts[string(exptypes.OptKeyForceCompression)] = strconv.FormatBool(true)
	}

	inputByPlatform := map[string]buildkit.ContainerExport{}
	services := ServiceBindings{}

	variants := append([]*Container{container}, platformVariants...)
	for _, variant := range variants {
		if variant.FS == nil {
			continue
		}
		st, err := variant.FSState()
		if err != nil {
			return err
		}

		platformSpec := variant.Platform.Spec()
		def, err := st.Marshal(ctx, llb.Platform(platformSpec))
		if err != nil {
			return err
		}

		platformString := variant.Platform.Format()
		if _, ok := inputByPlatform[platformString]; ok {
			return fmt.Errorf("duplicate platform %q", platformString)
		}
		inputByPlatform[platformString] = buildkit.ContainerExport{
			Definition: def.ToPB(),
			Config:     variant.Config,
		}

		if len(variants) == 1 {
			// single platform case
			for _, annotation := range variant.Annotations {
				opts[exptypes.AnnotationManifestKey(nil, annotation.Key)] = annotation.Value
				opts[exptypes.AnnotationManifestDescriptorKey(nil, annotation.Key)] = annotation.Value
			}
		} else {
			// multi platform case
			for _, annotation := range variant.Annotations {
				opts[exptypes.AnnotationManifestKey(&platformSpec, annotation.Key)] = annotation.Value
				opts[exptypes.AnnotationManifestDescriptorKey(&platformSpec, annotation.Key)] = annotation.Value
			}
		}

		services.Merge(variant.Services)
	}
	if len(inputByPlatform) == 0 {
		// Could also just ignore and do nothing, airing on side of error until proven otherwise.
		return errors.New("no containers to export")
	}

	detach, _, err := svcs.StartBindings(ctx, services)
	if err != nil {
		return err
	}
	defer detach()

	_, err = bk.ExportContainerImage(ctx, inputByPlatform, dest, opts)
	return err
}

func (container *Container) AsTarball(
	ctx context.Context,
	platformVariants []*Container,
	forcedCompression ImageLayerCompression,
	mediaTypes ImageMediaTypes,
) (*File, error) {
	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buildkit client: %w", err)
	}
	svcs, err := container.Query.Services(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %w", err)
	}
	engineHostPlatform := container.Query.Platform()

	if mediaTypes == "" {
		mediaTypes = OCIMediaTypes
	}

	opts := map[string]string{
		"tar":                           strconv.FormatBool(true),
		string(exptypes.OptKeyOCITypes): strconv.FormatBool(mediaTypes == OCIMediaTypes),
	}
	if forcedCompression != "" {
		opts[string(exptypes.OptKeyLayerCompression)] = strings.ToLower(string(forcedCompression))
		opts[string(exptypes.OptKeyForceCompression)] = strconv.FormatBool(true)
	}

	inputByPlatform := map[string]buildkit.ContainerExport{}
	services := ServiceBindings{}

	variants := append([]*Container{container}, platformVariants...)
	for _, variant := range variants {
		if variant.FS == nil {
			continue
		}
		st, err := variant.FSState()
		if err != nil {
			return nil, err
		}

		platformSpec := variant.Platform.Spec()
		def, err := st.Marshal(ctx, llb.Platform(platformSpec))
		if err != nil {
			return nil, err
		}

		platformString := platforms.Format(variant.Platform.Spec())
		if _, ok := inputByPlatform[platformString]; ok {
			return nil, fmt.Errorf("duplicate platform %q", platformString)
		}
		inputByPlatform[platformString] = buildkit.ContainerExport{
			Definition: def.ToPB(),
			Config:     variant.Config,
		}

		if len(variants) == 1 {
			// single platform case
			for _, annotation := range variant.Annotations {
				opts[exptypes.AnnotationManifestKey(nil, annotation.Key)] = annotation.Value
				opts[exptypes.AnnotationManifestDescriptorKey(nil, annotation.Key)] = annotation.Value
			}
		} else {
			// multi platform case
			for _, annotation := range variant.Annotations {
				opts[exptypes.AnnotationManifestKey(&platformSpec, annotation.Key)] = annotation.Value
				opts[exptypes.AnnotationManifestDescriptorKey(&platformSpec, annotation.Key)] = annotation.Value
			}
		}

		services.Merge(variant.Services)
	}
	if len(inputByPlatform) == 0 {
		return nil, errors.New("no containers to export")
	}

	detach, _, err := svcs.StartBindings(ctx, services)
	if err != nil {
		return nil, err
	}
	defer detach()

	fileName := identity.NewID() + ".tar"
	pbDef, err := bk.ContainerImageToTarball(ctx, engineHostPlatform.Spec(), fileName, inputByPlatform, opts)
	if err != nil {
		return nil, fmt.Errorf("container image to tarball file conversion failed: %w", err)
	}
	return NewFile(container.Query, pbDef, fileName, engineHostPlatform, nil), nil
}

func (container *Container) Import(
	ctx context.Context,
	source *File,
	tag string,
) (*Container, error) {
	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buildkit client: %w", err)
	}
	store := container.Query.OCIStore()
	lm := container.Query.LeaseManager()

	container = container.Clone()

	var release func(context.Context) error
	loadManifest := func(ctx context.Context) (*specs.Descriptor, error) {
		src, err := source.Open(ctx)
		if err != nil {
			return nil, err
		}

		defer src.Close()

		// override outer ctx with release ctx and set release
		ctx, release, err = leaseutil.WithLease(ctx, lm, leaseutil.MakeTemporary)
		if err != nil {
			return nil, err
		}

		stream := archive.NewImageImportStream(src, "")

		desc, err := stream.Import(ctx, store)
		if err != nil {
			return nil, fmt.Errorf("image archive import: %w", err)
		}

		return resolveIndex(ctx, store, desc, container.Platform.Spec(), tag)
	}

	manifestDesc, err := loadManifest(ctx)
	if err != nil {
		return nil, fmt.Errorf("recover: %w", err)
	}

	// NB: the repository portion of this ref doesn't actually matter, but it's
	// pleasant to see something recognizable.
	dummyRepo := "dagger/import"

	st := llb.OCILayout(
		fmt.Sprintf("%s@%s", dummyRepo, manifestDesc.Digest),
		llb.OCIStore("", buildkit.OCIStoreName),
		llb.Platform(container.Platform.Spec()),
	)

	execDef, err := st.Marshal(ctx, llb.Platform(container.Platform.Spec()))
	if err != nil {
		return nil, fmt.Errorf("marshal root: %w", err)
	}

	container.FS = execDef.ToPB()

	if release != nil {
		// eagerly evaluate the OCI reference so Buildkit sets up a long-term lease
		_, err = bk.Solve(ctx, bkgw.SolveRequest{
			Definition: container.FS,
			Evaluate:   true,
		})
		if err != nil {
			return nil, fmt.Errorf("solve: %w", err)
		}

		if err := release(ctx); err != nil {
			return nil, fmt.Errorf("release: %w", err)
		}
	}

	manifestBlob, err := content.ReadBlob(ctx, store, *manifestDesc)
	if err != nil {
		return nil, fmt.Errorf("image archive read manifest blob: %w", err)
	}

	var man specs.Manifest
	err = json.Unmarshal(manifestBlob, &man)
	if err != nil {
		return nil, fmt.Errorf("image archive unmarshal manifest: %w", err)
	}

	configBlob, err := content.ReadBlob(ctx, store, man.Config)
	if err != nil {
		return nil, fmt.Errorf("image archive read image config blob %s: %w", man.Config.Digest, err)
	}

	var imgSpec specs.Image
	err = json.Unmarshal(configBlob, &imgSpec)
	if err != nil {
		return nil, fmt.Errorf("load image config: %w", err)
	}

	container.Config = imgSpec.Config

	return container, nil
}

func (container *Container) WithExposedPort(port Port) (*Container, error) {
	container = container.Clone()

	// replace existing port to avoid duplicates
	gotOne := false

	for i, p := range container.Ports {
		if p.Port == port.Port && p.Protocol == port.Protocol {
			container.Ports[i] = port
			gotOne = true
			break
		}
	}

	if !gotOne {
		container.Ports = append(container.Ports, port)
	}

	if container.Config.ExposedPorts == nil {
		container.Config.ExposedPorts = map[string]struct{}{}
	}

	ociPort := fmt.Sprintf("%d/%s", port.Port, port.Protocol.Network())
	container.Config.ExposedPorts[ociPort] = struct{}{}

	return container, nil
}

func (container *Container) WithoutExposedPort(port int, protocol NetworkProtocol) (*Container, error) {
	container = container.Clone()

	filtered := []Port{}
	filteredOCI := map[string]struct{}{}
	for _, p := range container.Ports {
		if p.Port != port || p.Protocol != protocol {
			filtered = append(filtered, p)
			ociPort := fmt.Sprintf("%d/%s", p.Port, p.Protocol.Network())
			filteredOCI[ociPort] = struct{}{}
		}
	}

	container.Ports = filtered
	container.Config.ExposedPorts = filteredOCI

	return container, nil
}

func (container *Container) WithServiceBinding(ctx context.Context, id *call.ID, svc *Service, alias string) (*Container, error) {
	container = container.Clone()

	host, err := svc.Hostname(ctx, id)
	if err != nil {
		return nil, err
	}

	var aliases AliasSet
	if alias != "" {
		aliases = AliasSet{alias}
	}

	container.Services.Merge(ServiceBindings{
		{
			ID:       id,
			Service:  svc,
			Hostname: host,
			Aliases:  aliases,
		},
	})

	return container, nil
}

func (container *Container) ImageRefOrErr(ctx context.Context) (string, error) {
	imgRef := container.ImageRef
	if imgRef != "" {
		return imgRef, nil
	}

	return "", errors.Errorf("Image reference can only be retrieved immediately after the 'Container.From' call. Error in fetching imageRef as the container image is changed")
}

func (container *Container) Service(ctx context.Context) (*Service, error) {
	if container.Meta == nil {
		var err error
		container, err = container.WithExec(ctx, ContainerExecOpts{
			UseEntrypoint: true,
		})
		if err != nil {
			return nil, err
		}
	}
	return container.Query.NewContainerService(ctx, container), nil
}

func (container *Container) ownership(ctx context.Context, owner string) (*Ownership, error) {
	if owner == "" {
		// do not change ownership
		return nil, nil
	}

	fsSt, err := container.FSState()
	if err != nil {
		return nil, err
	}

	bk, err := container.Query.Buildkit(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get buildkit client: %w", err)
	}
	return resolveUIDGID(ctx, fsSt, bk, container.Platform, owner)
}

func (container *Container) command(opts ContainerExecOpts) ([]string, error) {
	cfg := container.Config
	args := opts.Args

	if len(args) == 0 {
		// we use the default args if no new default args are passed
		args = cfg.Cmd
	}

	if len(cfg.Entrypoint) > 0 && opts.UseEntrypoint {
		args = append(cfg.Entrypoint, args...)
	}

	if len(args) == 0 {
		return nil, ErrNoCommand
	}

	return args, nil
}

type BuildArg struct {
	Name  string :"true" doc:"The build argument name.
	Value string :"true" doc:"The build argument value.
}

func (BuildArg) TypeName() string {
	return "BuildArg"
}

func (BuildArg) TypeDescription() string {
	return "Key value object that represents a build argument."
}

// OCI manifest annotation that specifies an image's tag
const ociTagAnnotation = "org.opencontainers.image.ref.name"

func resolveIndex(ctx context.Context, store content.Store, desc specs.Descriptor, platform specs.Platform, tag string) (*specs.Descriptor, error) {
	if desc.MediaType != specs.MediaTypeImageIndex {
		return nil, fmt.Errorf("expected index, got %s", desc.MediaType)
	}

	indexBlob, err := content.ReadBlob(ctx, store, desc)
	if err != nil {
		return nil, fmt.Errorf("read index blob: %w", err)
	}

	var idx specs.Index
	err = json.Unmarshal(indexBlob, &idx)
	if err != nil {
		return nil, fmt.Errorf("unmarshal index: %w", err)
	}

	matcher := platforms.Only(platform)

	for _, m := range idx.Manifests {
		if m.Platform != nil {
			if !matcher.Match(*m.Platform) {
				// incompatible
				continue
			}
		}

		if tag != "" {
			if m.Annotations == nil {
				continue
			}

			manifestTag, found := m.Annotations[ociTagAnnotation]
			if !found || manifestTag != tag {
				continue
			}
		}

		switch m.MediaType {
		case specs.MediaTypeImageManifest, // OCI
			images.MediaTypeDockerSchema2Manifest: // Docker
			return &m, nil

		case specs.MediaTypeImageIndex, // OCI
			images.MediaTypeDockerSchema2ManifestList: // Docker
			return resolveIndex(ctx, store, m, platform, tag)

		default:
			return nil, fmt.Errorf("expected manifest or index, got %s", m.MediaType)
		}
	}

	return nil, fmt.Errorf("no manifest for platform %s and tag %s", platforms.Format(platform), tag)
}

type ImageLayerCompression string

var ImageLayerCompressions = dagql.NewEnum[ImageLayerCompression]()

var (
	CompressionGzip         = ImageLayerCompressions.Register("Gzip")
	CompressionZstd         = ImageLayerCompressions.Register("Zstd")
	CompressionEStarGZ      = ImageLayerCompressions.Register("EStarGZ")
	CompressionUncompressed = ImageLayerCompressions.Register("Uncompressed")
)

func (proto ImageLayerCompression) Type() *ast.Type {
	return &ast.Type{
		NamedType: "ImageLayerCompression",
		NonNull:   true,
	}
}

func (proto ImageLayerCompression) TypeDescription() string {
	return "Compression algorithm to use for image layers."
}

func (proto ImageLayerCompression) Decoder() dagql.InputDecoder {
	return ImageLayerCompressions
}

func (proto ImageLayerCompression) ToLiteral() call.Literal {
	return ImageLayerCompressions.Literal(proto)
}

type ImageMediaTypes string

var ImageMediaTypesEnum = dagql.NewEnum[ImageMediaTypes]()

var (
	OCIMediaTypes    = ImageMediaTypesEnum.Register("OCIMediaTypes")
	DockerMediaTypes = ImageMediaTypesEnum.Register("DockerMediaTypes")
)

func (proto ImageMediaTypes) Type() *ast.Type {
	return &ast.Type{
		NamedType: "ImageMediaTypes",
		NonNull:   true,
	}
}

func (proto ImageMediaTypes) TypeDescription() string {
	return "Mediatypes to use in published or exported image metadata."
}

func (proto ImageMediaTypes) Decoder() dagql.InputDecoder {
	return ImageMediaTypesEnum
}

func (proto ImageMediaTypes) ToLiteral() call.Literal {
	return ImageMediaTypesEnum.Literal(proto)
}
    `
  }
];