import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { lang } from "@/lib/triage";

const OPTIONS = [
  { value: "en", label: "English", short: "EN" },
  { value: "sw", label: "Kiswahili", short: "SW" },
];

// The chat triage is written in English and Kiswahili.
export function LanguageToggle({ className }) {
  const current = lang(useAppStore((s) => s.language));
  const setLanguage = useAppStore((s) => s.setLanguage);

  return (
    <div role="group" aria-label="Language" className={cn("inline-flex rounded-full border border-[#CFE7E4] bg-white p-1", className)}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={current === opt.value}
          onClick={() => setLanguage(opt.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
            current === opt.value ? "bg-[#0E8C85] text-white" : "text-[#0E7A80] hover:bg-[#E8F6F4]"
          )}
        >
          <span className="hidden sm:inline">{opt.label}</span>
          <span className="sm:hidden">{opt.short}</span>
        </button>
      ))}
    </div>
  );
}
