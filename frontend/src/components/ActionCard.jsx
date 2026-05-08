import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, ExternalLink, FileText, PhoneCall } from "lucide-react";

function iconFor(type, label) {
  const l = (label || "").toLowerCase();
  if (type === "download" || l.includes("download") || l.includes("form")) return FileText;
  if (type === "pay" || l.includes("pay")) return CreditCard;
  if (type === "call") return PhoneCall;
  return ExternalLink;
}

export default function ActionCard({ card }) {
  const Icon = useMemo(() => iconFor(card?.type, card?.label), [card?.type, card?.label]);
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    if (!card) return;
    if (card.type === "call") {
      const phone = card.phone || "";
      try {
        if (navigator.clipboard && phone) {
          await navigator.clipboard.writeText(phone);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }
      } catch {
        // ignore
      }
      const digits = (phone || "").replace(/[^\d+]/g, "");
      if (digits) window.location.href = `tel:${digits}`;
      return;
    }
    if (card.url) {
      window.open(card.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="w-full text-left rounded-xl border border-emerald-500/30 bg-navy-800/70 hover:bg-navy-800/90 transition px-3 py-2 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-navy-900/60">
          <Icon className="h-4 w-4 text-emerald-500" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{card?.label}</div>
          {card?.type === "call" ? (
            <div className="text-xs text-slateInk-400 truncate">
              {copied ? "Copied number" : card?.phone}
            </div>
          ) : card?.url ? (
            <div className="text-xs text-slateInk-400 truncate">{card.url}</div>
          ) : null}
        </div>
      </div>
    </motion.button>
  );
}

