import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DialogClose } from "@radix-ui/react-dialog";
import { ChatShell } from "@/components/chat/ChatShell";
import { MessageList } from "@/components/chat/MessageList";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { ProfilePanel, profileProgress } from "@/components/chat/ProfilePanel";
import DoctorSelection from "@/components/chat/DoctorSelection";
import { useChatStore } from "@/store/useChatStore";
import { useAppStore } from "@/store/useAppStore";
import { useTriageFlow } from "@/hooks/useChatFlow";
import { BOT, UI, getStep, lang, t, topicStatus, visibleOptions } from "@/lib/triage";

// The 3D explainer pulls in three.js, so it only loads when opened.
const BodyVisualization = lazy(() => import("@/components/chat/BodyVisualization"));

export default function ChatPage() {
  const { doctor, stepId, outcome, answers, messages, loading, recommendation } = useChatStore();
  const l = lang(useAppStore((s) => s.language));
  const ui = UI[l];
  const flow = useTriageFlow();
  const navigate = useNavigate();
  const [visMethod, setVisMethod] = useState(null);

  useEffect(() => {
    if (doctor) flow.start();
  }, [doctor]); // eslint-disable-line react-hooks/exhaustive-deps

  const topics = useMemo(() => {
    const status = topicStatus(answers, stepId);
    // After an under-18 exit, the remaining topics no longer apply.
    return outcome === "underage" ? status.map((tp) => (tp.id === "age" ? tp : { ...tp, applicable: false, done: false })) : status;
  }, [answers, stepId, outcome]);

  if (!doctor) return <DoctorSelection />;

  const step = stepId ? getStep(stepId) : null;
  const { done, total } = profileProgress(topics);
  const currentTopic = topics.find((tp) => tp.current);

  // What the user can tap next. The triage has no free text.
  let replies = null;
  if (!loading) {
    if (stepId === "welcome") {
      replies = { options: [{ v: "start", label: t(BOT.startYes, l) }, { v: "what", label: t(BOT.startWhat, l) }], onChoose: flow.choose };
    } else if (stepId === "retry") {
      replies = { options: [{ v: "retry", label: t(BOT.tryAgain, l) }], onChoose: flow.choose };
    } else if (step) {
      replies = { options: visibleOptions(step, answers).map((opt) => ({ ...opt, label: opt[l] })), multi: step.multi, onChoose: flow.choose };
    } else if (outcome) {
      const actions =
        outcome === "underage"
          ? [["restart", ui.startOver]]
          : [["/chat", ui.askQuestion], ["restart", ui.startOver]];
      replies = {
        options: actions.map(([v, label]) => ({ v, label })),
        onChoose: ([v]) => (v === "restart" ? flow.restart() : navigate(v)),
      };
    }
  }

  const restartButton = (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label={ui.restartTitle} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#CFE7E4] text-[#0E7A80] hover:bg-[#E8F6F4]">
          <RotateCcw className="h-4.5 w-4.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ui.restartTitle}</DialogTitle>
          <DialogDescription>{ui.restartBody}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 pt-4">
          <DialogClose className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-page">{ui.cancel}</DialogClose>
          <DialogClose onClick={flow.restart} className="rounded-full bg-[#0E8C85] px-5 py-2 text-sm font-semibold text-white">
            {ui.restartYes}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Stage, on screens without the profile panel
  const stageBar = (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex items-center gap-3 border-b border-[#E3ECEB] px-4 py-2.5 text-left xl:hidden">
          <span className="shrink-0 text-sm font-semibold text-[#0E7A80]">
            {currentTopic ? ui.stepOf(Math.min(done + 1, total), total, currentTopic[l]) : `${done} / ${total}`}
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E3ECEB]">
            <span className="block h-full rounded-full bg-gradient-to-r from-[#0E8C85] to-[#5FD9C8]" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </span>
          <span className="shrink-0 text-sm font-semibold text-[#0E7A80] underline underline-offset-4">{ui.viewProfile}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#F7FBFA]">
        <DialogTitle className="sr-only">{ui.profileTitle}</DialogTitle>
        <ProfilePanel topics={topics} l={l} />
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <ChatShell
        l={l}
        title={ui.navTriage}
        headerAction={restartButton}
        banner={stageBar}
        aside={<ProfilePanel topics={topics} l={l} />}
        footer={
          !outcome && (
            <p className="border-t border-[#E3ECEB] px-6 py-4 text-center text-sm text-muted">{ui.tapToAnswer}</p>
          )
        }
      >
        <MessageList messages={messages} doctor={doctor} l={l} loading={loading} onShowVisualization={setVisMethod}>
          {replies && (
            <div className="pl-12">
              <QuickReplies {...replies} continueLabel={ui.continue} resetKey={`${stepId}-${messages.length}`} />
            </div>
          )}
        </MessageList>
      </ChatShell>

      {visMethod && (
        <Suspense fallback={null}>
          <BodyVisualization method={visMethod} doctorId={doctor} onClose={() => setVisMethod(null)} recommendations={recommendation} />
        </Suspense>
      )}
    </>
  );
}
