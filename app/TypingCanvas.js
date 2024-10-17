import React, { useState, useEffect, useRef } from "react";
import styles from "./TypingCanvas.module.css";

const TypingCanvas = ({ code, speed = 50 }) => {
    const containerRef = useRef(null);
    const [lines, setLines] = useState([]);
    const [visibleLines, setVisibleLines] = useState(0);
    const visibleHeightRef = useRef(0);
    const lineHeightRef = useRef(0);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const splitTextIntoLines = () => {
            const container = containerRef.current;
            if (!container) return;

            const containerWidth = container.offsetWidth;
            const tempElement = document.createElement("span");
            tempElement.style.font = getComputedStyle(container).font;
            tempElement.style.visibility = "hidden";
            tempElement.style.position = "absolute";
            tempElement.textContent = "M"; // Use a capital M to measure line height
            document.body.appendChild(tempElement);

            // Calculate line height based on font size
            const fontSize = parseFloat(getComputedStyle(tempElement).fontSize);
            lineHeightRef.current = Math.ceil(fontSize * 1.2); // Adjust multiplier as needed

            const words = code.split(/\s+/);
            const newLines = [];
            let currentLine = "";

            words.forEach(word => {
                tempElement.textContent = currentLine + " " + word;
                if (tempElement.offsetWidth > containerWidth - 20) {
                    if (currentLine) {
                        newLines.push(currentLine.trim());
                        currentLine = word;
                    } else {
                        // Split the word if it's too long for a single line
                        const halfLength = Math.ceil(word.length / 2);
                        newLines.push(word.slice(0, halfLength));
                        currentLine = word.slice(halfLength);
                    }
                } else {
                    currentLine += (currentLine ? " " : "") + word;
                }
            });

            if (currentLine) {
                newLines.push(currentLine.trim());
            }

            // Check if the last line is too long and split if necessary
            const lastLine = newLines[newLines.length - 1];
            tempElement.textContent = lastLine;
            if (tempElement.offsetWidth > containerWidth - 20) {
                const words = lastLine.split(' ');
                let newLastLine = '';
                for (let i = 0; i < words.length; i++) {
                    if (tempElement.textContent.length > 0) {
                        tempElement.textContent += ' ' + words[i];
                    } else {
                        tempElement.textContent = words[i];
                    }
                    if (tempElement.offsetWidth > containerWidth - 20) {
                        newLines[newLines.length - 1] = newLastLine.trim();
                        newLines.push(words.slice(i).join(' ').trim());
                        break;
                    }
                    newLastLine += (newLastLine ? ' ' : '') + words[i];
                }
            }

            document.body.removeChild(tempElement);
            setLines(newLines);
        };

        splitTextIntoLines();
        window.addEventListener("resize", splitTextIntoLines);

        return () => {
            window.removeEventListener("resize", splitTextIntoLines);
        };
    }, [code]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        
        if (visibleLines < lines.length) {
            const timer = setTimeout(() => {
                const container = containerRef.current;
                if (!container) return;

                const nextLineHeight = visibleHeightRef.current + lineHeightRef.current;
                const containerRect = container.getBoundingClientRect();
                const containerTop = containerRect.top;

                if (containerTop + nextLineHeight <= window.innerHeight) {
                    setVisibleLines(prev => prev + 1);
                    visibleHeightRef.current = nextLineHeight;
                }
            }, speed * lines[visibleLines].length);
            return () => clearTimeout(timer);
        }
    }, [visibleLines, lines, speed]);

    return (
        <div ref={containerRef} className={styles.typingCanvas}>
            {lines.slice(0, visibleLines).map((line, index) => (
                <div key={index} className={styles.line} style={{
                    animationDuration: `${speed * line.length}ms`,
                    lineHeight: `${lineHeightRef.current}px`,
                }}>
                    {line}
                </div>
            ))}
        </div>
    );
};

export default TypingCanvas;
