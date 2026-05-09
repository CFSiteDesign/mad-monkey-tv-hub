import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef, type DragEvent, type ChangeEvent } from "react";
import logo from "@/assets/TheoroXlogo.png";
import { supabase } from "@/integrations/supabase/client";
import {
  getSessionFn, loginFn, logoutFn,
  listPropertiesFn, createUploadUrlFn, recordUploadFn,
  deleteAssetFn, reorderAssetsFn,
  setImageDurationFn,
  type Session,
} from "@/lib/tv.functions";
import { TvHubHeader, TvHubFooter } from "@/components/TvHubHeader";
import { DashboardWalkthrough } from "@/components/DashboardWalkthrough";
import { Trash2, Link2, FileVideo, UploadCloud, GripVertical, Clock, ChevronDown, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { compressImage, compressVideo } from "@/lib/media-compress";

const DASHBOARD_AUTH_KEY = "tvhub_view";

function getDashboardAuthToken() {
  return window.localStorage.getItem(DASHBOARD_AUTH_KEY);
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "TV Hub by TheoroX" }] }),
  component: DashboardPage,
});

export function DashboardPage() {
  const fetchSession = useServerFn(getSessionFn);
  const [localSession, setLocalSession] = useState<Session | null>(null);
  const { data: session, isLoading, refetch } = useQuery({
    queryKey: ["tv-session"],
    queryFn: () => fetchSession(),
    staleTime: 60_000,
  });

  const activeSession = localSession ?? session;

  if (isLoading && !activeSession) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-soft">Loading…</div>;
  }
  if (!activeSession) return <LoginScreen onLoggedIn={setLocalSession} />;
  return <DashboardInner session={activeSession} onLogout={() => {
    window.localStorage.removeItem(DASHBOARD_AUTH_KEY);
    window.history.replaceState(null, "", "/dashboard");
    setLocalSession(null);
    refetch();
  }} />;
}

// ---------- Login ----------

