import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Mic, MicOff, Languages } from "lucide-react";
import { motion } from "framer-motion";
import useSpeech from "../hooks/useSpeech.js";

export default function InputBar({
  language,
  setLanguage,
  loading,
  onSend,
}) {
  const [value, setValue] = useState("");
  const { isSupported, isListening, transcript, error, startListening, stopListening } =
    useSpeech(language);

  const lastAutoSentRef = useRef("");

  const placeholder = useMemo(() => {
    return language === "kn"
      ? "ನಗರ ಸೇವೆಗಳ ಬಗ್ಗೆ ಏನೇನು ಕೇಳಿ..."
      : "Ask anything about municipal services...";
  }, [language]);

  const doSend = () => {
    const msg = value.trim();
    if (!msg || loading) return;
    setValue("");
    onSend?.(msg);
  };

  useEffect(() => {
    // When speech completes, auto-fill and auto-send once.
    const t = (transcript || "").trim();
    if (!t) return;
    if (isListening) return;
    if (lastAutoSentRef.current === t) return;
    lastAutoSentRef.current = t;
    setValue(t);
    // Small tick so UI shows the filled text.
    const id = window.setTimeout(() => {
      onSend?.(t);
      setValue("");
    }, 40);
    return () => window.clearTimeout(id);
  }, [transcript, isListening, onSend]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div className="w-full border-t border-white/10 bg-navy-900/60 backdrop-blur supports-[backdrop-filter]:bg-navy-900/45">
      <div className="mx-auto max-w-[680px] px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 rounded-2xl border border-white/10 bg-navy-800/60 shadow-sm overflow-hidden">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={loading}
              className="w-full resize-none bg-transparent px-4 py-3 text-white placeholder:text-slateInk-500 outline-none"
            />
            <div className="px-4 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setLanguage?.(language === "en" ? "kn" : "en")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-navy-900/30 hover:bg-navy-900/60 px-3 py-1.5 text-xs text-slateInk-300 disabled:opacity-50"
                  title="Toggle language"
                >
                  <Languages className="h-3.5 w-3.5" />
                  {language === "en" ? "EN" : "ಕನ್ನಡ"}
                </button>
                {error ? (
                  <span className="text-xs text-amber-200">
                    Voice error: {error}
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-slateInk-500">
                {isSupported ? (isListening ? "Listening…" : "Voice ready") : "Voice not supported"}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <motion.button
              type="button"
              disabled={!isSupported || loading}
              onClick={() => (isListening ? stopListening() : startListening())}
              whileTap={{ scale: 0.98 }}
              className={`h-11 w-11 rounded-2xl border shadow-sm flex items-center justify-center transition ${
                isListening
                  ? "border-red-500/40 bg-red-500/15"
                  : "border-white/10 bg-navy-800/60 hover:bg-navy-800/90"
              } disabled:opacity-50`}
              title={isListening ? "Stop listening" : "Voice input"}
              animate={isListening ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={isListening ? { duration: 1.1, repeat: Infinity } : undefined}
            >
              {isListening ? (
                <MicOff className="h-5 w-5 text-red-300" />
              ) : (
                <Mic className="h-5 w-5 text-slateInk-200" />
              )}
            </motion.button>

            <motion.button
              type="button"
              disabled={loading || !value.trim()}
              onClick={doSend}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="h-11 w-11 rounded-2xl bg-emerald-500 hover:bg-emerald-500/90 text-white shadow-glow flex items-center justify-center disabled:opacity-50 disabled:hover:bg-emerald-500"
              title="Send"
            >
              <ArrowUpRight className="h-5 w-5" />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

