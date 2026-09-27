import { postRecommend, postChat } from "@/api/client";
import { useChatStore } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { BOT, buildTriagePayload, getStep, lang, looksSwahili, nextStepId, one, triageSummary } from "@/lib/triage";

const SENSITIVE_STEPS = new Set(["health", "preg_check", "unprotected", "meds"]);
const store = () => useChatStore.getState();
const bot = (msg) => store().addMessage({ role: "bot", ...msg });

let ackTurn = 0;
function ack(prevStepId) {
  if (SENSITIVE_STEPS.has(prevStepId)) return BOT.sensitiveAck;
  ackTurn = (ackTurn + 1) % BOT.acks.en.length;
  return { en: BOT.acks.en[ackTurn], sw: BOT.acks.sw[ackTurn] };
}

function askStep(stepId, prefix) {
  store().setStep(stepId);
  bot({ kind: "question", stepId, prefix });
}

// Short replies to specific answers, shown before the next question.
function reactions(stepId, values) {
  const v = one(values);
  if (stepId === "unprotected" && v === "yes") return [BOT.emergencyNow];
  if (stepId === "preg_check" && values.length === 1 && v === "none") return [BOT.pregnancyUnsure];
  return [];
}

async function finishTriage() {
  const s = store();
  s.setStep(null);
  s.setLoading(true);
  bot({ text: BOT.checking });
  try {
    const data = await postRecommend({
      triage: buildTriagePayload(s.answers),
      language: useAppStore.getState().language,
    });
    s.setRecommendation(data);
    bot({ text: BOT.recommendationIntro });
    bot({ kind: "recommendation", data });
    bot({ text: BOT.afterRecommendation });
    s.setOutcome("recommended");
  } catch {
    s.setStep("retry");
    bot({ text: BOT.recommendError });
  } finally {
    s.setLoading(false);
  }
}

function answerStep(stepId, values) {
  const s = store();
  s.setAnswer(stepId, values);
  s.addMessage({ role: "user", kind: "answer", stepId, values });

  // Recommendations are for adults only.
  if (stepId === "age" && one(values) === "u18") {
    bot({ text: BOT.underAge });
    s.setOutcome("underage");
    return;
  }
  if (stepId === "preg_history" && one(values) === "now") {
    bot({ text: BOT.pregnantNow });
    s.setOutcome("pregnant");
    return;
  }

  const extra = reactions(stepId, values);
  extra.forEach((text) => bot({ text }));

  const next = nextStepId(store().answers, stepId);
  if (next) askStep(next, extra.length ? null : ack(stepId));
  else finishTriage();
}

// The triage is answered by tapping options only; there is no free text here.
export function useTriageFlow() {
  const start = () => {
    const s = store();
    if (s.messages.length) return;
    s.setStep("welcome");
    bot({ text: BOT.welcome });
  };

  const choose = (values) => {
    const s = store();
    if (s.stepId === "welcome") {
      s.addMessage({ role: "user", kind: "text", text: values[0] === "what" ? BOT.startWhat : BOT.startYes });
      if (values[0] === "what") bot({ text: BOT.about });
      else askStep(nextStepId(s.answers, null));
      return;
    }
    if (s.stepId === "retry") {
      finishTriage();
      return;
    }
    if (s.stepId && getStep(s.stepId)) answerStep(s.stepId, values);
  };

  const restart = () => {
    store().resetTriage();
    start();
  };

  return { start, choose, restart };
}

// Free questions on the /ask page, answered with the triage answers as context.
export function useAskFlow() {
  const add = (msg) => store().addAskMessage(msg);

  const start = () => {
    const s = store();
    if (s.askMessages.length) return;
    add({ role: "bot", text: s.outcome === "recommended" ? BOT.askWelcomeWithProfile : BOT.askWelcome });
  };

  const send = async (text) => {
    const clean = text.trim();
    if (!clean) return;
    const s = store();
    const app = useAppStore.getState();
    add({ role: "user", text: clean });
    if (looksSwahili(clean) && lang(app.language) === "en") {
      app.setLanguage("sw");
      add({ role: "bot", text: BOT.switchedToSwahili });
    }
    s.setAskLoading(true);
    try {
      const res = await postChat({
        message: clean,
        session_id: s.sessionId,
        language: useAppStore.getState().language,
        context: { mode: "question", triage_summary: triageSummary(s.answers) },
      });
      add({ role: "bot", text: res.reply });
    } catch {
      add({ role: "bot", text: BOT.askError });
    } finally {
      s.setAskLoading(false);
    }
  };

  return { start, send };
}
