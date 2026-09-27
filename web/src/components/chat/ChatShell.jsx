import { Link, NavLink } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/useChatStore";
import { DOCTORS, UI } from "@/lib/triage";
import { DoctorImage, DoctorPanel } from "./DoctorPanel";
import { LanguageToggle } from "./LanguageToggle";

// Frame shared by the triage (/) and questions (/ask) pages: doctor on the left,
// conversation in the middle, context panel on the right.
export function ChatShell({ l, title, headerAction, banner, aside, children, footer }) {
  const doctor = useChatStore((s) => s.doctor);
  const setDoctor = useChatStore((s) => s.setDoctor);
  const doc = DOCTORS[doctor];
  const ui = UI[l];

  return (
    <>
      <Helmet>
        <title>{title} — ContraBot</title>
      </Helmet>
      <div className="flex h-screen bg-white text-ink">
        <aside className="hidden w-[26%] max-w-[420px] border-r border-[#E3ECEB] lg:block">
          <DoctorPanel id={doctor} l={l} onSwitch={() => setDoctor(null)} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-[#E3ECEB] px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/"
                aria-label="ContraBot home"
                className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2B7A9E] to-[#5C4F9E] text-sm font-bold text-white sm:flex"
              >
                CB
              </Link>
              <button
                type="button"
                onClick={() => setDoctor(null)}
                aria-label={ui.switchDoctor}
                className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-[#BFEAE3] bg-[#E6F6F3] lg:hidden"
              >
                <DoctorImage id={doctor} className="scale-150 object-top" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold leading-tight">ContraBot</p>
                <p className="truncate text-sm text-muted">
                  {doc.name} · <span className="font-semibold text-[#0E8C85]">{ui.online}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle />
              {headerAction}
            </div>
          </header>

          <nav className="flex justify-center border-b border-[#E3ECEB] px-4 py-3">
            <div className="inline-flex rounded-full bg-[#EEF5F4] p-1">
              {[["/", ui.navTriage], ["/ask", ui.navAsk]].map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-6",
                      isActive ? "bg-[#0E8C85] text-white shadow" : "text-muted hover:text-ink"
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>

          {banner}

          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">{children}</div>
          </div>

          {footer}
        </main>

        {aside && (
          <aside className="hidden w-[26%] max-w-[420px] overflow-y-auto border-l border-[#E3ECEB] bg-[#F7FBFA] p-6 xl:block">
            {aside}
          </aside>
        )}
      </div>
    </>
  );
}
