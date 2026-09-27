import { cn } from "@/lib/utils";

function Avatar({ initials }) {
  return (
    <div className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-[#2B7A9E] to-[#5C4F9E] text-xs font-bold text-white shadow-sm">
      {initials}
    </div>
  );
}

export function ChatBubble({ role, children, timestamp, initials, wide = false }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex items-end gap-3", isUser && "flex-row-reverse")}>
      {!isUser && <Avatar initials={initials} />}
      <div className={cn("flex flex-col", wide ? "w-full max-w-[640px]" : "max-w-[80%]", isUser && "items-end")}>
        <div
          className={cn(
            "text-[15px] leading-relaxed",
            isUser
              ? "rounded-[22px_22px_6px_22px] bg-gradient-to-r from-[#0E8C85] to-[#2DC2B0] px-5 py-3 text-white shadow-[0_4px_14px_rgba(14,140,133,0.25)]"
              : wide
                ? ""
                : "rounded-[22px_22px_22px_6px] border border-[#E3ECEB] bg-white px-5 py-3 text-ink shadow-[0_2px_10px_rgba(16,60,60,0.06)]"
          )}
        >
          {children}
        </div>
        {timestamp && <p className="mt-1.5 px-1 text-[11px] text-muted">{timestamp}</p>}
      </div>
    </div>
  );
}

export function TypingIndicator({ initials }) {
  return (
    <div className="flex items-end gap-3">
      <Avatar initials={initials} />
      <div className="flex items-center gap-1.5 rounded-[22px_22px_22px_6px] border border-[#E3ECEB] bg-white px-5 py-4">
        {[0, 0.15, 0.3].map((delay) => (
          <span key={delay} className="typing-dot h-2 w-2 rounded-full bg-[#2DC2B0]" style={{ animationDelay: `${delay}s` }} />
        ))}
      </div>
    </div>
  );
}
