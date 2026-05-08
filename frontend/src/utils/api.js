import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL,
  timeout: 30000,
});

export async function sendMessage(message, language, sessionId) {
  const { data } = await api.post("/chat", {
    message,
    language,
    session_id: sessionId,
  });
  return data;
}

export async function getAnalytics() {
  const { data } = await api.get("/analytics");
  return data;
}

