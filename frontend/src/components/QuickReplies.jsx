import React from "react";
import { motion } from "framer-motion";

const DEFAULT_PROMPTS = [
  "How do I apply for a trade licence?",
  "What is the property tax deadline?",
  "How to get a birth certificate?",
  "How to file a water connection complaint?",
];

export default function QuickReplies({ prompts = DEFAULT_PROMPTS, onPick }) {
  return (
    <div className="w-full">
      <div className="text-xs text-slateInk-400 mb-2">Quick start</div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {prompts.map((p) => (
          <motion.button
            key={p}
            type="button"
            onClick={() => onPick?.(p)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="shrink-0 rounded-full border border-white/10 bg-navy-800/60 hover:bg-navy-800/90 px-3 py-2 text-sm text-white"
          >
            {p}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

