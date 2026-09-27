import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Tap-to-answer chips. Single-choice answers send on tap; multi-choice ones collect
// ticks and send with the Continue button.
export function QuickReplies({ options, multi = false, onChoose, continueLabel, resetKey }) {
  const [picked, setPicked] = useState([]);
  useEffect(() => setPicked([]), [resetKey]);

  const toggle = (opt) => {
    if (!multi) return onChoose([opt.v]);
    setPicked((prev) => {
      if (opt.exclusive) return prev.includes(opt.v) ? [] : [opt.v];
      const withoutExclusive = prev.filter((v) => !options.find((o) => o.v === v)?.exclusive);
      return withoutExclusive.includes(opt.v) ? withoutExclusive.filter((v) => v !== opt.v) : [...withoutExclusive, opt.v];
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        {options.map((opt) => {
          const on = picked.includes(opt.v);
          return (
            <button
              key={opt.v}
              type="button"
              aria-pressed={multi ? on : undefined}
              onClick={() => toggle(opt)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border-2 px-5 py-2 text-left text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E8C85] focus-visible:ring-offset-2",
                on
                  ? "border-[#0E8C85] bg-[#0E8C85] text-white"
                  : "border-[#0E8C85] bg-white text-[#0E7A80] hover:bg-[#E8F6F4]"
              )}
            >
              {on && <Check className="h-4 w-4" aria-hidden />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {multi && (
        <div>
          <button
            type="button"
            disabled={!picked.length}
            onClick={() => onChoose(picked)}
            className="rounded-full bg-gradient-to-r from-[#0E8C85] to-[#2DC2B0] px-6 py-2.5 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(14,140,133,0.25)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {continueLabel} →
          </button>
        </div>
      )}
    </div>
  );
}
