import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Typewriter = ({ 
  phrases = ["Stop Guessing.", "Dominate AI.", "Build Faster.", "Scale Smarter."],
  typingSpeed = 60,
  deletingSpeed = 30,
  pauseTime = 1500,
  className = ""
}) => {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer;
    const phrase = phrases[currentPhraseIndex];

    if (!isDeleting && currentText === phrase) {
      // Pause before deleting
      timer = setTimeout(() => {
        setIsDeleting(true);
      }, pauseTime);
    } else if (isDeleting && currentText === "") {
      // Pause before typing next phrase
      setIsDeleting(false);
      setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
    } else {
      // Typing or Deleting
      const speed = isDeleting ? deletingSpeed : typingSpeed;
      timer = setTimeout(() => {
        setCurrentText((prev) => {
          if (isDeleting) {
            return prev.slice(0, -1);
          } else {
            return phrase.slice(0, prev.length + 1);
          }
        });
      }, speed);
    }

    return () => clearTimeout(timer);
  }, [currentText, isDeleting, currentPhraseIndex, phrases, typingSpeed, deletingSpeed, pauseTime]);

  const longestPhrase = useMemo(() => {
    return [...phrases].sort((a, b) => b.length - a.length)[0];
  }, [phrases]);

  return (
    <span className="relative inline-block whitespace-nowrap">
      {/* Invisible longest phrase to reserve space and prevent layout shifts */}
      <span className="invisible pointer-events-none select-none" aria-hidden="true">
        {longestPhrase}
      </span>
      
      {/* Absolutely positioned typing text */}
      <span className={`absolute left-0 top-0 flex items-center ${className}`}>
        {currentText}
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          className="inline-block w-[0.12em] h-[0.85em] ml-[0.1em] bg-[#ff4a1c] shadow-[0_0_15px_rgba(255,74,28,0.9)]"
        />
      </span>
    </span>
  );
};

export default Typewriter;
