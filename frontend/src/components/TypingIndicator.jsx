import React from "react";
import { motion } from "framer-motion";

const dot = {
  initial: { y: 0, opacity: 0.4 },
  animate: {
    y: [0, -6, 0],
    opacity: [0.4, 1, 0.4],
    transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" },
  },
};

export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-slateInk-400">
      <div className="flex items-center gap-1 rounded-full bg-navy-800/60 border border-white/10 px-3 py-2">
        <motion.span
          variants={dot}
          initial="initial"
          animate="animate"
          className="h-2 w-2 rounded-full bg-emerald-500"
        />
        <motion.span
          variants={dot}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.15 }}
          className="h-2 w-2 rounded-full bg-emerald-500"
        />
        <motion.span
          variants={dot}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.3 }}
          className="h-2 w-2 rounded-full bg-emerald-500"
        />
      </div>
      <span className="text-xs">CivicBot is typing…</span>
    </div>
  );
}

