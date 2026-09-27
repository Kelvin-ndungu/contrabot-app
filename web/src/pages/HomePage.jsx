import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  HeartPulse,
  Hash,
  Lock,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { LanguageToggle } from "@/components/chat/LanguageToggle";
import { DoctorImage } from "@/components/chat/DoctorPanel";
import { useAppStore } from "@/store/useAppStore";
import { HOME, lang } from "@/lib/triage";

const GRADIENT_BUTTON =
  "inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0E8C85] to-[#2DC2B0] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(14,140,133,0.3)] transition hover:opacity-90";
const OUTLINE_BUTTON =
  "inline-flex items-center gap-2 rounded-full border-2 border-[#0E8C85] bg-white px-6 py-3 text-sm font-semibold text-[#0E7A80] transition hover:bg-[#E8F6F4]";
const CARD = "rounded-3xl border border-[#E3ECEB] bg-white shadow-[0_4px_24px_rgba(16,60,60,0.06)]";
const SOURCE_ICONS = [BookOpen, ShieldCheck, Users];
// Set in web/.env; without a WhatsApp number the button shows "Coming soon".
const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || "").replace(/\D/g, "");
const USSD_CODE = import.meta.env.VITE_USSD_CODE || "*384*51567#";

function PhoneButton({ href, icon, label, detail, className }) {
  const body = (
    <>
      {icon}
      <span className="flex flex-col text-left leading-tight">
        <span className="font-semibold">{label}</span>
        <span className="text-xs opacity-80">{detail}</span>
      </span>
    </>
  );
  const base = "flex min-w-[240px] items-center gap-3 rounded-2xl px-5 py-3 transition";
  if (!href) {
    return (
      <span aria-disabled="true" className={`${base} cursor-not-allowed border border-[#E3ECEB] bg-white text-muted`}>
        {body}
      </span>
    );
  }
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={`${base} ${className}`}>
      {body}
    </a>
  );
}

// WhatsApp and USSD, for people who would rather not use the website.
function PhoneChannels({ t }) {
  return (
    <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center gap-4 text-center">
      <div>
        <p className="font-semibold text-ink">{t.title}</p>
        <p className="mt-1 max-w-xl text-sm text-muted">{t.sub}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <PhoneButton
          href={WHATSAPP_NUMBER && `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.greeting)}`}
          icon={<img src="/icons/whatsapp.png" alt="" className="h-9 w-9" />}
          label={t.whatsapp}
          detail={WHATSAPP_NUMBER ? `+${WHATSAPP_NUMBER}` : t.soon}
          className="bg-[#25D366] text-white shadow-[0_4px_14px_rgba(37,211,102,0.35)] hover:bg-[#1EBE5A]"
        />
        <PhoneButton
          // "#" must be encoded or the dialler drops everything after it.
          href={`tel:${USSD_CODE.replace(/#/g, "%23")}`}
          icon={
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Hash className="h-5 w-5" />
            </span>
          }
          label={t.ussd}
          detail={`${t.dial} ${USSD_CODE}`}
          className="bg-gradient-to-r from-[#2B7A9E] to-[#5C4F9E] text-white shadow-[0_4px_14px_rgba(43,122,158,0.3)] hover:opacity-90"
        />
      </div>
    </div>
  );
}
const SAFETY_ICONS = [HeartPulse, Stethoscope, Lock];

