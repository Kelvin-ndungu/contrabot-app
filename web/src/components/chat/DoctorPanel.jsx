import { DOCTORS, UI } from "@/lib/triage";
import { cn } from "@/lib/utils";

// amara.png has a light mint background whose edges fade to transparent inside the file.
export function DoctorImage({ id, className }) {
  const doc = DOCTORS[id] || DOCTORS.amara;
  return (
    <img
      src={doc.image}
      alt={doc.name}
      className={cn("h-full w-full select-none object-contain object-bottom", className)}
      draggable={false}
    />
  );
}

export function DoctorPanel({ id, l, onSwitch }) {
  const doc = DOCTORS[id];
  const ui = UI[l];
  return (
    <div className="flex h-full flex-col items-center bg-gradient-to-b from-[#EEF8F4] via-[#EEF8F4] to-[#F6FBF9] px-6 pb-8 pt-10">
      <div className="relative w-full flex-1">
        <div className="relative h-full min-h-[280px]">
          <DoctorImage id={id} />
        </div>
      </div>
      <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
        <p className="text-2xl font-bold text-ink">{doc.name}</p>
        <p className="text-muted">{ui.guide}</p>
        <p className="mt-1 flex items-center gap-2 font-semibold text-[#0E8C85]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#22B573]" aria-hidden /> {ui.online}
        </p>
      </div>
      <button
        type="button"
        onClick={onSwitch}
        className="mt-10 text-sm font-semibold text-[#0E7A80] underline-offset-4 hover:underline"
      >
        {ui.switchDoctor}
      </button>
    </div>
  );
}
