import { create } from "zustand";

// Nothing here is persisted: answers are gone when the tab closes.
const freshTriage = () => ({
  stepId: "welcome", // current triage step, "welcome", "retry", or null when finished
  outcome: null, // "recommended" | "pregnant" | "underage" once the triage ends
  answers: {},
  messages: [],
  recommendation: null,
  loading: false,
});

const freshAsk = () => ({
  askMessages: [],
  askLoading: false,
  sessionId: `web-${Date.now()}`,
});

let messageSeq = 0;
const timestamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const stamp = (msg) => ({ id: ++messageSeq, timestamp: timestamp(), kind: "text", ...msg });

export const useChatStore = create((set) => ({
  doctor: null, // "amara" | "kofi"
  ...freshTriage(),
  ...freshAsk(),

  setDoctor: (doctor) => set({ doctor }),
  setStep: (stepId) => set({ stepId }),
  setOutcome: (outcome) => set({ outcome, stepId: null }),
  setLoading: (loading) => set({ loading }),
  setRecommendation: (recommendation) => set({ recommendation }),
  setAnswer: (stepId, values) => set((s) => ({ answers: { ...s.answers, [stepId]: values } })),
  setAskLoading: (askLoading) => set({ askLoading }),

  // A message is { role: "bot" | "user", kind, ... }. Text is stored per language so the
  // conversation re-renders when the user switches between English and Kiswahili.
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, stamp(msg)] })),
  addAskMessage: (msg) => set((s) => ({ askMessages: [...s.askMessages, stamp(msg)] })),

  // Starting over keeps the chosen doctor.
  resetTriage: () => set(freshTriage()),
}));
