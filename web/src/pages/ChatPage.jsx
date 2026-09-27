import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { RotateCcw, Send } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChatBubble, TypingIndicator } from "@/components/chat/ChatBubble";
import { RecommendationCard } from "@/components/chat/RecommendationCard";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { useChatStore } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { useChatFlow } from "@/hooks/useChatFlow";

const QUICK = {
  0: ["Yes, let's go →", "What is this?"],
  1: ["Under 18", "18–24", "25–34", "35–44", "45+"],
  2: ["Yes", "No"],
  4: ["Set it and forget it", "I want daily control", "Prefer non-hormonal", "I'm not sure yet"],
  5: ["I can visit a clinic", "Pharmacy only", "Through a CHW only"],
  8: ["Side effect help", "I'm already on a method", "Start over", "Find a clinic"],
};

const HEALTH_OPTIONS = [
  "High blood pressure",
  "Migraines with aura",
  "History of blood clots",
  "Diabetes",
  "Liver disease",
  "Breast cancer history",
  "None of these",
];

export default function ChatPage() {
  const prefill = useAppStore((s) => s.prefillChat);
  const setPrefill = useAppStore((s) => s.setPrefill);
  const { flowState, messages, profile, recommendations, loading, loadingStep, reset } = useChatStore();
  const { handleQuickReply, initWelcome } = useChatFlow();
  const [input, setInput] = useState("");
  const [selectedHealth, setSelectedHealth] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    initWelcome();
    if (prefill === "side_effects") {
      useChatStore.getState().setFlowState(8);
      useChatStore.getState().setSideEffectFlow({ step: "method" });
      useChatStore.getState().addMessage({
        role: "bot",
        text: "Which method are you using?",
        timestamp: new Date().toLocaleTimeString(),
      });
      setPrefill(null);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const confirmHealth = (extraNote = "") => {
    const flags = selectedHealth.includes("None of these") ? [] : selectedHealth;
    const updates = { health_flags: flags };
    if (extraNote) updates.other_concerns = extraNote;
    useChatStore.getState().updateProfile(updates);
    useChatStore.getState().setFlowState(4);
    const label = [
      flags.length ? flags.join(", ") : null,
      extraNote || null,
    ]
      .filter(Boolean)
      .join(" — ") || "None";
    useChatStore.getState().addMessage({ role: "user", text: label, timestamp: new Date().toLocaleTimeString() });
    useChatStore.getState().addMessage({
      role: "bot",
      text: "What matters most to you in a contraceptive method? Tap a choice or type your own.",
      timestamp: new Date().toLocaleTimeString(),
    });
    setSelectedHealth([]);
  };

  const toggleHealth = (opt) => {
    if (opt === "None of these") {
      setSelectedHealth(["None of these"]);
      return;
    }
    setSelectedHealth((prev) => {
      const next = prev.filter((x) => x !== "None of these");
      return next.includes(opt) ? next.filter((x) => x !== opt) : [...next, opt];
    });
  };

  const sendFreeText = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    if (flowState === 3) {
      confirmHealth(text);
      return;
    }
    handleQuickReply(text);
  };

  return (
    <>
      <Helmet>
        <title>Chat — ContraBot</title>
        <meta name="description" content="Private contraception counseling chat." />
      </Helmet>

      <div className="flex h-screen flex-col bg-page">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo showText={false} />
            <div>
              <p className="font-semibold text-ink">ContraBot</p>
              <p className="text-xs text-muted">
                <span className="inline-block h-2 w-2 rounded-full bg-success mr-1" />
                AI Contraception Counselor · Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector className="w-32 hidden sm:block" />
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Restart">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start over?</DialogTitle>
                  <DialogDescription>Your current answers will be cleared. This cannot be undone.</DialogDescription>
                </DialogHeader>
                <Button
                  onClick={() => {
                    reset();
                    initWelcome();
                  }}
                >
                  Yes, start over
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-full flex-col border-r border-line md:w-[60%]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m) =>
                m.type === "recommendation" ? (
                  <RecommendationCard key={m.id} data={m.data} />
                ) : m.type === "side_effect" ? (
                  <ChatBubble key={m.id} role="bot">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">{m.text}</div>
                  </ChatBubble>
                ) : (
                  <ChatBubble key={m.id} role={m.role} timestamp={m.timestamp}>
                    {m.text}
                  </ChatBubble>
                )
              )}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-line bg-white p-4 space-y-3">
              {flowState === 3 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {HEALTH_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleHealth(opt)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                          selectedHealth.includes(opt) ? "border-primary bg-primary/10 text-primary" : "border-line text-muted"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {selectedHealth.length > 0 && (
                    <Button size="sm" onClick={() => confirmHealth()}>
                      Continue →
                    </Button>
                  )}
                </div>
              )}

              {flowState !== 3 && (QUICK[flowState] || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(QUICK[flowState] || []).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleQuickReply(q)}
                      className="rounded-full border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendFreeText()}
                  placeholder={
                    flowState === 3
                      ? "Or type any other health concern..."
                      : "Type a message or tap an option above..."
                  }
                />
                <Button size="icon" onClick={sendFreeText} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <aside className="hidden w-[40%] overflow-y-auto bg-page p-6 md:block">
            <ChatSidebar
              flowState={flowState}
              profile={profile}
              recommendations={recommendations}
              loading={loading}
              loadingStep={loadingStep}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
