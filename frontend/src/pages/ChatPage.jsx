import React from "react";
import ChatWindow from "../components/ChatWindow.jsx";

export default function ChatPage() {
  return (
    <div className="w-full h-[100dvh] bg-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-navy-900 to-navy-950" />
      <div className="relative h-full">
        <ChatWindow />
      </div>
    </div>
  );
}

