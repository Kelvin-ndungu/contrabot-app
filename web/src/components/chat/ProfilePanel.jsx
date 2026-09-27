import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { UI } from "@/lib/triage";

export function profileProgress(topics) {
  const applicable = topics.filter((tp) => tp.applicable);
  return { done: applicable.filter((tp) => tp.done).length, total: applicable.length };
}

export function ProfilePanel({ topics, l, title }) {
  const ui = UI[l];
  const { done, total } = profileProgress(topics);

  return (
    <div className="flex h-full flex-col gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{title ?? ui.profileTitle}</p>
        <p className="mt-1 text-ink">
          <span className="text-4xl font-bold tabular-nums">{done}</span>
          <span className="text-xl text-muted tabular-nums"> / {total}</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E3ECEB]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0E8C85] to-[#5FD9C8] transition-[width] duration-500"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col rounded-3xl border border-[#E3ECEB] bg-white px-5 py-2 shadow-[0_2px_16px_rgba(16,60,60,0.05)]">
        {topics.map((tp) => {
          const summary = tp.summary(l);
          return (
            <li
              key={tp.id}
              className={cn("flex items-start justify-between gap-3 py-2.5", !tp.applicable && "opacity-45")}
              aria-current={tp.current ? "step" : undefined}
            >
              <div className="min-w-0">
                <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", tp.current ? "text-[#0E8C85]" : "text-muted")}>
                  {tp[l]}
                  {tp.current && <span className="ml-2 rounded-full bg-[#E8F6F4] px-2 py-0.5 normal-case tracking-normal">{ui.now}</span>}
                </p>
                <p className="truncate text-[15px] text-ink" title={summary}>
                  {!tp.applicable ? ui.notNeeded : summary || "—"}
                </p>
              </div>
              <span className="mt-2 shrink-0" aria-hidden>
                {tp.done ? (
                  <Check className="h-5 w-5 text-[#0E8C85]" strokeWidth={2.5} />
                ) : (
                  <span className={cn("block h-5 w-5 rounded-full border-2", tp.current ? "border-[#0E8C85]" : "border-[#D5E0DF]")} />
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="flex items-center gap-2 rounded-2xl bg-[#E8F6F4] px-4 py-3 text-sm font-medium text-[#0E7A80]">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        {ui.privacy}
      </p>
    </div>
  );
}