function PathCard({ to, icon: Icon, path, primary }) {
  return (
    <Link
      to={to}
      className={`${CARD} group flex flex-col gap-3 p-6 transition hover:-translate-y-1 hover:border-[#0E8C85] hover:shadow-[0_10px_32px_rgba(14,140,133,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E8C85]`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E6F6F3] text-[#0E7A80]">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="text-xl font-bold">{path.title}</h2>
      <p className="flex-1 text-[15px] leading-relaxed text-muted">{path.text}</p>
      <span className={`${primary ? GRADIENT_BUTTON : OUTLINE_BUTTON} self-start`}>
        {path.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Steps({ icon: Icon, block }) {
  return (
    <div className={`${CARD} p-6 sm:p-8`}>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E6F6F3] text-[#0E7A80]">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-xl font-bold">{block.title}</h3>
      </div>
      <ol className="flex flex-col gap-5">
        {block.steps.map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0E8C85] to-[#2DC2B0] text-sm font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Section({ title, sub, children, className = "" }) {
  return (
    <section className={`px-4 py-16 sm:py-20 ${className}`}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-bold [text-wrap:balance] sm:text-4xl">{title}</h2>
          {sub && <p className="mt-3 text-muted">{sub}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export default function HomePage() {
  const l = lang(useAppStore((s) => s.language));
  const t = HOME[l];

  return (
    <div className="min-h-screen bg-white text-ink">
      <Helmet>
        <title>ContraBot — Family planning, explained simply</title>
      </Helmet>

      <header className="sticky top-0 z-10 border-b border-[#E3ECEB] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#2B7A9E] to-[#5C4F9E] text-sm font-bold text-white">
              CB
            </span>
            <span className="text-lg font-bold">ContraBot</span>
          </Link>
          <LanguageToggle />
        </div>
      </header>

      {/* Hero: what it is, and the two ways in. */}
      <section className="bg-gradient-to-b from-[#E6F6F3] to-white px-4 pb-16 pt-12 sm:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="inline-block rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#0E7A80] shadow-sm">
              {t.badge}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight [text-wrap:balance] sm:text-5xl">
              {t.titleA} <span className="text-[#0E8C85]">{t.titleB}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t.sub}</p>
          </div>
          {/* The photos are framed differently (full body vs waist up), so both are cropped from the top. */}
          <div className="mx-auto hidden w-full max-w-md grid-cols-2 gap-4 lg:grid" aria-hidden="true">
            {["amara", "kofi"].map((id, i) => (
              <div
                key={id}
                className={`h-80 overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#BFEAE3] to-[#E6F6F3] ${i ? "mt-10" : "mb-10"}`}
              >
                <DoctorImage id={id} className={id === "amara" ? "origin-top scale-[1.9] object-top" : "object-cover object-top"} />
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-2">
          <PathCard to="/chat" icon={MessageCircle} path={t.paths.chat} primary />
          <PathCard to="/triage" icon={ClipboardList} path={t.paths.triage} />
        </div>
        <PhoneChannels t={t.phone} />
      </section>

      <Section title={t.howTitle} sub={t.howSub}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Steps icon={MessageCircle} block={t.howChat} />
          <Steps icon={ClipboardList} block={t.howTriage} />
        </div>
      </Section>

      <Section title={t.dataTitle} sub={t.dataSub} className="bg-[#F4FAF9]">
        <div className="grid gap-6 md:grid-cols-3">
          {t.sources.map(([title, text], i) => {
            const Icon = SOURCE_ICONS[i];
            return (
              <div key={title} className={`${CARD} p-6`}>
                <Icon className="h-7 w-7 text-[#0E7A80]" />
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
              </div>
            );
          })}
        </div>
        <div className={`${CARD} mt-6 p-6 sm:p-8`}>
          <h3 className="text-lg font-bold">{t.dataHowTitle}</h3>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {t.dataHow.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2DC2B0]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title={t.safetyTitle}>
        <div className="grid gap-6 md:grid-cols-3">
          {t.safety.map(([title, text], i) => {
            const Icon = SAFETY_ICONS[i];
            return (
              <div key={title} className="flex flex-col gap-3 p-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E6F6F3] text-[#0E7A80]">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-[15px] leading-relaxed text-muted">{text}</p>
              </div>
            );
          })}
        </div>
      </Section>

      <section className="px-4 pb-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-3xl bg-gradient-to-br from-[#0E8C85] to-[#2B7A9E] px-6 py-12 text-center text-white">
          <h2 className="text-3xl font-bold text-white">{t.ctaTitle}</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/chat" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0E7A80] transition hover:opacity-90">
              <MessageCircle className="h-4 w-4" /> {t.paths.chat.title}
            </Link>
            <Link to="/triage" className="inline-flex items-center gap-2 rounded-full border-2 border-white px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              <ClipboardList className="h-4 w-4" /> {t.paths.triage.title}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E3ECEB] px-4 py-8">
        <p className="mx-auto max-w-3xl text-center text-sm text-muted">{t.footer}</p>
      </footer>
    </div>
  );
}
