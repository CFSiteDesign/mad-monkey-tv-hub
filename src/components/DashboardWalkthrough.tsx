import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, MousePointer2, FileImage, GripVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Animated, action-driven dashboard walkthrough.
 *
 * Each step can:
 *   - spotlight a real DOM element (selector)
 *   - show a hint pill near the pointer
 *   - on Next, run an `action` that actually performs the task on the page
 *     (clicks, toggles) or plays a demo animation (faux file drop, faux drag).
 *   - or be `interactive`: the user must perform the gesture themselves
 *     (drag a ghost file into the upload zone, drag a ghost row to reorder)
 *     before the tour advances.
 */

type DemoKind = "fileDrop" | "drag" | null;
type InteractiveKind = "fileDrop" | "drag" | "slider";

type StepCtx = {
  /** Trigger a demo animation overlay anchored to a selector. */
  playDemo: (kind: DemoKind, targetSelector?: string) => Promise<void>;
  /** Wait for ms (used between programmatic clicks and the next step). */
  wait: (ms: number) => Promise<void>;
};

type Step = {
  title: string;
  body: string;
  /** CSS selector for the element to spotlight. Omit for centered intro/outro. */
  selector?: string;
  /** Hint text shown near the pointer (e.g. "Click here", "Drag me"). */
  hint?: string;
  /** Label for the Next button (e.g. "Show me", "Open it"). */
  nextLabel?: string;
  /** Action performed when the user clicks Next. Runs before advancing. */
  action?: (ctx: StepCtx) => Promise<void> | void;
  /** When set, the user must complete the gesture themselves to advance. */
  interactive?: InteractiveKind;
};

const GLOBAL_STEPS: Step[] = [
  {
    title: "Welcome to the TV Hub",
    body: "You're logged in as Global Marketing. I'll walk you through every key control — and actually show you each action.",
  },
  {
    title: "Open a property",
    body: "Each row is a property. I'll click this one open for you.",
    selector: '[data-tour="property"]',
    hint: "Click to expand",
    nextLabel: "Open it",
    action: async ({ wait }) => {
      const el = document.querySelector('[data-tour="property"]') as HTMLButtonElement | null;
      el?.click();
      // Let the panel mount before measuring the next step's target.
      await wait(450);
    },
  },
  {
    title: "Upload images and videos",
    body: "Drop MP4, MOV, PNG or JPEG files here — or click to browse. Try it: drag the demo file into the highlighted zone.",
    selector: '[data-tour="upload"]',
    hint: "Drop files here",
    interactive: "fileDrop",
  },
  {
    title: "Reorder with drag and drop",
    body: "Grab the top file and drag it below the second file to reorder the slideshow. Give it a try.",
    selector: '[data-tour="reorder"]',
    hint: "Drag down to reorder",
    interactive: "drag",
  },
  {
    title: "Image duration",
    body: "Drag the slider to set how long each image stays on screen during the slideshow. Videos always play through in full. Try it.",
    selector: '[data-tour="duration"]',
    hint: "Drag to set",
    interactive: "slider",
  },
  {
    title: "Compress videos for TV",
    body: "Toggle ON re-encodes videos to 1080p H.264 in your browser before upload — smoother playback on Fire Stick, much smaller files. Toggle OFF to upload originals as-is. I'll flip it for you.",
    selector: '[data-tour="compress-toggle"]',
    hint: "Tap to toggle",
    nextLabel: "Toggle it",
    action: async ({ wait }) => {
      const el = document.querySelector('[data-tour="compress-toggle"] input[type="checkbox"]') as HTMLInputElement | null;
      el?.click();
      await wait(250);
      // Toggle it back so we leave the user's setting unchanged.
      el?.click();
      await wait(150);
    },
  },
  {
    title: "Share the public link",
    body: "Copy the property's public URL and paste it into the TV browser to start the slideshow. I'll copy it now.",
    selector: '[data-tour="copy-link"]',
    hint: "Copy public link",
    nextLabel: "Copy it",
    action: async ({ wait }) => {
      const el = document.querySelector('[data-tour="copy-link"]') as HTMLButtonElement | null;
      el?.click();
      await wait(300);
    },
  },
];

