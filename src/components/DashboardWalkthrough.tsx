import { useEffect, useLayoutEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = {
  title: string;
  body: string;
  /** CSS selector for the element to spotlight. Omit for centered intro/outro. */
  selector?: string;
  /** Hint text shown next to the pointer (e.g. "Click here", "Drag me"). */
  hint?: string;
};

const GLOBAL_STEPS: Step[] = [
  {
    title: "Welcome to the TV Hub",
    body: "You're logged in as Global Marketing. Quick tour — I'll point at every key control.",
  },
  {
    title: "Open a property",
    body: "Each row is a property. Click to expand and manage its TV content.",
    selector: '[data-tour="property"]',
    hint: "Click to expand",
  },
  {
    title: "Upload images and videos",
    body: "Drop MP4, MOV, PNG or JPEG here — or click to browse. Files go live on that property's TVs immediately.",
    selector: '[data-tour="upload"]',
    hint: "Drop files here",
  },
  {
    title: "Reorder with drag and drop",
    body: "Grab any item by its handle and drag it where you want. The new order saves automatically.",
    selector: '[data-tour="reorder"]',
    hint: "Drag to reorder",
  },
  {
    title: "Share the public link",
    body: "Copy the property's public URL and paste it into the TV browser to start the slideshow.",
    selector: '[data-tour="copy-link"]',
    hint: "Copy public link",
  },
];

const GM_STEPS: Step[] = [
  {
    title: "Welcome to your TV Hub",
    body: "This is your property's dashboard. I'll point at each control — anything you upload here goes live on your TVs right away.",
  },
  {
    title: "Upload your media",
    body: "Drop MP4, MOV, PNG or JPEG here or click to browse.",
    selector: '[data-tour="upload"]',
    hint: "Drop files here",
  },
  {
    title: "Reorder by drag and drop",
    body: "Grab the handle on any item and drag it to change playback order.",
    selector: '[data-tour="reorder"]',
    hint: "Drag to reorder",
  },
  {
    title: "Image duration",
    body: "Use the slider to set how long each image stays on screen. Videos always play in full.",
    selector: '[data-tour="duration"]',
    hint: "Set duration",
  },
  {
    title: "Copy the public link",
    body: "Paste this URL into the TV browser to start the slideshow.",
    selector: '[data-tour="copy-link"]',
    hint: "Copy public link",
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
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    // Scroll target into view first, then measure on a loop until stable.
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

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

export function DashboardWalkthrough({ locationKey, role }: {
  locationKey: string;
  role: "global_marketing" | "gm";
}) {
  const storageKey = `tv-walkthrough-dismissed:${locationKey}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  const steps = role === "global_marketing" ? GLOBAL_STEPS : GM_STEPS;
  const current = steps[step];
  const rect = useTargetRect(current?.selector);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(storageKey);
    if (dismissed !== "1") {
      setOpen(true);
      setStep(0);
      setDontShow(false);
    }
  }, [storageKey]);

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

  if (!open || !current) return null;

  const isLast = step === steps.length - 1;
  const PADDING = 10;

  // Compute spotlight box (with padding) and clamp to viewport.
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

  // Tooltip placement: prefer below, otherwise above.
  const TOOLTIP_W = 360;
  const TOOLTIP_H_EST = 220;
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

    // Animated pointer: sits at the side of the spotlight closest to tooltip.
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
  } else {
    tooltipStyle = {
      top: "50%",
      left: "50%",
      width: TOOLTIP_W,
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Dimmed overlay with spotlight cutout via giant box-shadow trick */}
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
          {/* Animated pulsing ring around the target */}
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
          {/* Animated pointer hand */}
          {pointerStyle && (
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
          onClick={close}
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
            disabled={step === 0}
            className="text-soft"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          {isLast ? (
            <button className="tv-btn-solid text-sm py-2 px-4" onClick={close}>
              Got it
            </button>
          ) : (
            <Button
              size="sm"
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            >
              Next <ChevronRight className="w-4 h-4" />
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
      `}</style>
    </div>
  );
}