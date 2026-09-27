import { useEffect, useRef, useState } from "react";
import { postUssd } from "@/api/client";

const DEMO_PHONE = "+254711000001";
const KEYS = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", ""],
  ["#", ""],
];
const MULTI = {
  2: "ABC2",
  3: "DEF3",
  4: "GHI4",
  5: "JKL5",
  6: "MNO6",
  7: "PQRS7",
  8: "TUV8",
  9: "WXYZ9",
};

function wantsLetters(text) {
  return /type your/i.test(text || "");
}

function isMenu(text) {
  return /(^|\n)\d+\./.test(text || "");
}

export default function FeaturePhone({ code, labels }) {
  const [phase, setPhase] = useState("idle");
  const [screen, setScreen] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const sessionRef = useRef("");
  const partsRef = useRef([]);
  const tapRef = useRef({ key: "", at: 0, i: 0 });
  const inputRef = useRef(null);

  const idleText = `ContraBot\n\n${labels.idleBody}\n${code}`;
  const shown = busy ? labels.waiting : phase === "idle" ? idleText : screen;

  useEffect(() => {
    if (phase !== "live") return;
    if (wantsLetters(screen)) setAlpha(true);
    else if (isMenu(screen)) setAlpha(false);
  }, [screen, phase]);

  useEffect(() => {
    if (phase === "live") inputRef.current?.focus();
  }, [phase, screen]);

  async function exchange(text) {
    setBusy(true);
    setScreen(labels.waiting);
    try {
      const result = await postUssd({
        sessionId: sessionRef.current,
        phoneNumber: DEMO_PHONE,
        text,
      });
      setScreen(result.end ? `${result.message}\n\n${labels.ended}` : result.message);
      setPhase(result.end ? "ended" : "live");
      setDraft("");
    } catch {
      setScreen(labels.error);
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  function dial() {
    if (busy) return;
    if (phase === "idle" && draft.trim() && draft.replace(/\s/g, "") !== code.replace(/\s/g, "")) {
      setScreen(labels.unknown);
      setPhase("error");
      setDraft("");
      return;
    }
    sessionRef.current = `demo-${crypto.randomUUID()}`;
    partsRef.current = [];
    setDraft("");
    setAlpha(false);
    exchange("");
  }

  function submit() {
    if (busy || phase !== "live") return;
    const answer = draft.trim();
    if (!answer) return;
    const parts = partsRef.current.concat(answer);
    partsRef.current = parts;
    exchange(parts.join("*"));
  }

  function hangup() {
    if (busy) return;
    sessionRef.current = "";
    partsRef.current = [];
    setDraft("");
    setAlpha(false);
    setScreen("");
    setPhase("idle");
  }

  function pressKey(key) {
    if (busy) return;
    if (phase !== "live") {
      if (phase === "idle") setDraft((d) => (d + key).slice(0, 20));
      return;
    }
    if (key === "*") {
      setDraft((d) => d.slice(0, -1));
      return;
    }
    if (key === "#") {
      submit();
      return;
    }
    if (!alpha || !MULTI[key]) {
      setDraft((d) => (d + key).slice(0, 80));
      return;
    }
    const cycle = MULTI[key];
    const now = Date.now();
    setDraft((d) => {
      if (tapRef.current.key === key && now - tapRef.current.at < 800 && d.length) {
        const i = (tapRef.current.i + 1) % cycle.length;
        tapRef.current = { key, at: now, i };
        return d.slice(0, -1) + cycle[i].toLowerCase();
      }
      tapRef.current = { key, at: now, i: 0 };
      return (d + cycle[0].toLowerCase()).slice(0, 80);
    });
  }

  function onCall() {
    if (phase === "live") submit();
    else dial();
  }

  return (
    <div className="mx-auto w-[300px]" data-testid="feature-phone">
      <div className="rounded-[2.2rem] bg-[#1c211c] p-3 shadow-[0_20px_50px_rgba(16,40,30,0.28)] ring-1 ring-black/30">
        <div className="mb-2 flex justify-center">
          <div className="h-1.5 w-14 rounded-full bg-black/50" />
        </div>
        <div className="flex min-h-[248px] flex-col rounded-xl bg-[#c5d4ae] px-3 py-2 text-[#1a2614] shadow-inner">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[#1a2614]/70">
            <span>USSD</span>
            <span>{alpha && phase === "live" ? labels.abc : labels.num}</span>
          </div>
          <p className="max-h-[150px] flex-1 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-snug" aria-live="polite">
            {shown}
          </p>
          <form
            className="mt-1 flex items-center gap-1 border-t border-[#1a2614]/20 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (phase === "live") submit();
              else onCall();
            }}
          >
            <span className="font-mono text-[13px]">&gt;</span>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 80))}
              disabled={busy}
              aria-label={labels.reply}
              placeholder={phase === "live" ? labels.reply : phase === "idle" ? code : ""}
              className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-[#1a2614]/35 disabled:opacity-60"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setDraft((d) => d.slice(0, -1))}
              disabled={busy || !draft}
              className="text-[11px] font-bold uppercase disabled:opacity-30"
            >
              {labels.clear}
            </button>
          </form>
          <div className="mt-1 flex justify-between text-[11px] font-bold uppercase">
            <button type="button" onClick={phase === "live" ? submit : onCall} disabled={busy} className="disabled:opacity-40">
              {phase === "live" ? labels.ok : labels.call}
            </button>
            <button type="button" onClick={hangup} disabled={busy || phase === "idle"} className="disabled:opacity-40">
              {labels.exit}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 px-1">
          {KEYS.map(([digit, letters]) => (
            <button
              key={digit}
              type="button"
              onClick={() => pressKey(digit)}
              disabled={busy}
              aria-label={letters ? `${digit} ${letters}` : digit}
              className="flex h-11 flex-col items-center justify-center rounded-full bg-[#2c332c] text-white transition active:bg-[#3e473e] disabled:opacity-40"
            >
              <span className="text-base font-semibold leading-none">{digit}</span>
              <span className="h-3 text-[8px] tracking-widest text-white/55">{letters}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between px-4 pb-1">
          <button
            type="button"
            onClick={onCall}
            disabled={busy}
            aria-label={labels.call}
            className="h-11 w-16 rounded-full bg-[#3cba4a] text-[11px] font-bold uppercase text-white shadow-inner disabled:opacity-40"
          >
            {labels.call}
          </button>
          <button
            type="button"
            onClick={() => phase === "live" && setAlpha((v) => !v)}
            disabled={busy || phase !== "live"}
            className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/80 disabled:opacity-30"
          >
            {alpha ? labels.num : labels.abc}
          </button>
          <button
            type="button"
            onClick={hangup}
            disabled={busy}
            aria-label={labels.end}
            className="h-11 w-16 rounded-full bg-[#e23d3d] text-[11px] font-bold uppercase text-white shadow-inner disabled:opacity-40"
          >
            {labels.end}
          </button>
        </div>
      </div>
    </div>
  );
}
