import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import { Pause, Play, Volume2, VolumeX, Heart } from "lucide-react";
import { getPlayDataFn } from "@/lib/tv.functions";

export const Route = createFileRoute("/$slug/play")({
  head: () => ({ meta: [{ title: "Mad Monkey TV" }] }),
  component: PlayPage,
});

function PlayPage() {
  const { slug } = Route.useParams();
  const fetchPlay = useServerFn(getPlayDataFn);
  const { data, isLoading } = useQuery({
    queryKey: ["play", slug],
    queryFn: () => fetchPlay({ data: { slug } }),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="fixed inset-0 bg-black" />;
  if (!data || !data.property) return <NotFound />;
  if (!data.assets.length) return <Holding />;

  const seconds = (data.property as any).image_duration_seconds || 8;
  return <Player assets={data.assets} imageSeconds={seconds} />;
}

function Player({ assets, imageSeconds }: { assets: { id: string; file_url: string; file_type: string }[]; imageSeconds: number }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const advanceTimer = useRef<number | undefined>(undefined);
  const preloadRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

  const current = assets[idx % assets.length];
  const next = assets[(idx + 1) % assets.length];

  const advance = useCallback(() => {
    setIdx((i) => (i + 1) % assets.length);
  }, [assets.length]);

  // Image timer driven by per-property setting
  useEffect(() => {
    if (paused) return;
    if (current.file_type !== "image") return;
    const ms = Math.max(2, imageSeconds) * 1000;
    advanceTimer.current = window.setTimeout(advance, ms);
    const pre = window.setTimeout(() => {
      if (next.file_type === "image") {
        const img = new Image();
        img.src = next.file_url;
        preloadRef.current = img;
      }
    }, Math.max(1000, ms - 1000));
    return () => {
      clearTimeout(advanceTimer.current);
      clearTimeout(pre);
    };
  }, [current, next, paused, advance, imageSeconds]);

  // Video pause/play
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause(); else v.play().catch(() => {});
    v.muted = muted;
  }, [paused, muted, idx]);

  // Controls reveal
  function reveal() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowControls(false), 3000);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") { e.preventDefault(); setPaused((p) => !p); reveal(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black ${showControls ? "" : "cursor-none"}`}
      onMouseMove={reveal}
      onTouchStart={reveal}
      onClick={reveal}
    >
      {current.file_type === "image" ? (
        <img
          key={current.id}
          src={current.file_url}
          className="w-full h-full object-contain"
          alt=""
        />
      ) : (
        <video
          key={current.id}
          ref={videoRef}
          src={current.file_url}
          autoPlay muted={muted} playsInline
          className="w-full h-full object-contain bg-black"
          onEnded={advance}
        />
      )}

      <div
        className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setPaused((p) => !p); reveal(); }}
          className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-4 rounded-full text-white"
        >
          {paused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); reveal(); }}
          className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-4 rounded-full text-white"
        >
          {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}

function Holding() {
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      <Heart className="w-24 h-24 text-white mb-6" fill="white" />
      <p className="text-white text-2xl tracking-wide">Coming soon</p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-bold text-white mb-4">Not found</h1>
      <p className="text-white/60 mb-8">This screen isn't set up yet.</p>
      <a
        href="https://madmonkeyhostels.com"
        className="text-white underline underline-offset-4"
      >
        Visit madmonkeyhostels.com
      </a>
    </div>
  );
}
