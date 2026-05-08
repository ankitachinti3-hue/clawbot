import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Sparkles, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { sendMessage } from "../utils/api.js";
import MessageBubble from "./MessageBubble.jsx";
import InputBar from "./InputBar.jsx";
import QuickReplies from "./QuickReplies.jsx";
import TypingIndicator from "./TypingIndicator.jsx";

function getOrCreateSessionId() {
  const key = "civicbot_session_id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
  sessionStorage.setItem(key, id);
  return id;
}

const WELCOME_EN =
  "Hello! I’m CivicBot — your municipal services assistant for Belagavi.\n\nAsk me about trade licences, property tax, building permits, utility connections, certificates, or grievances. How can I help today?";

const WELCOME_KN =
  "ನಮಸ್ಕಾರ! ನಾನು CivicBot — ಬೆಳಗಾವಿಯ ನಗರ ಸೇವೆಗಳ ಸಹಾಯಕ.\n\nಟ್ರೇಡ್ ಲೈಸೆನ್ಸ್, ಪ್ರಾಪರ್ಟಿ ಟ್ಯಾಕ್ಸ್, ಬಿಲ್ಡಿಂಗ್ ಪರ್ಮಿಟ್, ಯೂಟಿಲಿಟಿ ಸಂಪರ್ಕ, ಸರ್ಟಿಫಿಕೇಟ್‌ಗಳು, ದೂರುಗಳ ಬಗ್ಗೆ ಕೇಳಬಹುದು. ಇಂದು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?";

export default function ChatWindow() {
  const sessionId = useMemo(getOrCreateSessionId, []);
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [messages, setMessages] = useState(() => [
    {
      id: "welcome",
      role: "bot",
      text: WELCOME_EN,
      confidence: 1,
      category: "welcome",
      escalate: false,
      action_cards: [],
      suggested_followups: [],
    },
  ]);

  const listRef = useRef(null);

  useEffect(() => {
    // Update welcome message when language toggles (only if it's still the first bot message).
    setMessages((prev) => {
      const next = [...prev];
      const idx = next.findIndex((m) => m.id === "welcome");
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          text: language === "kn" ? WELCOME_KN : WELCOME_EN,
        };
      }
      return next;
    });
  }, [language]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const onSend = async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    setError("");
    setLoading(true);

    const userMsg = {
      id: `u_${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((m) => [...m, userMsg]);

    try {
      const res = await sendMessage(trimmed, language, sessionId);
      const botMsg = {
        id: `b_${Date.now()}`,
        role: "bot",
        text: res.answer,
        confidence: res.confidence,
        category: res.category,
        escalate: res.escalate,
        department: res.department,
        contact: res.contact,
        action_cards: res.action_cards || [],
        suggested_followups: res.suggested_followups || [],
      };
      setMessages((m) => [...m, botMsg]);
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        (language === "kn"
          ? "ಸರ್ವರ್ ಸಂಪರ್ಕವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."
          : "Couldn’t reach the server. Please try again in a moment.");
      setError(msg);
      setMessages((m) => [
        ...m,
        {
          id: `err_${Date.now()}`,
          role: "bot",
          text:
            language === "kn"
              ? "ಕ್ಷಮಿಸಿ — ನನಗೆ ಈಗ ಉತ್ತರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ನೀವು ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಮತ್ತೆ ಕಳುಹಿಸಬಹುದು."
              : "Sorry — I couldn’t answer right now. You can retry your question.",
          confidence: 0,
          category: "error",
          escalate: true,
          department: "Belagavi City Corporation Helpdesk",
          contact: "BCC Main Office, Corporation Road, Belagavi; Phone: 0831-2407200",
          action_cards: [],
          suggested_followups: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const showQuickReplies = messages.length <= 2 && !loading;

  return (
    <div className="w-full h-[100dvh] flex flex-col">
      <div className="border-b border-white/10 bg-navy-900/55 backdrop-blur supports-[backdrop-filter]:bg-navy-900/40">
        <div className="mx-auto max-w-[680px] px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl border border-white/10 bg-navy-800/70 flex items-center justify-center">
              <div className="relative">
                <Building2 className="h-5 w-5 text-emerald-500" />
                <Sparkles className="h-3.5 w-3.5 text-white absolute -right-3 -top-2 opacity-80" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-bold tracking-tight">CivicBot</div>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Online
                </span>
              </div>
              <div className="text-xs text-slateInk-400">
                Belagavi municipal services assistant
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-navy-800/55 px-3 py-1.5 text-xs text-slateInk-300">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Confidence-aware escalation
            </div>
            <Link
              to="/admin"
              className="rounded-xl border border-white/10 bg-navy-800/60 hover:bg-navy-800/90 px-3 py-2 text-sm text-white"
            >
              Admin
            </Link>
          </div>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-4 py-6 space-y-4">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onPickFollowup={(f) => onSend(f)}
            />
          ))}

          {showQuickReplies ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="pt-2"
            >
              <QuickReplies onPick={onSend} />
            </motion.div>
          ) : null}

          {loading ? (
            <div className="pt-1">
              <TypingIndicator />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <InputBar
        language={language}
        setLanguage={setLanguage}
        loading={loading}
        onSend={onSend}
      />
    </div>
  );
}

