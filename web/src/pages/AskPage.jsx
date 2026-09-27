import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { ChatShell } from "@/components/chat/ChatShell";
import { MessageList } from "@/components/chat/MessageList";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { ProfilePanel } from "@/components/chat/ProfilePanel";
import DoctorSelection from "@/components/chat/DoctorSelection";
import { useChatStore } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { useAskFlow } from "@/hooks/useChatFlow";
import { SUGGESTED_QUESTIONS, UI, lang, topicStatus } from "@/lib/triage";

export default function AskPage() {
  const { doctor, outcome, answers, askMessages, askLoading } = useChatStore();
  const l = lang(useAppStore((s) => s.language));
  const ui = UI[l];
  const flow = useAskFlow();
  const [input, setInput] = useState("");

  useEffect(() => {
    if (doctor) flow.start();
  }, [doctor]); // eslint-disable-line react-hooks/exhaustive-deps

  const topics = useMemo(() => topicStatus(answers, null), [answers]);

  if (!doctor) return <DoctorSelection />;

  const submit = (e) => {
    e.preventDefault();
    flow.send(input);
    setInput("");
  };

  // The triage answers give the doctor context; without them, point people to the questions.
  const aside =
    outcome === "recommended" ? (
      <ProfilePanel topics={topics} l={l} title={ui.triageTitle} />
    ) : (
      <div className="flex flex-col gap-4 rounded-3xl border border-[#E3ECEB] bg-white p-5">
        <p className="text-[15px] text-ink">{ui.noTriageYet}</p>
        <Link to="/" className="self-start rounded-full bg-gradient-to-r from-[#0E8C85] to-[#2DC2B0] px-5 py-2.5 text-sm font-semibold text-white">
          {ui.startTriage} →
        </Link>
      </div>
    );

  return (
    <ChatShell
      l={l}
      title={ui.navAsk}
      aside={aside}
      footer={
        <form onSubmit={submit} className="flex gap-3 border-t border-[#E3ECEB] px-4 py-4 sm:px-6">
          <label htmlFor="ask-input" className="sr-only">{ui.placeholderAsk}</label>
          <input
            id="ask-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ui.placeholderAsk}
            autoComplete="off"
            className="h-14 min-w-0 flex-1 rounded-full border border-[#D5E0DF] bg-white px-6 text-[15px] text-ink placeholder:text-muted focus:border-[#0E8C85] focus:outline-none focus:ring-2 focus:ring-[#0E8C85]/20"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || askLoading}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0E8C85] to-[#2DC2B0] text-white shadow-[0_4px_14px_rgba(14,140,133,0.3)] transition-opacity disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      }
    >
      <MessageList messages={askMessages} doctor={doctor} l={l} loading={askLoading}>
        {!askLoading && (
          <div className="pl-12">
            <QuickReplies
              options={SUGGESTED_QUESTIONS[l].map((q) => ({ v: q, label: q }))}
              onChoose={([q]) => flow.send(q)}
              resetKey={askMessages.length}
            />
          </div>
        )}
      </MessageList>
    </ChatShell>
  );
}
