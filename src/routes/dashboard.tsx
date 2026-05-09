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
  type Session,
} from "@/lib/tv.functions";
import { TvHubHeader, TvHubFooter } from "@/components/TvHubHeader";
import { Trash2, RefreshCw, Link2, GripVertical, FileVideo, UploadCloud } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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
    const savedTarget = params.get("view") || window.localStorage.getItem("tvhub_view");
    if (!savedTarget) return;
    let cancelled = false;
    setIsRestoringSession(true);
    restoreDevSession({ data: { target: savedTarget } })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          window.localStorage.removeItem("tvhub_view");
          window.history.replaceState(null, "", "/dashboard");
          setLocalSession(null);
          return;
        }
        window.localStorage.setItem("tvhub_view", savedTarget);
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
    window.localStorage.removeItem("tvhub_view");
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
      window.localStorage.setItem("tvhub_view", target);
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
    </div>
  );
}

// ---------- Global Marketing view ----------

function GlobalView() {
  const fetchAll = useServerFn(listPropertiesFn);
  const { data, isLoading } = useQuery({
    queryKey: ["tv-all"],
    queryFn: () => fetchAll(),
  });

  if (isLoading || !data) return <div className="text-soft">Loading properties…</div>;

  const grouped: Record<string, typeof data.properties> = {};
  for (const p of data.properties) (grouped[p.country] ||= []).push(p);

  return (
    <div className="space-y-12">
      {Object.entries(grouped).map(([country, props]) => (
        <section key={country}>
          <h2 className="country-heading mb-6">{country}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {props.map((p) =>
              p.coming_soon
                ? <ComingSoonCard key={p.id} name={p.name} country={p.country} />
                : <PropertyCard key={p.id} property={p as any} role="global_marketing" />
            )}
          </div>
        </section>
      ))}
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
    queryFn: () => fetchAll(),
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

      <div className="mt-5 space-y-2">
        {property.assets.length === 0 && (
          <p className="text-soft text-sm py-2">No content yet.</p>
        )}
        {property.assets.map((a) => (
          <AssetRow
            key={a.id} asset={a} role={role}
            onChanged={refresh}
          />
        ))}
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
    mutationFn: () => regen({ data: { slug } }),
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

function AssetRow({
  asset, role, onChanged,
}: { asset: Asset; role: "global_marketing" | "gm"; onChanged: () => void }) {
  const del = useServerFn(deleteAssetFn);
  const m = useMutation({
    mutationFn: () => del({ data: { id: asset.id } }),
    onSuccess: onChanged,
  });
  const isImg = asset.file_type === "image";
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-black/40 border border-white/5">
      {role === "global_marketing" && (
        <GripVertical className="w-4 h-4 text-soft shrink-0" />
      )}
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
        onClick={() => m.mutate()}
        title="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
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
  const createUrl = useServerFn(createUploadUrlFn);
  const record = useServerFn(recordUploadFn);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setFileIndex({ current: 0, total: files.length });
    try {
      let i = 0;
      for (const file of Array.from(files)) {
        i++;
        setFileIndex({ current: i, total: files.length });
        setPct(0);
        setProgress(`Uploading ${i}/${files.length}: ${file.name}`);
        const type = file.type.startsWith("video") ? "video" : "image";
        const init = await createUrl({ data: { slug, file_name: file.name } });
        await uploadToStorage(init.path, init.token, file, (p) => setPct(p));
        await record({ data: {
          slug, file_url: init.publicUrl, file_name: file.name,
          file_size: file.size, file_type: type,
        }});
      }
      onDone();
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setBusy(false); setProgress(""); setPct(0); setFileIndex({ current: 0, total: 0 });
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className={`tv-dropzone ${drag ? "is-dragging" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e: DragEvent) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault(); setDrag(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef} type="file" multiple accept="image/jpeg,image/png,video/mp4"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
      />
      <UploadCloud className="w-8 h-8 mx-auto mb-2 text-soft" />
      <p className="text-sm">
        {busy ? progress : <>Drop images or videos here or <span className="tv-gradient-text font-semibold">browse</span></>}
      </p>
      {busy ? (
        <div className="mt-3 space-y-1" onClick={(e) => e.stopPropagation()}>
          <Progress value={pct} />
          <p className="text-xs text-soft">
            {pct}% {fileIndex.total > 1 ? `· file ${fileIndex.current}/${fileIndex.total}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-xs text-soft mt-1">Goes live on the TV immediately.</p>
      )}
    </div>
  );
}

async function uploadToStorage(
  path: string,
  token: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  const { error } = await supabase.storage
    .from("tv-content")
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
    });
  if (error) {
    throw new Error(`Upload failed for ${file.name}: ${error.message}`);
  }
  onProgress(100);
}

function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B","KB","MB","GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
