import { useEffect, useRef } from "react";
import { ChatBubble, TypingIndicator } from "./ChatBubble";
import { RecommendationCard } from "./RecommendationCard";
import { DOCTORS, answerLabel, getStep, t } from "@/lib/triage";

function messageText(m, l, doctorName) {
  if (m.kind === "question") {
    return `${m.prefix ? `${t(m.prefix, l)} ` : ""}${getStep(m.stepId).q[l]}`;
  }
  if (m.kind === "answer") return answerLabel(m.stepId, m.values, l);
  return typeof m.text === "string" ? m.text : t(m.text, l, doctorName);
}

// Renders a conversation, then whatever comes after it (answer chips), and keeps the latest in view.
export function MessageList({ messages, doctor, l, loading, onShowVisualization, children }) {
  const doc = DOCTORS[doctor];
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading]);

  return (
    <>
      {messages.map((m) =>
        m.kind === "recommendation" ? (
          <ChatBubble key={m.id} role="bot" initials={doc.initials} wide>
            <RecommendationCard data={m.data} l={l} onShowVisualization={onShowVisualization} />
          </ChatBubble>
        ) : (
          <ChatBubble key={m.id} role={m.role} initials={doc.initials} timestamp={m.timestamp}>
            {messageText(m, l, doc.name)}
          </ChatBubble>
        )
      )}
      {loading && <TypingIndicator initials={doc.initials} />}
      {children}
      <div ref={bottomRef} />
    </>
  );
}
