import { useCallback } from "react";
import { postRecommend, postChat } from "@/api/client";
import { useChatStore } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { AGE_MAP, PREF_MAP, ACCESS_MAP, HEALTH_FLAG_MAP } from "@/lib/constants";

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function useChatFlow() {
  const store = useChatStore();
  const language = useAppStore((s) => s.language);

  const bot = useCallback(
    (text, extra = {}) => {
      store.addMessage({ role: "bot", text, timestamp: now(), ...extra });
    },
    [store]
  );

  const user = useCallback(
    (text) => {
      store.addMessage({ role: "user", text, timestamp: now() });
    },
    [store]
  );

  const fetchRecommendation = useCallback(async () => {
    store.setFlowState(6);
    store.setLoading(true, 0);
    bot("Reviewing your answers against WHO guidelines...");

    await new Promise((r) => setTimeout(r, 800));
    store.setLoadingStep(1);
    await new Promise((r) => setTimeout(r, 600));
    store.setLoadingStep(2);

    const p = store.profile;
    const payload = {
      age_group: AGE_MAP[p.age_group] || "25-34",
      breastfeeding: p.breastfeeding === "Yes",
      health_flags: (p.health_flags || []).map((h) => HEALTH_FLAG_MAP[h]).filter(Boolean),
      preference: PREF_MAP[p.preference] || "unsure",
      access: ACCESS_MAP[p.access] || "clinic",
      language,
    };

    try {
      const data = await postRecommend(payload);
      store.setRecommendations(data);
      useAppStore.getState().setSelectedMethods(data.recommendations.map((r) => r.method));
      store.setLoading(false);
      store.setFlowState(7);
      store.addMessage({ role: "bot", type: "recommendation", data, timestamp: now() });
      store.setFlowState(8);
      bot("Is there anything else I can help with?");
    } catch {
      store.setLoading(false);
      bot("Sorry, I couldn't load your recommendation. Please try again in a moment.");
    }
  }, [store, bot, language]);

  const handleQuickReply = useCallback(
    async (text) => {
      user(text);
      const state = store.flowState;
      const p = store.profile;

      if (state === 0) {
        if (text.includes("What is this")) {
          bot("ContraBot gives free, private contraception guidance based on WHO guidelines. Ready to answer 5 quick questions?");
          return;
        }
        store.setFlowState(1);
        bot("How old are you?");
        return;
      }

      if (state === 1) {
        store.updateProfile({ age_group: text });
        store.setFlowState(2);
        bot("Are you currently breastfeeding a baby under 6 months old?");
        return;
      }

      if (state === 2) {
        store.updateProfile({ breastfeeding: text });
        store.setFlowState(3);
        bot("Do you have any of the following? Select all that apply, type your own concern, or tap 'None of these'.");
        return;
      }

      if (state === 3) {
        // Free-text health concern alongside or instead of checkboxes
        const flags = Array.isArray(p.health_flags) ? p.health_flags : [];
        store.updateProfile({
          health_flags: flags,
          other_concerns: text,
        });
        store.setFlowState(4);
        bot("What matters most to you in a contraceptive method? Tap a choice or type your own.");
        return;
      }

      if (state === 4) {
        store.updateProfile({ preference: text });
        store.setFlowState(5);
        bot("How easily can you access healthcare?");
        return;
      }

      if (state === 5) {
        store.updateProfile({ access: text });
        await fetchRecommendation();
        return;
      }

      if (state === 8) {
        if (text === "Side effect help") {
          store.setSideEffectFlow({ step: "method" });
          bot("Which method are you using?");
          return;
        }
        if (text === "I'm already on a method") {
          store.setSideEffectFlow({ step: "current_method" });
          bot("Which method are you using?");
          return;
        }
        if (text === "Start over") {
          store.reset();
          bot("Hi 👋 I'm ContraBot, your private contraception guide. I'll ask you 5 quick questions and suggest the best options for you. Everything is confidential. Ready?");
          return;
        }
        if (text === "Find a clinic") {
          bot("Head to the clinic finder — tap the menu or visit the Facilities page.");
          return;
        }
      }

      const se = store.sideEffectFlow;
      if (se?.step === "method") {
        store.setSideEffectFlow({ ...se, method: text, step: "symptoms" });
        bot("What are you experiencing? Describe in your own words.");
        return;
      }
      if (se?.step === "symptoms") {
        try {
          const res = await postChat({
            message: `Side effects on ${se.method}: ${text}`,
            session_id: store.sessionId,
            language,
            context: { mode: "side_effects" },
          });
          store.addMessage({
            role: "bot",
            type: "side_effect",
            text: res.reply,
            timestamp: now(),
          });
          store.setSideEffectFlow(null);
        } catch {
          bot("I couldn't fetch guidance right now. If symptoms are severe, please visit a clinic.");
        }
        return;
      }
      if (se?.step === "current_method") {
        store.setSideEffectFlow({ ...se, method: text, step: "duration" });
        bot("How long have you been using it?");
        return;
      }
      if (se?.step === "duration") {
        bot(
          `Thank you for sharing. Continuing ${se.method} can be safe for many women. If anything worries you, a clinic visit is always okay — you deserve good care.`
        );
        store.setSideEffectFlow(null);
      }
    },
    [store, user, bot, fetchRecommendation, language]
  );

  const initWelcome = useCallback(() => {
    if (store.messages.length === 0) {
      bot("Hi 👋 I'm ContraBot, your private contraception guide. I'll ask you 5 quick questions and suggest the best options for you. Everything is confidential. Ready?");
    }
  }, [store.messages.length, bot]);

  return { handleQuickReply, initWelcome, fetchRecommendation };
}