function LoginScreen({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const login = useServerFn(loginFn);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await login({ data: { code: trimmed } });
      if (!res.ok) {
        setError(res.error || "Invalid access code");
        setBusy(false);
        return;
      }
      window.localStorage.setItem(DASHBOARD_AUTH_KEY, trimmed);
      onLoggedIn(res.session);
    } catch {
      setError("Login failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-black px-4 py-12 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src={logo} alt="TheoroX" className="h-20 mx-auto mb-8" />
          <h1 className="text-5xl font-extrabold tracking-tight tv-gradient-underline mb-3">
            TV Hub
          </h1>
          <p className="text-soft">Enter your access code to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="tv-card p-6 space-y-4">
          <label className="block">
            <span className="text-sm text-soft">Access code</span>
            <input
              type="password"
              autoFocus
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-2 w-full bg-black/40 border border-white/10 rounded-md px-4 py-3 text-lg tracking-wider focus:outline-none focus:border-white/40"
              placeholder="Enter code"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="tv-btn-solid w-full py-3 text-lg disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Dashboard wrapper ----------

function DashboardInner({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const logout = useServerFn(logoutFn);
  async function handleLogout() {
    await logout({});
    onLogout();
  }

  const locationKey = session.role === "global_marketing" ? "__global__" : session.slug;

  return (
    <div className="min-h-screen bg-black">
      <TvHubHeader session={session} onLogout={handleLogout} />
      <main className="px-6 sm:px-10 py-8 max-w-7xl mx-auto">
        {session.role === "global_marketing"
          ? <GlobalView />
          : <GmView session={session} />
        }
      </main>
      <TvHubFooter />
      <DashboardWalkthrough locationKey={locationKey} role={session.role} />
    </div>
  );
}

// ---------- Global Marketing view ----------

function GlobalView() {
  const fetchAll = useServerFn(listPropertiesFn);
  const { data, isLoading } = useQuery({
    queryKey: ["tv-all"],
    queryFn: () => fetchAll({ data: { auth_token: getDashboardAuthToken() } }),
  });

  if (isLoading || !data) return <div className="text-soft">Loading properties…</div>;

  const grouped: Record<string, typeof data.properties> = {};
  for (const p of data.properties) (grouped[p.country] ||= []).push(p);

  return (
    <div className="space-y-12">
      {Object.entries(grouped).map(([country, props]) => (
        <section key={country}>
          <h2 className="country-heading mb-6">{country}</h2>
          <div className="space-y-3">
            {props.map((p) =>
              p.coming_soon
                ? <ComingSoonCard key={p.id} name={p.name} country={p.country} />
                : <CollapsibleProperty key={p.id} property={p as any} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function CollapsibleProperty({ property }: { property: PropertyData }) {
  const [open, setOpen] = useState(false);
  const used = (property.assets || []).reduce((s, a) => s + (a.file_size || 0), 0);
  return (
    <div className="tv-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors"
        aria-expanded={open}
        data-tour="property"
      >
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-soft">{property.country}</p>
          <h3 className="text-xl font-bold truncate">{property.name}</h3>
          <StorageBar used={used} />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="tv-pill">{property.assets.length} items</span>
          <ChevronDown className={`w-5 h-5 text-soft transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-white/10 p-5">
          <PropertyCard property={property} role="global_marketing" embedded />
        </div>
      )}
    </div>
  );
}

function ComingSoonCard({ name, country }: { name: string; country: string }) {
  return (
    <div className="tv-card p-6 opacity-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-widest text-soft">{country}</span>
        <span className="tv-pill !text-black tv-gradient-bg before:hidden font-bold">Coming Soon</span>
      </div>
      <h3 className="text-2xl font-bold">{name}</h3>
    </div>
  );
}

const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

function StorageBar({ used }: { used: number }) {
  const pct = Math.min(100, (used / STORAGE_LIMIT_BYTES) * 100);
  const warn = pct >= 80;
  return (
    <div className="mt-2 w-full max-w-xs">
      <div className="flex items-center justify-between gap-2 text-[11px] text-soft mb-1">
        <span>Storage</span>
        <span className={warn ? "text-amber-400" : ""}>
          {formatBytes(used)} / 5 GB
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

// ---------- GM View ----------

function GmView({ session }: { session: Extract<Session, { role: "gm" }> }) {
  const fetchAll = useServerFn(listPropertiesFn);
  const { data, isLoading } = useQuery({
    queryKey: ["tv-all"],
    queryFn: () => fetchAll({ data: { auth_token: getDashboardAuthToken() } }),
  });
  if (isLoading || !data) return <div className="text-soft">Loading…</div>;
  const property = data.properties.find((p) => p.slug === session.slug);
  if (!property) return <div className="text-soft">Property not found.</div>;
  const used = ((property as any).assets || []).reduce((s: number, a: Asset) => s + (a.file_size || 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="country-heading mb-2">{property.country}</h2>
        <h1 className="text-4xl font-extrabold mb-1">{property.name}</h1>
        <p className="text-soft">{(property as any).assets?.length || 0} items currently playing</p>
        <div className="mt-3 max-w-md"><StorageBar used={used} /></div>
      </div>
      <PropertyCard property={property as any} role="gm" hideCode />
    </div>
  );
}

// ---------- Property Card (shared) ----------

type Asset = {
  id: string; file_url: string; file_name: string; file_size: number;
  file_type: string; uploaded_by: string; display_order: number; property_slug: string;
};
type PropertyData = {
  id: string; slug: string; name: string; country: string;
  access_code: string | null; coming_soon: boolean; assets: Asset[];
  image_duration_seconds?: number;
};

function PropertyCard({
  property, role, hideCode = false, embedded = false,
}: { property: PropertyData; role: "global_marketing" | "gm"; hideCode?: boolean; embedded?: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["tv-all"] });
  const playUrl = `https://mad-monkey-tv-hub.lovable.app/${property.slug}/play`;

  return (
    <div className={embedded ? "" : "tv-card p-6"}>
      {!embedded && (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs uppercase tracking-widest text-soft">{property.country}</span>
            <span className="tv-pill">{property.assets.length} items</span>
          </div>
          <h3 className="text-2xl font-bold mb-4">{property.name}</h3>
        </>
      )}

      <UploadDropzone slug={property.slug} onDone={refresh} />

      <ImageDurationRow
        slug={property.slug}
        initial={property.image_duration_seconds ?? 8}
      />

      <div className="mt-5 space-y-2">
        {property.assets.length === 0 && (
          <p className="text-soft text-sm py-2">No content yet.</p>
        )}
        {property.assets.length > 0 && (
          <AssetList
            assets={property.assets}
            slug={property.slug}
            role={role}
            onChanged={refresh}
          />
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className="tv-btn"
          data-tour="copy-link"
          onClick={() => {
            navigator.clipboard.writeText(playUrl);
          }}
        >
          <Link2 className="w-4 h-4" /> Copy public link
        </button>
        <a href={playUrl} target="_blank" rel="noreferrer" className="text-soft text-xs hover:text-white">
          /{property.slug}/play
        </a>
      </div>

      {!hideCode && property.access_code !== null && (
        <PropertyCodeRow slug={property.slug} initial={property.access_code} />
      )}
    </div>
  );
}

function PropertyCodeRow({ initial }: { slug: string; initial: string }) {
  return (
    <div className="mt-5 pt-5 border-t border-white/10 flex items-center justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-soft mb-1">GM access code</p>
        <code className="font-mono text-lg tracking-widest">{initial}</code>
      </div>
    </div>
  );
}

function AssetList({
  assets, slug, onChanged,
}: {
  assets: Asset[]; slug: string; role: "global_marketing" | "gm"; onChanged: () => void;
}) {
  const del = useServerFn(deleteAssetFn);
  const reorder = useServerFn(reorderAssetsFn);
  const [order, setOrder] = useState<Asset[]>(assets);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Sync local order when server data changes (and we're not mid-drag)
  const serverKey = assets.map((a) => a.id).join(",");
  useEffect(() => {
    if (dragId === null) setOrder(assets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const persist = useMutation({
    mutationFn: (ids: string[]) =>
      reorder({ data: { slug, ids, auth_token: getDashboardAuthToken() } }),
    onSuccess: onChanged,
    onError: () => setOrder(assets),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => del({ data: { id, auth_token: getDashboardAuthToken() } }),
    onSuccess: onChanged,
  });

  function moveItem(fromId: string, toId: string) {
    if (fromId === toId) return;
    const next = [...order];
    const from = next.findIndex((a) => a.id === fromId);
    const to = next.findIndex((a) => a.id === toId);
    if (from < 0 || to < 0) return;
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setOrder(next);
  }

  function onDrop() {
    setDragId(null);
    setOverId(null);
    const ids = order.map((a) => a.id);
    if (ids.join(",") !== assets.map((a) => a.id).join(",")) {
      persist.mutate(ids);
    }
  }

  return (
    <>
      {order.map((asset) => {
        const isImg = asset.file_type === "image";
        const isDragging = dragId === asset.id;
        const isOver = overId === asset.id && dragId !== asset.id;
        return (
          <div
            key={asset.id}
            draggable
            onDragStart={(e) => {
              setDragId(asset.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", asset.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverId(asset.id);
              if (dragId && dragId !== asset.id) moveItem(dragId, asset.id);
            }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDrop={(e) => { e.preventDefault(); onDrop(); }}
            className={`flex items-center gap-3 p-2 rounded-lg bg-black/40 border transition-all ${
              isDragging ? "opacity-40 border-white/30" : isOver ? "border-white/40" : "border-white/5"
            }`}
          >
            <button
              type="button"
              className="text-soft hover:text-white cursor-grab active:cursor-grabbing p-1 -ml-1 touch-none"
              title="Drag to reorder"
              aria-label="Drag to reorder"
              data-tour="reorder"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 rounded-md bg-black flex items-center justify-center shrink-0 overflow-hidden">
              {isImg
                ? <img src={asset.file_url} className="w-full h-full object-cover" alt="" />
                : <FileVideo className="w-5 h-5 text-soft" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm">{asset.file_name}</p>
              <p className="text-xs text-soft">{formatBytes(asset.file_size)}</p>
            </div>
            <span className="tv-pill text-[10px] !py-0.5 !px-2">
              {asset.uploaded_by === "gm" ? "GM" : "Global"}
            </span>
            <button
              className="text-soft hover:text-red-400 transition-colors p-2"
              onClick={() => removeMut.mutate(asset.id)}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </>
  );
}

function ImageDurationRow({ slug, initial }: { slug: string; initial: number }) {
  const [secs, setSecs] = useState(initial);
  const save = useServerFn(setImageDurationFn);
  const m = useMutation({
    mutationFn: (n: number) => save({ data: { slug, seconds: n, auth_token: getDashboardAuthToken() } }),
  });
  return (
    <div className="mt-4 p-3 rounded-lg bg-black/40 border border-white/5" data-tour="duration">
      <div className="flex items-center gap-3 mb-3">
        <Clock className="w-4 h-4 text-soft shrink-0" />
        <label className="text-sm text-soft">Image duration</label>
        <span className="ml-auto text-sm font-mono tabular-nums">{secs}s</span>
      </div>
      <Slider
        min={2}
        max={60}
        step={1}
        value={[secs]}
        onValueChange={(v: number[]) => setSecs(v[0] ?? secs)}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-soft">videos play in full</span>
        <button
          className="tv-btn"
          disabled={m.isPending || secs === initial}
          onClick={() => m.mutate(secs)}
        >
          {m.isPending ? "Saving…" : m.isSuccess && secs === (m.data?.seconds ?? secs) ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------- Upload ----------

function UploadDropzone({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [pct, setPct] = useState(0);
  const [fileIndex, setFileIndex] = useState({ current: 0, total: 0 });
  const [compressVideos, setCompressVideos] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const createUrl = useServerFn(createUploadUrlFn);
  const record = useServerFn(recordUploadFn);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const allowedExt = ["mp4", "mov", "png", "jpg", "jpeg"];
    const allowedMime = ["video/mp4", "video/quicktime", "image/png", "image/jpeg"];
    const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
    const MAX_FILES_PER_BATCH = 5;
    const accepted: File[] = [];
    const rejected: string[] = [];
    const oversized: string[] = [];
    const all = Array.from(files);
    const tooMany = all.length > MAX_FILES_PER_BATCH;
    for (const f of all.slice(0, MAX_FILES_PER_BATCH)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const ok = allowedExt.includes(ext) || allowedMime.includes(f.type);
      if (!ok) { rejected.push(f.name); continue; }
      if (f.size > MAX_FILE_BYTES) { oversized.push(f.name); continue; }
      accepted.push(f);
    }
    if (tooMany) {
      alert(`You can upload up to ${MAX_FILES_PER_BATCH} files at a time. Only the first ${MAX_FILES_PER_BATCH} will be uploaded.`);
    }
    if (rejected.length) {
      alert(`Only MP4, MOV, PNG and JPEG are allowed.\nSkipped: ${rejected.join(", ")}`);
    }
    if (oversized.length) {
      alert(`Maximum file size is 500 MB.\nSkipped: ${oversized.join(", ")}`);
    }
    if (!accepted.length) return;
    setBusy(true);
    cancelledRef.current = false;
    setFileIndex({ current: 0, total: accepted.length });
    try {
      let i = 0;
      for (const file of accepted) {
        if (cancelledRef.current) break;
        i++;
        setFileIndex({ current: i, total: accepted.length });
        setPct(0);
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const isVideo = file.type.startsWith("video") || ext === "mp4" || ext === "mov";

        // ---- Step 1: optimize on-device (image: always, video: opt-in) ----
        let toUpload = file;
        try {
          if (!isVideo) {
            setProgress(`Optimizing image ${i}/${accepted.length}: ${file.name}`);
            toUpload = await compressImage(file);
          } else if (compressVideos) {
            setProgress(`Preparing video ${i}/${accepted.length}: ${file.name}`);
            toUpload = await compressVideo(file, ({ status, pct: p }) => {
              setProgress(`${status} (${i}/${accepted.length}: ${file.name})`);
              if (typeof p === "number") setPct(p);
            });
            setPct(0);
          }
        } catch (compressErr) {
          console.warn("Compression failed, uploading original", compressErr);
          toUpload = file;
        }
        if (cancelledRef.current) break;

        const type = isVideo ? "video" : "image";
        setProgress(`Uploading ${i}/${accepted.length}: ${toUpload.name}`);
        const auth_token = getDashboardAuthToken();
        const init = normalizeUploadInit(await createUrl({ data: { slug, file_name: toUpload.name, auth_token } }));
        const controller = new AbortController();
        abortRef.current = controller;
        await uploadToStorage(init.path, init.token, toUpload, (p) => setPct(p), controller.signal);
        abortRef.current = null;
        if (cancelledRef.current) break;
        await record({ data: {
          slug, file_url: init.publicUrl, file_name: toUpload.name,
          file_size: toUpload.size, file_type: type, auth_token,
        }});
      }
      if (!cancelledRef.current) onDone();
    } catch (e: any) {
      if (cancelledRef.current || e?.name === "AbortError") {
        // user-cancelled, swallow
      } else {
      alert(formatUploadAlert(e));
      }
    } finally {
      abortRef.current = null;
      cancelledRef.current = false;
      setBusy(false); setProgress(""); setPct(0); setFileIndex({ current: 0, total: 0 });
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function cancelUpload() {
    cancelledRef.current = true;
    abortRef.current?.abort();
  }

  return (
    <div
      className={`tv-dropzone ${drag ? "is-dragging" : ""}`}
      data-tour="upload"
      onClick={() => { if (!busy) inputRef.current?.click(); }}
      onDragOver={(e: DragEvent) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault(); setDrag(false);
        if (busy) return;
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef} type="file" multiple
        accept="image/jpeg,image/png,video/mp4,video/quicktime,.mp4,.mov,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
      />
      <UploadCloud className="w-8 h-8 mx-auto mb-2 text-soft" />
      <p className="text-sm">
        {busy ? progress : <>Drop MP4, MOV, PNG or JPEG here or <span className="tv-gradient-text font-semibold">browse</span></>}
      </p>
      {busy ? (
        <div className="mt-3 space-y-1" onClick={(e) => e.stopPropagation()}>
          <Progress value={pct} />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-soft">
              {pct}% {fileIndex.total > 1 ? `· file ${fileIndex.current}/${fileIndex.total}` : ""}
            </p>
            <button
              type="button"
              className="tv-btn tv-btn-ghost text-xs px-2 py-1"
              onClick={(e) => { e.stopPropagation(); cancelUpload(); }}
            >
              Cancel upload
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-soft mt-1">
            Up to 500 MB. Images auto-optimized. Goes live on the TV immediately.
          </p>
          <label
            className="mt-3 inline-flex items-center gap-2 text-xs text-soft cursor-pointer select-none group"
            data-tour="compress-toggle"
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`tv-gradient-toggle ${compressVideos ? "is-on" : ""}`} aria-hidden="true" />
            <input
              type="checkbox"
              checked={compressVideos}
              onChange={(e) => setCompressVideos(e.target.checked)}
              className="sr-only"
            />
            Compress videos for TV (recommended — smoother on Fire Stick)
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-soft hover:text-white"
              title={
                "Re-encodes your video to 1080p H.264 right in your browser before upload. " +
                "Result: smoother playback on Fire Stick TVs and a much smaller file. " +
                "Adds 1–8 minutes per video depending on size. Uncheck if your file is already optimized."
              }
              onClick={(e) => e.preventDefault()}
            >
              <Info className="w-3.5 h-3.5" />
            </span>
          </label>
        </>
      )}
    </div>
  );
}

type UploadInit = {
  path: string;
  token: string;
  publicUrl: string;
};

type StorageUploadFailure = {
  fileName: string;
  message: string;
  status?: number;
  body?: string;
};

function normalizeUploadInit(value: unknown): UploadInit {
  const maybeWrapped = value as { data?: unknown; result?: unknown } | null;
  const raw = ((maybeWrapped?.data ?? maybeWrapped?.result ?? value) || {}) as Record<string, unknown>;
  const signedUrl = typeof raw.signedUrl === "string" ? raw.signedUrl : "";
  const pathFromSignedUrl = signedUrl.match(/\/object\/upload\/sign\/tv-content\/([^?]+)/)?.[1]
    ?? signedUrl.match(/\/object\/sign\/tv-content\/([^?]+)/)?.[1];
  const tokenFromSignedUrl = signedUrl ? new URL(signedUrl, window.location.origin).searchParams.get("token") : null;
  const path = typeof raw.path === "string" && raw.path ? raw.path : pathFromSignedUrl ? decodeURIComponent(pathFromSignedUrl) : "";
  const token = typeof raw.token === "string" && raw.token ? raw.token : tokenFromSignedUrl ?? "";
  const publicUrl = typeof raw.publicUrl === "string" ? raw.publicUrl : "";

  if (!path || !token || !publicUrl) {
    throw new Error("Upload could not start. Please refresh and try again.");
  }

  return { path, token, publicUrl };
}

async function uploadToStorage(
  path: string,
  token: string,
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const failure = await rawUploadToSignedUrl(path, token, file, onProgress, signal);
  if (failure) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Upload cancelled"), { name: "AbortError" });
    }
    console.error("TV content upload failed", failure);
    throw Object.assign(new Error(failure.message), { uploadFailure: failure });
  }
  onProgress(100);
}

async function rawUploadToSignedUrl(
  path: string,
  token: string,
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<StorageUploadFailure | null> {
  const failure: StorageUploadFailure = { fileName: file.name, message: "Upload failed" };

  try {
    const { data: { publicUrl } } = supabase.storage.from("tv-content").getPublicUrl(path);
    const projectOrigin = new URL(publicUrl).origin;
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);

    const headers: Record<string, string> = { "x-upsert": "false" };
    const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (apiKey) headers.apikey = apiKey;

    const url = `${projectOrigin}/storage/v1/object/upload/sign/tv-content/${encodeStoragePath(path)}?token=${encodeURIComponent(token)}`;
    const result = await new Promise<{ status: number; statusText: string; body: string } | { aborted: true }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
        }
      };
      xhr.onload = () => resolve({ status: xhr.status, statusText: xhr.statusText, body: xhr.responseText });
      xhr.onerror = () => resolve({ status: 0, statusText: "Network error", body: "" });
      xhr.onabort = () => resolve({ aborted: true });
      if (signal) {
        if (signal.aborted) { xhr.abort(); }
        else signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
      xhr.send(body);
    });

    if ("aborted" in result) {
      failure.message = `Upload cancelled for ${file.name}.`;
      return failure;
    }
    if (result.status >= 200 && result.status < 300) return null;

    failure.status = result.status;
    failure.body = result.body;
    failure.message = classifyStorageUploadFailure(failure, result.statusText || "Upload failed");
  } catch (rawError) {
    const fallbackMessage = rawError instanceof Error ? rawError.message : String(rawError || "Upload failed");
    failure.body = fallbackMessage;
    failure.message = `Upload failed for ${file.name}: ${fallbackMessage}`;
  }

  return failure;
}

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function classifyStorageUploadFailure(failure: StorageUploadFailure, fallbackMessage: string) {
  const text = `${failure.status ?? ""} ${failure.body ?? ""} ${fallbackMessage}`.toLowerCase();

  if (failure.status === 413 || text.includes("too large") || text.includes("file_size") || text.includes("payload too large")) {
    return `Upload failed for ${failure.fileName}: file is too large. The current limit is 500 MB.`;
  }
  if (failure.status === 415 || text.includes("mime") || text.includes("content type") || text.includes("not allowed")) {
    return `Upload failed for ${failure.fileName}: unsupported file type. Please use PNG, JPEG, MP4, or MOV.`;
  }
  if (failure.status === 401 || failure.status === 403 || text.includes("jwt") || text.includes("token") || text.includes("unauthorized")) {
    return `Upload failed for ${failure.fileName}: the upload link expired or your session is no longer valid. Refresh and try again.`;
  }
  if (failure.status === 404 || text.includes("bucket") || text.includes("not found")) {
    return `Upload failed for ${failure.fileName}: storage bucket not found. Please contact support.`;
  }

  return `Upload failed for ${failure.fileName}: ${fallbackMessage}`;
}

function formatUploadAlert(error: unknown) {
  const failure = (error as { uploadFailure?: StorageUploadFailure } | null)?.uploadFailure;
  if (failure) {
    return failure.message;
  }

  const message = error instanceof Error ? error.message : String(error || "Upload failed");
  if (message.includes("Unauthorized")) {
    // Local HTTP cannot set the secure cross-site dashboard cookie; production HTTPS keeps recordUploadFn reachable.
    return "Upload completed, but the dashboard session expired before it could be recorded. Refresh and try again.";
  }
  return message;
}

function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B","KB","MB","GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
