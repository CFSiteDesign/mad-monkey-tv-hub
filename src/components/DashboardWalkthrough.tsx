import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = { title: string; body: string };

const GLOBAL_STEPS: Step[] = [
  {
    title: "Welcome to the TV Hub",
    body: "You're logged in as Global Marketing. From here you can manage every property's TV content in one place.",
  },
  {
    title: "Upload images and videos",
    body: "Drop MP4, MOV, PNG or JPEG files into any property's upload zone. Files go live on that location's TVs immediately.",
  },
  {
    title: "Reorder by drag and drop",
    body: "Grab any item by its handle on the left and drop it where you want — the new order saves automatically.",
  },
  {
    title: "Share the public link",
    body: "Each property has a Copy public link button. Paste that URL into the TV browser to start the slideshow.",
  },
];

const GM_STEPS: Step[] = [
  {
    title: "Welcome to your TV Hub",
    body: "This is your property's dashboard. Anything you upload here goes live on your TVs right away.",
  },
  {
    title: "Upload images and videos",
    body: "Drop MP4, MOV, PNG or JPEG files into the upload zone, or click to browse.",
  },
  {
    title: "Reorder by drag and drop",
    body: "Drag any item by its handle on the left to change the playback order.",
  },
  {
    title: "Set image duration",
    body: "Use the slider to choose how long each image stays on screen. Videos always play in full.",
  },
];

export function DashboardWalkthrough({ locationKey, role }: {
  locationKey: string;
  role: "global_marketing" | "gm";
}) {
  const storageKey = `tv-walkthrough-dismissed:${locationKey}`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  const steps = role === "global_marketing" ? GLOBAL_STEPS : GM_STEPS;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(storageKey);
    if (dismissed !== "1") {
      setOpen(true);
      setStep(0);
      setDontShow(false);
    }
  }, [storageKey]);

  function close() {
    if (dontShow && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
    setOpen(false);
  }

  if (!open) return null;
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        className="tv-card relative w-full max-w-md p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 text-soft hover:text-white p-1"
          onClick={close}
          aria-label="Close walkthrough"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-widest text-soft">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Quick tour · {step + 1} of {steps.length}</span>
        </div>

        <h2 className="text-2xl font-bold mb-2">{current.title}</h2>
        <p className="text-soft text-sm leading-relaxed mb-6">{current.body}</p>

        <div className="flex items-center gap-1 mb-6">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-white" : "w-1.5 bg-white/20"
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
            <button className="tv-btn-solid" onClick={close}>
              Get started
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

        <label className="mt-5 flex items-center gap-2 text-xs text-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="accent-white"
          />
          Don't show this again for this location
        </label>
      </div>
    </div>
  );
}
