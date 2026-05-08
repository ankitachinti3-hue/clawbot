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

export async function getCorruptionSignals() {
  const { data } = await api.get("/admin/corruption-signals");
  return data;
}

export async function resolveCorruptionSignal(id) {
  const { data } = await api.patch(`/admin/corruption-signals/${id}/resolve`);
  return data;
}

export async function getOfficerAccountability() {
  const { data } = await api.get("/admin/officer-accountability");
  return data;
}

export async function getCollectiveGrievances() {
  const { data } = await api.get("/admin/collective-grievances");
  return data;
}

export async function getGrievancePetition(id) {
  const { data } = await api.get(`/admin/grievances/${id}/petition`);
  return data;
}

export async function getInfrastructureMemory() {
  const { data } = await api.get("/admin/infrastructure-memory");
  return data;
}

export async function updateInfrastructureIssue(id, payload) {
  const { data } = await api.patch(`/admin/infrastructure-memory/${id}`, payload);
  return data;
}

export async function getSilencePatterns() {
  const { data } = await api.get("/admin/silence-patterns");
  return data;
}

export async function acknowledgeSilencePattern(id) {
  const { data } = await api.patch(`/admin/silence-patterns/${id}/ack`);
  return data;
}

export async function getRightsAlerts() {
  const { data } = await api.get("/admin/rights-alerts");
  return data;
}

export async function getCivicTwin() {
  const { data } = await api.get("/admin/civic-twin");
  return data;
}

export async function getReckoningReport() {
  const { data } = await api.get("/admin/reckoning-report");
  return data;
}

export async function getWisdom(ward) {
  const { data } = await api.get("/wisdom", { params: ward ? { ward } : {} });
  return data;
}

export async function submitWisdom(payload) {
  const { data } = await api.post("/wisdom", payload);
  return data;
}