const GM_STEPS: Step[] = [
  {
    title: "Welcome to your TV Hub",
    body: "Quick tour — I'll point at each control and actually demo the action for you.",
  },
  {
    title: "Upload your media",
    body: "Drop MP4, MOV, PNG or JPEG here or click to browse. Try it: drag the demo file into the highlighted zone.",
    selector: '[data-tour="upload"]',
    hint: "Drop files here",
    interactive: "fileDrop",
  },
  {
    title: "Reorder by drag and drop",
    body: "Grab the top file and drag it below the second file to reorder. Give it a try.",
    selector: '[data-tour="reorder"]',
    hint: "Drag down to reorder",
    interactive: "drag",
  },
  {
    title: "Image duration",
    body: "Drag the slider to set how long each image stays on screen. Videos always play in full. Try it.",
    selector: '[data-tour="duration"]',
    hint: "Drag to set",
    interactive: "slider",
  },
  {
    title: "Compress videos for TV",
    body: "Toggle ON re-encodes videos to 1080p H.264 in your browser — smoother on Fire Stick, much smaller files. Adds 1–8 min per video. I'll flip it for you so you can see.",
    selector: '[data-tour="compress-toggle"]',
    hint: "Tap to toggle",
    nextLabel: "Toggle it",
    action: async ({ wait }) => {
      const el = document.querySelector('[data-tour="compress-toggle"] input[type="checkbox"]') as HTMLInputElement | null;
      el?.click();
      await wait(250);
      el?.click();
      await wait(150);
    },
  },
  {
    title: "Copy the public link",
    body: "Paste this URL into the TV browser to start the slideshow. I'll copy it now.",
    selector: '[data-tour="copy-link"]',
    hint: "Copy public link",
    nextLabel: "Copy it",
    action: async ({ wait }) => {
      const el = document.querySelector('[data-tour="copy-link"]') as HTMLButtonElement | null;
      el?.click();
      await wait(300);
    },
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function useTargetRect(selector: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) { setRect(null); return; }

    let raf = 0;
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect((prev) => {
        if (
          prev &&
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
        ) {
          return prev;
        }
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
    };

    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });

    const tick = () => { measure(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);

    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [selector]);

  return rect;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function DashboardWalkthrough({ locationKey, role }: {
  locationKey: string;
  role: "global_marketing" | "gm";
}) {
  const storageKey = `tv-walkthrough-dismissed:${locationKey}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [running, setRunning] = useState(false);
  const [demo, setDemo] = useState<{ kind: Exclude<DemoKind, null>; rect: Rect } | null>(null);
  const [completed, setCompleted] = useState(false);

  const steps = role === "global_marketing" ? GLOBAL_STEPS : GM_STEPS;
  const current = steps[step];
  const rect = useTargetRect(current?.selector);

  // Live ref to the demo state so the action callback can await its end.
  const demoEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(storageKey);
    if (dismissed !== "1") {
      setOpen(true);
      setStep(0);
      setDontShow(false);
    }
  }, [storageKey]);

  // Reset per-step completion state when the step changes.
  useEffect(() => { setCompleted(false); }, [step]);

  // Lock body scroll while the tour is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  function close() {
    if (dontShow && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
    setOpen(false);
  }

  async function playDemo(kind: DemoKind, selector?: string) {
    if (!kind) return;
    const sel = selector ?? current?.selector;
    const el = sel ? (document.querySelector(sel) as HTMLElement | null) : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const targetRect: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
    setDemo({ kind, rect: targetRect });
    // Animation length per demo kind.
    const duration = kind === "drag" ? 1900 : 1700;
    await new Promise<void>((resolve) => {
      demoEndRef.current = resolve;
      setTimeout(() => {
        setDemo(null);
        demoEndRef.current?.();
        demoEndRef.current = null;
      }, duration);
    });
  }

  async function handleNext() {
    if (running) return;
    setRunning(true);
    try {
      if (current?.action) {
        await current.action({ playDemo, wait });
      }
      if (step < steps.length - 1) {
        setStep((s) => s + 1);
      } else {
        close();
      }
    } finally {
      setRunning(false);
    }
  }

  function advance() {
    if (step < steps.length - 1) setStep((s) => s + 1);
    else close();
  }

  async function onInteractiveSuccess() {
    setCompleted(true);
    // Brief celebratory pause, then auto-advance.
    await wait(550);
    advance();
  }

  if (!open || !current) return null;

  const isLast = step === steps.length - 1;
  const PADDING = 10;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  const spot = rect
    ? {
        top: Math.max(8, rect.top - PADDING),
        left: Math.max(8, rect.left - PADDING),
        width: Math.min(vw - 16, rect.width + PADDING * 2),
        height: Math.min(vh - 16, rect.height + PADDING * 2),
      }
    : null;
  const fallbackInteractiveTarget: Rect = {
    top: Math.min(Math.max(280, vh * 0.56), vh - 220),
    left: Math.min(Math.max(18, vw / 2 - 240), vw - 498),
    width: Math.min(480, vw - 36),
    height: 150,
  };

  const TOOLTIP_W = 360;
  const TOOLTIP_H_EST = 240;
  let tooltipStyle: React.CSSProperties;
  let pointerStyle: React.CSSProperties | null = null;

  if (spot) {
    const spaceBelow = vh - (spot.top + spot.height);
    const placeBelow = spaceBelow > TOOLTIP_H_EST + 24 || spot.top < TOOLTIP_H_EST + 24;
    const top = placeBelow
      ? spot.top + spot.height + 16
      : Math.max(16, spot.top - TOOLTIP_H_EST - 16);
    const left = Math.min(
      Math.max(16, spot.left + spot.width / 2 - TOOLTIP_W / 2),
      vw - TOOLTIP_W - 16,
    );
    tooltipStyle = { top, left, width: TOOLTIP_W };

    pointerStyle = placeBelow
      ? {
          top: spot.top + spot.height + 4,
          left: spot.left + spot.width / 2 - 14,
        }
      : {
          top: spot.top - 32,
          left: spot.left + spot.width / 2 - 14,
          transform: "rotate(180deg)",
        };
  } else if (current.interactive) {
    tooltipStyle = {
      top: 24,
      left: "50%",
      width: TOOLTIP_W,
      transform: "translateX(-50%)",
    };
  } else {
    tooltipStyle = {
      top: "50%",
      left: "50%",
      width: TOOLTIP_W,
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div className="fixed inset-0 z-[60] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
      {/* Dimmed overlay with spotlight cutout */}
      {spot ? (
        <>
          <div
            className="absolute rounded-xl pointer-events-auto transition-all duration-300 ease-out"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute rounded-xl pointer-events-none animate-pulse"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              boxShadow:
                "0 0 0 2px rgba(255,255,255,0.95), 0 0 24px 4px rgba(255, 45, 135, 0.55)",
              transition: "all 300ms ease-out",
            }}
          />
          {pointerStyle && !demo && (
            <div
              className="absolute pointer-events-none"
              style={{ ...pointerStyle, transition: "all 300ms ease-out" }}
            >
              <div className="tv-tour-pointer flex flex-col items-center gap-1">
                <MousePointer2
                  className="w-7 h-7 text-white drop-shadow-[0_2px_8px_rgba(255,45,135,0.9)]"
                  strokeWidth={2.5}
                  fill="white"
                />
                {current.hint && (
                  <span className="tv-pill !py-1 !px-2 !text-[10px] tv-gradient-bg !text-black before:hidden font-bold whitespace-nowrap">
                    {current.hint}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          className="absolute inset-0 bg-black/72 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Demo animations (used by `action` steps) */}
      {demo?.kind === "fileDrop" && (
        <div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            top: demo.rect.top,
            left: demo.rect.left,
            width: demo.rect.width,
            height: demo.rect.height,
          }}
        >
          <div className="tv-tour-filedrop flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-black text-xs font-semibold shadow-xl">
            <FileImage className="w-4 h-4" />
            demo-image.jpg
          </div>
        </div>
      )}

      {demo?.kind === "drag" && (() => {
        // Find the asset row that contains the drag handle and animate a ghost
        // from row 1's position down to row 2's position.
        const handle = document.querySelector('[data-tour="reorder"]') as HTMLElement | null;
        const row1 = handle?.closest("div.flex");
        const row2 = row1?.nextElementSibling as HTMLElement | null;
        if (!row1) return null;
        const r1 = (row1 as HTMLElement).getBoundingClientRect();
        const r2 = row2 ? row2.getBoundingClientRect() : { top: r1.top + r1.height + 6 };
        const dy = r2.top - r1.top;
        return (
          <div
            className="absolute pointer-events-none"
            style={{ top: r1.top, left: r1.left, width: r1.width, height: r1.height }}
          >
            <div
              className="tv-tour-drag absolute inset-0 rounded-lg border-2 border-white/80 bg-white/10 backdrop-blur-sm"
              style={{ ["--tv-tour-drag-dy" as any]: `${dy}px` }}
            />
            <div
              className="tv-tour-drag-cursor absolute"
              style={{
                ["--tv-tour-drag-dy" as any]: `${dy}px`,
                top: r1.height / 2 - 14,
                left: 6,
              }}
            >
              <MousePointer2
                className="w-7 h-7 text-white drop-shadow-[0_2px_8px_rgba(255,45,135,0.9)]"
                strokeWidth={2.5}
                fill="white"
              />
            </div>
          </div>
        );
      })()}

      {/* Interactive: drag a ghost file into the upload zone */}
      {current.interactive === "fileDrop" && (
        !spot && (
          <div
            className="absolute rounded-xl border-2 border-dashed border-white/70 bg-white/10 backdrop-blur-sm pointer-events-none flex items-center justify-center text-xs font-semibold text-white/85"
            style={fallbackInteractiveTarget}
          >
            Drop the fake demo file here
          </div>
        )
      )}

      {current.interactive === "fileDrop" && (
        <InteractiveFileDrop
          targetRect={spot ?? fallbackInteractiveTarget}
          completed={completed}
          onSuccess={onInteractiveSuccess}
        />
      )}

      {/* Interactive: drag a ghost row down to reorder */}
      {current.interactive === "drag" && (
        <InteractiveRowDrag
          targetRect={spot ?? fallbackInteractiveTarget}
          completed={completed}
          onSuccess={onInteractiveSuccess}
        />
      )}

      {/* Interactive: drag a slider thumb across to set duration */}
      {current.interactive === "slider" && (
        <InteractiveSlider
          targetRect={spot ?? fallbackInteractiveTarget}
          completed={completed}
          onSuccess={onInteractiveSuccess}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute tv-card p-5 sm:p-6 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 text-soft hover:text-white p-1"
          onClick={close}
          aria-label="Close walkthrough"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-widest text-soft">
          <Sparkles className="w-3 h-3" />
          <span>Step {step + 1} of {steps.length}</span>
        </div>

        <h2 className="text-lg font-bold mb-1.5">{current.title}</h2>
        <p className="text-soft text-sm leading-relaxed mb-4">{current.body}</p>

        <div className="flex items-center gap-1 mb-4">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step ? "w-5 bg-white" : "w-1 bg-white/20"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || running}
            className="text-soft"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          {current.interactive ? (
            <button
              className="text-xs text-soft hover:text-white underline underline-offset-4"
              onClick={advance}
            >
              {completed ? "Nice! Continuing…" : "Skip"}
            </button>
          ) : isLast ? (
            <button
              className="tv-btn-solid text-sm py-2 px-4 disabled:opacity-50"
              onClick={handleNext}
              disabled={running}
            >
              {running ? "…" : current.action ? (current.nextLabel ?? "Show me") : "Got it"}
            </button>
          ) : (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={running}
            >
              {running ? "…" : (current.nextLabel ?? "Next")} <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        <label className="mt-4 flex items-center gap-2 text-[11px] text-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="accent-white"
          />
          Don't show this again
        </label>
      </div>

      <style>{`
        @keyframes tvTourBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
        .tv-tour-pointer { animation: tvTourBob 1.1s ease-in-out infinite; }

        @keyframes tvTourFileDrop {
          0% { transform: translateY(-140px) scale(0.85); opacity: 0; }
          25% { opacity: 1; }
          70% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 0; }
        }
        .tv-tour-filedrop { animation: tvTourFileDrop 1.6s cubic-bezier(.2,.7,.2,1) forwards; }

        @keyframes tvTourDragGhost {
          0%   { transform: translateY(0)              scale(1);    opacity: 0; }
          15%  { transform: translateY(0)              scale(1.03); opacity: 1; }
          85%  { transform: translateY(var(--tv-tour-drag-dy)) scale(1.03); opacity: 1; }
          100% { transform: translateY(var(--tv-tour-drag-dy)) scale(1);    opacity: 0; }
        }
        .tv-tour-drag { animation: tvTourDragGhost 1.8s cubic-bezier(.2,.7,.2,1) forwards; }

        @keyframes tvTourDragCursor {
          0%   { transform: translateY(0)              scale(1);    }
          15%  { transform: translateY(0)              scale(1.15); }
          85%  { transform: translateY(var(--tv-tour-drag-dy)) scale(1.15); }
          100% { transform: translateY(var(--tv-tour-drag-dy)) scale(1);    }
        }
        .tv-tour-drag-cursor { animation: tvTourDragCursor 1.8s cubic-bezier(.2,.7,.2,1) forwards; }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive: drag a ghost file into the upload zone                  */
/* ------------------------------------------------------------------ */

function InteractiveFileDrop({
  targetRect,
  completed,
  onSuccess,
}: {
  targetRect: Rect;
  completed: boolean;
  onSuccess: () => void;
}) {
  // Keep the fake demo file inside the viewport so there is always something visible to grab.
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;
  const canSitAbove = targetRect.top > 132;
  const startTop = canSitAbove
    ? targetRect.top - 96
    : Math.min(viewportH - 92, targetRect.top + targetRect.height + 18);
  const startLeft = Math.min(
    Math.max(18, targetRect.left + targetRect.width / 2 - 100),
    viewportW - 218,
  );

  const [pos, setPos] = useState<{ top: number; left: number }>({ top: startTop, left: startLeft });
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const successFiredRef = useRef(false);

  // Reset position if the target moves.
  useEffect(() => {
    if (!dragging && !completed) setPos({ top: startTop, left: startLeft });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRect.top, targetRect.left, targetRect.width]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (completed) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    offsetRef.current = { x: e.clientX - pos.left, y: e.clientY - pos.top };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setPos({ left: e.clientX - offsetRef.current.x, top: e.clientY - offsetRef.current.y });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    const cx = e.clientX;
    const cy = e.clientY;
    const inside =
      cx >= targetRect.left &&
      cx <= targetRect.left + targetRect.width &&
      cy >= targetRect.top &&
      cy <= targetRect.top + targetRect.height;
    if (inside && !successFiredRef.current) {
      successFiredRef.current = true;
      // Snap to center of target.
      setPos({
        top: targetRect.top + targetRect.height / 2 - 18,
        left: targetRect.left + targetRect.width / 2 - 90,
      });
      onSuccess();
    } else {
      // Snap back.
      setPos({ top: startTop, left: startLeft });
    }
  }

  return (
    <div
      className="absolute pointer-events-auto select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        top: pos.top,
        left: pos.left,
        width: 200,
        cursor: completed ? "default" : dragging ? "grabbing" : "grab",
        transition: dragging ? "none" : "top 220ms ease-out, left 220ms ease-out",
        touchAction: "none",
        zIndex: 80,
      }}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-xl text-xs font-semibold ${
          completed
            ? "bg-emerald-500 text-white"
            : "bg-white text-black ring-2 ring-white/80"
        }`}
        style={{
          boxShadow: dragging
            ? "0 18px 40px -12px rgba(255,45,135,0.6)"
            : "0 8px 22px -8px rgba(0,0,0,0.6)",
          transform: dragging ? "scale(1.04) rotate(-2deg)" : "none",
          transition: "transform 120ms ease-out, box-shadow 120ms ease-out",
        }}
      >
        {completed ? <Check className="w-4 h-4" /> : <FileImage className="w-4 h-4" />}
        <span>fake-demo-image.jpg</span>
      </div>
      {!dragging && !completed && (
        <div
          className="absolute pointer-events-none"
          style={{ top: -6, left: 130 }}
        >
          <div className="tv-tour-pointer">
            <MousePointer2
              className="w-7 h-7 text-white drop-shadow-[0_2px_8px_rgba(255,45,135,0.95)]"
              strokeWidth={2.5}
              fill="white"
            />
          </div>
        </div>
      )}
      {!dragging && !completed && (
        <div className="mt-2 flex justify-center">
          <span className="tv-pill !py-1 !px-2 !text-[10px] tv-gradient-bg !text-black before:hidden font-bold whitespace-nowrap">
            Grab this fake file
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive: drag a ghost row down past the next row                 */
/* ------------------------------------------------------------------ */

function InteractiveRowDrag({
  targetRect,
  completed,
  onSuccess,
}: {
  targetRect: Rect;
  completed: boolean;
  onSuccess: () => void;
}) {
  // A self-contained 2-card list. The user grabs the top card and drops it
  // below the bottom card. We render the cards near the spotlight (or at the
  // fallback target) so the demo always works regardless of real DOM contents.
  const ROW_H = 64;
  const GAP = 8;
  const CONTAINER_H = ROW_H * 2 + GAP;

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;
  const width = Math.min(Math.max(targetRect.width, 320), 520);
  const left = Math.min(
    Math.max(18, targetRect.left + targetRect.width / 2 - width / 2),
    viewportW - width - 18,
  );
  const top = Math.min(
    Math.max(80, targetRect.top + targetRect.height / 2 - CONTAINER_H / 2),
    viewportH - CONTAINER_H - 24,
  );

  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const startYRef = useRef(0);
  const successFiredRef = useRef(false);

  const threshold = ROW_H * 0.55 + GAP;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (completed || swapped) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDy(Math.max(-20, e.clientY - startYRef.current));
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dy >= threshold && !successFiredRef.current) {
      successFiredRef.current = true;
      setSwapped(true);
      setDy(0);
      onSuccess();
    } else {
      setDy(0);
    }
  }

  // When swapped, demo file 1 lives in slot 2 and vice-versa.
  const file1Top = swapped ? ROW_H + GAP : 0;
  const file2Top = swapped ? 0 : ROW_H + GAP;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ top, left, width, height: CONTAINER_H, zIndex: 80 }}
    >
      {/* Bottom (static) card — fake-demo-video.mp4 */}
      <div
        className="absolute left-0 w-full flex items-center gap-3 px-3 rounded-lg bg-white/10 border border-white/30 backdrop-blur-sm text-xs text-white/85"
        style={{
          top: file2Top,
          height: ROW_H,
          transition: "top 260ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        <FileImage className="w-9 h-9 rounded-md bg-black/50 p-2 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-semibold">fake-demo-video.mp4</p>
          <p className="text-white/55">Demo file #2</p>
        </div>
      </div>

      {/* Top (draggable) card — fake-demo-image.jpg */}
      <div
        className="absolute left-0 w-full pointer-events-auto select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          top: file1Top,
          height: ROW_H,
          transform: `translateY(${dy}px)`,
          transition: dragging ? "none" : "top 260ms cubic-bezier(.2,.7,.2,1), transform 220ms ease-out",
          cursor: completed || swapped ? "default" : dragging ? "grabbing" : "grab",
          touchAction: "none",
          zIndex: 2,
        }}
      >
        <div
          className={`relative w-full h-full flex items-center gap-3 px-3 rounded-lg backdrop-blur-sm ${
            completed || swapped
              ? "bg-emerald-500/25 border-2 border-emerald-400 text-white"
              : "bg-white text-black border-2 border-white"
          }`}
          style={{
            boxShadow: dragging
              ? "0 18px 40px -10px rgba(255,45,135,0.6)"
              : "0 8px 24px -10px rgba(0,0,0,0.5)",
            transform: dragging ? "scale(1.02) rotate(-1deg)" : "none",
            transition: "transform 120ms ease-out, box-shadow 120ms ease-out",
          }}
        >
          {completed || swapped ? (
            <Check className="w-6 h-6 shrink-0" />
          ) : (
            <GripVertical className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          )}
          <FileImage className="w-9 h-9 rounded-md bg-black/10 p-2 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-xs">fake-demo-image.jpg</p>
            <p className={`text-[11px] ${completed || swapped ? "text-white/70" : "text-black/55"}`}>
              Demo file #1
            </p>
          </div>

          {!dragging && !completed && !swapped && (
            <div
              className="absolute pointer-events-none"
              style={{ top: -6, right: 12 }}
            >
              <div className="tv-tour-pointer flex flex-col items-center gap-1">
                <MousePointer2
                  className="w-7 h-7 text-white drop-shadow-[0_2px_8px_rgba(255,45,135,0.95)]"
                  strokeWidth={2.5}
                  fill="white"
                />
                <span className="tv-pill !py-1 !px-2 !text-[10px] tv-gradient-bg !text-black before:hidden font-bold whitespace-nowrap">
                  Drag below file #2
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive: drag a slider thumb across most of the track            */
/* ------------------------------------------------------------------ */

function InteractiveSlider({
  targetRect,
  completed,
  onSuccess,
}: {
  targetRect: Rect;
  completed: boolean;
  onSuccess: () => void;
}) {
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;
  const width = Math.min(Math.max(targetRect.width, 320), 480);
  const HEIGHT = 80;
  const left = Math.min(
    Math.max(18, targetRect.left + targetRect.width / 2 - width / 2),
    viewportW - width - 18,
  );
  const top = Math.min(
    Math.max(80, targetRect.top + targetRect.height / 2 - HEIGHT / 2),
    viewportH - HEIGHT - 24,
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0.1); // start near the left
  const [dragging, setDragging] = useState(false);
  const successFiredRef = useRef(false);

  const minSecs = 2;
  const maxSecs = 60;
  const secs = Math.round(minSecs + pct * (maxSecs - minSecs));

  function setFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const r = track.getBoundingClientRect();
    const next = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setPct(next);
    if (next >= 0.6 && !successFiredRef.current) {
      successFiredRef.current = true;
      onSuccess();
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (completed) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setFromClientX(e.clientX);
  }
  function onPointerUp() { setDragging(false); }

  return (
    <div
      className="absolute pointer-events-auto select-none"
      style={{ top, left, width, height: HEIGHT, zIndex: 80, touchAction: "none" }}
    >
      <div className="flex items-center justify-between mb-2 text-xs text-white/85">
        <span className="font-semibold">Image duration</span>
        <span className={`font-mono tabular-nums ${completed ? "text-emerald-300" : "text-white"}`}>
          {secs}s
        </span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-3 rounded-full bg-white/15 border border-white/25 cursor-pointer"
      >
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${
            completed ? "bg-emerald-400" : "tv-gradient-bg"
          }`}
          style={{ width: `${pct * 100}%`, transition: dragging ? "none" : "width 160ms ease-out" }}
        />
        <div
          className="absolute top-1/2"
          style={{
            left: `${pct * 100}%`,
            transform: "translate(-50%, -50%)",
            transition: dragging ? "none" : "left 160ms ease-out",
          }}
        >
          <div
            className={`w-6 h-6 rounded-full border-2 ${
              completed
                ? "bg-emerald-400 border-white"
                : "bg-white border-white"
            } shadow-[0_4px_14px_rgba(255,45,135,0.7)] flex items-center justify-center`}
          >
            {completed && <Check className="w-3.5 h-3.5 text-emerald-900" />}
          </div>
          {!dragging && !completed && pct < 0.5 && (
            <div
              className="absolute pointer-events-none"
              style={{ top: -36, left: -10 }}
            >
              <div className="tv-tour-pointer flex flex-col items-center gap-1">
                <MousePointer2
                  className="w-7 h-7 text-white drop-shadow-[0_2px_8px_rgba(255,45,135,0.95)]"
                  strokeWidth={2.5}
                  fill="white"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {!completed && (
        <div className="mt-2 flex justify-center">
          <span className="tv-pill !py-1 !px-2 !text-[10px] tv-gradient-bg !text-black before:hidden font-bold whitespace-nowrap">
            Drag the thumb to the right
          </span>
        </div>
      )}
    </div>
  );
}