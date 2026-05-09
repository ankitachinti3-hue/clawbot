import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Sparkles, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { CLAWBOT_CONFIG } from "../clawbot.config.js";
import MessageBubble from "./MessageBubble.jsx";
import InputBar from "./InputBar.jsx";
import QuickReplies from "./QuickReplies.jsx";
import TypingIndicator from "./TypingIndicator.jsx";

const WELCOME_EN =
  "Hello! I'm CLAWBOT — your helpful AI assistant.\n\nAsk me anything. How can I help today?";

const WELCOME_KN =
  "ನಮಸ್ಕಾರ! ನಾನು CLAWBOT — ನಿಮ್ಮ ಸಹಾಯಕ AI.\n\nಏನನ್ನಾದರೂ ಕೇಳಿ. ಇಂದು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?";

const CIVIC_KEYWORDS = [
  "tax", "property tax", "licence", "license", "trade licence",
  "complaint", "municipal", "corporation", "certificate",
  "application", "status", "renewal", "water bill", "electricity",
  "birth certificate", "death certificate", "permit", "noc",
  "belagavi", "bbmp", "pmc", "nmc", "ward", "councillor",
  "garbage", "sanitation", "road", "pothole", "drainage"
];

function isCivicQuery(message) {
  const lower = message.toLowerCase();
  return CIVIC_KEYWORDS.some(keyword => lower.includes(keyword));
}

const CIVIC_SITES = [
  "https://bbmpgov.in",
  "https://www.belagavicitycouncil.gov.in",
  "https://mygov.in",
  "https://services.india.gov.in"
];

async function scrapeForContext(userQuery) {
  // Pick most relevant site based on keywords
  let targetUrl = CIVIC_SITES[0]; // default

  if (userQuery.toLowerCase().includes("belagavi")) {
    targetUrl = "https://www.belagavicitycouncil.gov.in";
  } else if (userQuery.toLowerCase().includes("tax") || 
             userQuery.toLowerCase().includes("property")) {
    targetUrl = "https://bbmpgov.in";
  } else if (userQuery.toLowerCase().includes("certificate") || 
             userQuery.toLowerCase().includes("application")) {
    targetUrl = "https://services.india.gov.in";
  }

  try {
    // Jina AI API with API key for more reliable scraping
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;
    const response = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "Authorization": `Bearer jina_617c047dc36642ffaa456557af19ab032NC2nSt4KKhiLBrfnpXZhIjoMfU3`
      }
    });
    const text = await response.text();
    // Return first 2000 chars to not overflow Cerebras context
    return text.slice(0, 2000);
  } catch (err) {
    console.error("Scraping failed:", err);
    return null;
  }
}

async function sendMessage(userMessage) {
  const apiKey = CLAWBOT_CONFIG.CEREBRAS_API_KEY;
  
  let systemPrompt = CLAWBOT_CONFIG.SYSTEM_PROMPT;
  let scrapedContext = null;

  // Check if civic query — if yes scrape first
  if (isCivicQuery(userMessage)) {
    scrapedContext = await scrapeForContext(userMessage);
  }

  // Build system prompt with or without scraped data
  if (scrapedContext) {
    systemPrompt = `You are CLAWBOT, a civic AI assistant.
      
The user asked a civic/municipal question.
Here is live data scraped from the relevant government website:

--- SCRAPED DATA START ---
${scrapedContext}
--- SCRAPED DATA END ---

Use this data to answer the user's question accurately.
If the scraped data doesn't directly answer the question, 
use your knowledge but mention the user should verify officially.
Be clear, helpful and concise.`;
  }

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: CLAWBOT_CONFIG.MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { role: "user", content: userMessage }
      ],
      max_tokens: 512,
      temperature: 0.7
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `Request failed (${response.status})`;
    throw new Error(detail);
  }

  if (!data.choices?.[0]?.message?.content) {
    throw new Error(data?.error?.message || "Sorry, I couldn't get a response. Check your API key.");
  }

  return data.choices[0].message.content;
}

export default function ChatWindow() {
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
      const answerText = await sendMessage(trimmed);
      const botMsg = {
        id: `b_${Date.now()}`,
        role: "bot",
        text: answerText,
        confidence: 1,
        category: "chat",
        escalate: false,
        action_cards: [],
        suggested_followups: [],
      };
      setMessages((m) => [...m, botMsg]);
    } catch (e) {
      const msg =
        e?.message ||
        (language === "kn"
          ? "API ಕರೆ ವಿಫಲವಾಗಿದೆ. ನಿಮ್ಮ API ಕೀ ಮತ್ತು ನೆಟ್‌ವರ್ಕ್ ಪರಿಶೀಲಿಸಿ."
          : "API request failed. Check your API key and network.");
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
            <Link
              to="/wisdom"
              className="rounded-xl border border-white/10 bg-navy-800/60 hover:bg-navy-800/90 px-3 py-2 text-sm text-white"
            >
              Wisdom
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
              <QuickReplies
                prompts={[
                  "What can you help with?",
                  "Summarize this page",
                  "Explain this to me",
                  "Give me tips",
                ]}
                onPick={onSend}
              />
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

