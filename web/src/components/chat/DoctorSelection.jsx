import { useChatStore } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { DOCTORS, UI, lang } from "@/lib/triage";
import { LanguageToggle } from "./LanguageToggle";
import { DoctorImage } from "./DoctorPanel";

export default function DoctorSelection({ onSelect }) {
  const setDoctor = useChatStore((s) => s.setDoctor);
  const l = lang(useAppStore((s) => s.language));
  const ui = UI[l];

  const choose = (id) => {
    setDoctor(id);
    onSelect?.(id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#E6F6F3] to-white px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">
        <LanguageToggle className="self-end" />
        <div className="text-center">
          <h1 className="text-3xl font-bold text-ink [text-wrap:balance] sm:text-4xl">{ui.chooseTitle}</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted">{ui.chooseSub}</p>
        </div>
        <div className="grid w-full gap-6 sm:grid-cols-2">
          {Object.entries(DOCTORS).map(([id, doc]) => (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              className="group flex flex-col items-center overflow-hidden rounded-3xl border border-[#E3ECEB] bg-white text-left shadow-[0_4px_24px_rgba(16,60,60,0.06)] transition hover:-translate-y-1 hover:border-[#0E8C85] hover:shadow-[0_10px_32px_rgba(14,140,133,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E8C85]"
            >
              <div className="h-72 w-full bg-[#EEF8F4]">
                <DoctorImage id={id} />
              </div>
              <div className="flex w-full flex-col items-center gap-1 p-5">
                <p className="text-xl font-bold text-ink">{doc.name}</p>
                <p className="text-sm text-muted">{doc.role[l]}</p>
                <span className="mt-3 rounded-full bg-gradient-to-r from-[#0E8C85] to-[#2DC2B0] px-6 py-2.5 text-sm font-semibold text-white">
                  {ui.choose} {doc.name} →
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
