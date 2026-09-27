import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

export async function postRecommend(payload) {
  const { data } = await api.post("/api/recommend", payload);
  return data;
}

export async function postChat(payload) {
  const { data } = await api.post("/api/chat", payload);
  return data;
}
