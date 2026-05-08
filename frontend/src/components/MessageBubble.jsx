import React from "react";
import { motion } from "framer-motion";
import { Building2, TriangleAlert } from "lucide-react";
import ActionCard from "./ActionCard.jsx";

function renderText(text) {
  const t = (text || "").toString();
  return (
    <div className="whitespace-pre-line leading-relaxed text-[15px]">
      {t}
    </div>
  );
}

export default function MessageBubble({ message, onPickFollowup }) {
  const isBot = message?.role === "bot";
  const escalate = !!message?.escalate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`flex w-full ${isBot ? "justify-start" : "justify-end"}`}
    >
      <div className={`max-w-[92%] sm:max-w-[80%] ${isBot ? "pr-10" : "pl-10"}`}>
        {isBot ? (
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-9 w-9 shrink-0 rounded-xl border border-white/10 bg-navy-800/70 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              {escalate ? (
                <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <TriangleAlert className="h-4 w-4" />
                    Confidence is low — escalation recommended
                  </div>
                  {(message.department || message.contact) ? (
                    <div className="mt-1 text-xs text-amber-100/90">
                      {message.department ? <span className="font-semibold">{message.department}</span> : null}
                      {message.department && message.contact ? <span> · </span> : null}
                      {message.contact ? <span className="font-mono">{message.contact}</span> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-navy-800/70 shadow-sm">
                <div className="border-l-4 border-emerald-500/80 px-4 py-3 rounded-2xl">
                  {renderText(message.text)}
                </div>
              </div>

              {Array.isArray(message.action_cards) && message.action_cards.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {message.action_cards.map((c, idx) => (
                    <ActionCard key={`${c.label}-${idx}`} card={c} />
                  ))}
                </div>
              ) : null}

              {Array.isArray(message.suggested_followups) && message.suggested_followups.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.suggested_followups.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onPickFollowup?.(f)}
                      className="rounded-full border border-white/10 bg-navy-900/30 hover:bg-navy-900/55 px-3 py-1.5 text-xs text-slateInk-300"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-500 text-white px-4 py-3 shadow-sm">
            {renderText(message.text)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

