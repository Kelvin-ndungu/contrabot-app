import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: BASE,
  headers: {
    "Content-Type": "application/json",
    // Free ngrok interstitial otherwise blocks browser XHR from Vercel.
    "ngrok-skip-browser-warning": "true",
  },
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

/** Africa's Talking-style callback. `text` is the full star-joined path. */
export async function postUssd({ sessionId, phoneNumber, text }) {
  const body = new URLSearchParams({
    sessionId,
    phoneNumber,
    text: text ?? "",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${BASE}/ussd`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    const raw = (await res.text()).replace(/^\uFEFF/, "").trim();
    if (!res.ok && !/^(CON|END)\b/.test(raw)) {
      throw new Error(raw || `USSD failed (${res.status})`);
    }
    const end = raw.startsWith("END");
    const message = raw.replace(/^(CON|END)\s*/, "");
    return { end, message: message || raw };
  } finally {
    clearTimeout(timer);
  }
}
