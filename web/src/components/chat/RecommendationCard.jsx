import { AlertTriangle, Info, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALERT_TEXT, CARD_TEXT, MEC_LABEL, METHOD_TEXT, REASON_SW } from "@/lib/triage";

// Reasons that only say a method doesn't apply (e.g. LAM when there's no baby) are left out.
const NOT_APPLICABLE = new Set(["female_only", "lam_over_6m", "lam_not_breastfeeding"]);
const URGENT_ALERTS = new Set(["emergency_contraception", "pregnancy_test", "pregnant"]);

const methodName = (m, l) => METHOD_TEXT[m.method]?.[l][0] ?? m.name;
const methodBlurb = (m, l) => METHOD_TEXT[m.method]?.[l][1] ?? m.description;
const reasonText = (code, english, l) => (l === "sw" && REASON_SW[code]) || english;

export function RecommendationCard({ data, l, onShowVisualization }) {
  const txt = CARD_TEXT[l];
  if (!data?.recommendations?.length) return null;

  const ruledOut = (data.safety_eliminations || []).filter((e) => !NOT_APPLICABLE.has(e.reason_code));

  return (
    <div className="w-full space-y-4 rounded-3xl border border-[#E3ECEB] bg-white p-5 shadow-[0_4px_24px_rgba(16,60,60,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
          <ShieldCheck className="h-5 w-5 text-[#0E8C85]" aria-hidden /> {txt.title}
        </h3>
        <span className="rounded-full bg-[#E8F6F4] px-3 py-1 text-xs font-semibold text-[#0E7A80]">{txt.screened}</span>
      </div>

      {(data.alerts || []).map((code) => {
        const alert = ALERT_TEXT[code]?.[l];
        if (!alert) return null;
        const urgent = URGENT_ALERTS.has(code);
        return (
          <div
            key={code}
            className={cn(
              "flex gap-3 rounded-2xl border p-3.5 text-sm",
              urgent ? "border-[#F2B8A2] bg-[#FDF1EC] text-[#7A2E12]" : "border-[#CFE7E4] bg-[#F1FAF8] text-[#0F4F4B]"
            )}
          >
            {urgent ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <p><strong className="block font-semibold">{alert[0]}</strong>{alert[1]}</p>
          </div>
        );
      })}

      <ol className="grid gap-3">
        {data.recommendations.map((m, i) => (
          <li key={m.method} className="rounded-2xl border border-[#E3ECEB] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="text-base font-bold text-ink">
                <span className="mr-2 text-[#0E8C85] tabular-nums">{i + 1}.</span>
                {methodName(m, l)}
              </h4>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  m.mec_category === 1 ? "bg-[#E6F4EA] text-[#1E6B3A]" : "bg-[#FBF3D6] text-[#7A5B0E]"
                )}
              >
                {MEC_LABEL[m.mec_category]?.[l]}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted">{methodBlurb(m, l)}</p>
            <p className="mt-2 text-xs font-medium text-ink/70 tabular-nums">
              {m.duration} · {txt.pregnancyRate(Math.max(0, Math.round((1 - m.effectiveness_typical) * 100)) || "<1")}
            </p>
            {m.caution && (
              <p className="mt-2 flex gap-1.5 text-sm text-[#7A5B0E]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {reasonText(m.caution_code, m.caution, l)}
              </p>
            )}
            {onShowVisualization && (
              <button
                type="button"
                onClick={() => onShowVisualization(m.method)}
                className="mt-3 text-sm font-semibold text-[#0E7A80] underline-offset-4 hover:underline"
              >
                {txt.howItWorks} →
              </button>
            )}
          </li>
        ))}
      </ol>

      {ruledOut.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{txt.notForYou}</p>
          <ul className="grid gap-1.5">
            {ruledOut.map((e) => (
              <li key={e.method} className="flex gap-2 text-sm text-ink/80">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-[#B3261E]" aria-hidden />
                <span>
                  <strong className="font-semibold">{METHOD_TEXT[e.method]?.[l][0] ?? e.method}</strong>
                  {": "}
                  {reasonText(e.reason_code, e.reason, l)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="rounded-2xl bg-[#FDF6EC] px-4 py-3 text-sm text-[#6B4A12]">{txt.confirm}</p>
    </div>
  );
}
