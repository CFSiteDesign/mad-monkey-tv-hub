import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef, type DragEvent, type ChangeEvent } from "react";
import logo from "@/assets/TheoroXlogo.png";
import { supabase } from "@/integrations/supabase/client";
import {
  getSessionFn, loginFn, logoutFn,
  listPropertiesFn, createUploadUrlFn, recordUploadFn,
  deleteAssetFn, reorderAssetsFn, regenerateCodeFn,
  listPropertiesPublicFn, devLoginFn,
  setImageDurationFn,
  type Session,
} from "@/lib/tv.functions";
import { TvHubHeader, TvHubFooter } from "@/components/TvHubHeader";
import { DashboardWalkthrough } from "@/components/DashboardWalkthrough";
import { Trash2, RefreshCw, Link2, FileVideo, UploadCloud, GripVertical, Clock, ChevronDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";

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
  const restoreDevSession = useServerFn(devLoginFn);
  const [localSession, setLocalSession] = useState<Session | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const { data: session, isLoading, refetch } = useQuery({
    queryKey: ["tv-session"],
    queryFn: () => fetchSession(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedTarget = params.get("view") || window.localStorage.getItem(DASHBOARD_AUTH_KEY);
    if (!savedTarget) return;
    let cancelled = false;
    setIsRestoringSession(true);
    restoreDevSession({ data: { target: savedTarget } })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          window.localStorage.removeItem(DASHBOARD_AUTH_KEY);
          window.history.replaceState(null, "", "/dashboard");
          setLocalSession(null);
          return;
        }
        window.localStorage.setItem(DASHBOARD_AUTH_KEY, savedTarget);
        setLocalSession(
          savedTarget === "__global__"
            ? { role: "global_marketing" }
            : { role: "gm", slug: savedTarget, name: "", country: "" }
        );
        refetch();
      })
      .finally(() => {
        if (!cancelled) setIsRestoringSession(false);
      });
    return () => { cancelled = true; };
  }, []);

  const activeSession = localSession ?? session;

  if ((isLoading || isRestoringSession) && !activeSession) {
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

// ---------- Dev Picker (no login) ----------

function LoginScreen({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const fetchProps = useServerFn(listPropertiesPublicFn);
  const devLogin = useServerFn(devLoginFn);
  const { data: props, isLoading } = useQuery({
    queryKey: ["tv-picker"],
    queryFn: () => fetchProps(),
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function pick(target: string) {
    setBusy(target);
    const res = await devLogin({ data: { target } });
    if (res.ok) {
      window.localStorage.setItem(DASHBOARD_AUTH_KEY, target);
      window.history.replaceState(null, "", `/dashboard?view=${encodeURIComponent(target)}`);
      onLoggedIn(
        target === "__global__"
          ? { role: "global_marketing" }
          : { role: "gm", slug: target, name: "", country: "" }
      );
      return;
    }
    setBusy(null);
  }

  const grouped: Record<string, NonNullable<typeof props>> = {};
  for (const p of props ?? []) (grouped[p.country] ||= []).push(p);

  return (
    <div className="min-h-screen bg-black px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <img src={logo} alt="TheoroX" className="h-20 mx-auto mb-8" />
          <h1 className="text-5xl font-extrabold tracking-tight tv-gradient-underline mb-3">
            TV Hub
          </h1>
          <p className="text-soft">Pick a view (dev mode — no login)</p>
        </div>

        <button
          onClick={() => pick("__global__")}
          disabled={busy === "__global__"}
          className="tv-btn-solid w-full mb-10 py-4 text-lg"
        >
          {busy === "__global__" ? "Entering…" : "Enter as Global Marketing"}
        </button>

        {isLoading && <p className="text-soft text-center">Loading…</p>}

        <div className="space-y-8">
          {Object.entries(grouped).map(([country, list]) => (
            <section key={country}>
              <h2 className="country-heading mb-4">{country}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {list.map((p) => (
                  <button
                    key={p.slug}
                    disabled={p.coming_soon || busy === p.slug}
                    onClick={() => pick(p.slug)}
                    className="tv-card p-4 text-left hover:border-white/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <p className="font-bold text-lg">{p.name}</p>
                    <p className="text-xs text-soft mt-1">
                      {p.coming_soon ? "Coming soon" : busy === p.slug ? "Entering…" : "Enter as GM"}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
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
  return (
    <div className="tv-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-soft">{property.country}</p>
          <h3 className="text-xl font-bold truncate">{property.name}</h3>
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="country-heading mb-2">{property.country}</h2>
        <h1 className="text-4xl font-extrabold mb-1">{property.name}</h1>
        <p className="text-soft">{(property as any).assets?.length || 0} items currently playing</p>
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
  property, role, hideCode = false,
}: { property: PropertyData; role: "global_marketing" | "gm"; hideCode?: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["tv-all"] });
  const playUrl = `https://mad-monkey-tv-hub.lovable.app/${property.slug}/play`;

  return (
    <div className="tv-card p-6">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-widest text-soft">{property.country}</span>
        <span className="tv-pill">{property.assets.length} items</span>
      </div>
      <h3 className="text-2xl font-bold mb-4">{property.name}</h3>

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

function PropertyCodeRow({ slug, initial }: { slug: string; initial: string }) {
  const [code, setCode] = useState(initial);
  const regen = useServerFn(regenerateCodeFn);
  const m = useMutation({
    mutationFn: () => regen({ data: { slug, auth_token: getDashboardAuthToken() } }),
    onSuccess: (res) => setCode(res.access_code),
  });
  return (
    <div className="mt-5 pt-5 border-t border-white/10 flex items-center justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-soft mb-1">GM access code</p>
        <code className="font-mono text-lg tracking-widest">{code}</code>
      </div>
      <button
        className="tv-btn"
        disabled={m.isPending}
        onClick={() => m.mutate()}
      >
        <RefreshCw className="w-4 h-4" /> {m.isPending ? "…" : "Regenerate"}
      </button>
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
    <div className="mt-4 p-3 rounded-lg bg-black/40 border border-white/5">
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
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const createUrl = useServerFn(createUploadUrlFn);
  const record = useServerFn(recordUploadFn);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const allowedExt = ["mp4", "mov", "png", "jpg", "jpeg"];
    const allowedMime = ["video/mp4", "video/quicktime", "image/png", "image/jpeg"];
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(files)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const ok = allowedExt.includes(ext) || allowedMime.includes(f.type);
      if (ok) accepted.push(f); else rejected.push(f.name);
    }
    if (rejected.length) {
      alert(`Only MP4, MOV, PNG and JPEG are allowed.\nSkipped: ${rejected.join(", ")}`);
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
        setProgress(`Uploading ${i}/${accepted.length}: ${file.name}`);
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const type = file.type.startsWith("video") || ext === "mp4" || ext === "mov" ? "video" : "image";
        const auth_token = getDashboardAuthToken();
        const init = normalizeUploadInit(await createUrl({ data: { slug, file_name: file.name, auth_token } }));
        const controller = new AbortController();
        abortRef.current = controller;
        await uploadToStorage(init.path, init.token, file, (p) => setPct(p), controller.signal);
        abortRef.current = null;
        if (cancelledRef.current) break;
        await record({ data: {
          slug, file_url: init.publicUrl, file_name: file.name,
          file_size: file.size, file_type: type, auth_token,
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
        <p className="text-xs text-soft mt-1">Goes live on the TV immediately.</p>
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
