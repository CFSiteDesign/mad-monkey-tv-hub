import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COOKIE_NAME = "tvhub_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function defaultAdminPassword() {
  return process.env.ADMIN_PASSWORD || "9";
}

export type Session =
  | { role: "global_marketing" }
  | { role: "gm"; slug: string; name: string; country: string };

async function resolveSession(): Promise<Session | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  if (token === defaultAdminPassword()) return { role: "global_marketing" };
  const { data } = await supabaseAdmin
    .from("properties")
    .select("slug,name,country")
    .eq("access_code", token)
    .order("name")
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return { role: "gm", slug: row.slug, name: row.name, country: row.country };
}

export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async () => resolveSession()
);

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: String(d.code || "").trim() }))
  .handler(async ({ data }) => {
    const code = data.code;
    if (!code) return { ok: false as const, error: "Invalid access code" };

    if (code === defaultAdminPassword()) {
      setCookie(COOKIE_NAME, code, {
        httpOnly: true, secure: true, sameSite: "none",
        path: "/", maxAge: COOKIE_MAX_AGE,
      });
      return { ok: true as const, session: { role: "global_marketing" } as Session };
    }

    const { data: props } = await supabaseAdmin
      .from("properties")
      .select("slug,name,country,coming_soon")
      .eq("access_code", code)
      .order("name");
    const prop = (props ?? []).find((p) => !p.coming_soon);
    if (!prop) {
      return { ok: false as const, error: "Invalid access code" };
    }

    setCookie(COOKIE_NAME, code, {
      httpOnly: true, secure: true, sameSite: "none",
      path: "/", maxAge: COOKIE_MAX_AGE,
    });
    return {
      ok: true as const,
      session: { role: "gm", slug: prop.slug, name: prop.name, country: prop.country } as Session,
    };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  deleteCookie(COOKIE_NAME, { path: "/" });
  return { ok: true };
});

// DEV: list properties for the no-login picker
export const listPropertiesPublicFn = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("properties")
    .select("slug,name,country,coming_soon,access_code")
    .order("country")
    .order("name");
  return sortKampotLast(data ?? []);
});

// DEV: log in directly as a property or global without typing a code
export const devLoginFn = createServerFn({ method: "POST" })
  .inputValidator((d: { target: string }) => ({ target: String(d.target) }))
  .handler(async ({ data }) => {
    if (data.target === "__global__") {
      setCookie(COOKIE_NAME, defaultAdminPassword(), {
        httpOnly: true, secure: true, sameSite: "none",
        path: "/", maxAge: COOKIE_MAX_AGE,
      });
      return { ok: true as const };
    }
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("slug,access_code,coming_soon")
      .eq("slug", data.target)
      .maybeSingle();
    if (!prop || prop.coming_soon) return { ok: false as const, error: "Not available" };
    setCookie(COOKIE_NAME, prop.access_code, {
      httpOnly: true, secure: true, sameSite: "none",
      path: "/", maxAge: COOKIE_MAX_AGE,
    });
    return { ok: true as const };
  });

// ---- Data fns ----

export const listPropertiesFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });

  const { data: props } = await supabaseAdmin
    .from("properties")
    .select("id,slug,name,country,access_code,coming_soon")
    .order("country")
    .order("name");

  const slugs = (props ?? []).map((p) => p.slug);
  const { data: assets } = await supabaseAdmin
    .from("tv_assets")
    .select("*")
    .in("property_slug", slugs.length ? slugs : ["__none__"])
    .order("display_order", { ascending: true });

  const byProp: Record<string, typeof assets> = {};
  for (const a of assets ?? []) {
    (byProp[a.property_slug] ||= [] as any).push(a);
  }

  // Hide access codes from GM scope
  const sanitized = (props ?? []).map((p) => {
    if (session.role === "global_marketing") return { ...p, assets: byProp[p.slug] ?? [] };
    return {
      id: p.id, slug: p.slug, name: p.name, country: p.country,
      coming_soon: p.coming_soon, access_code: null as string | null,
      assets: session.role === "gm" && session.slug === p.slug ? byProp[p.slug] ?? [] : [],
    };
  });

  return { session, properties: sanitized };
});

export const getPropertyAssetsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => ({ slug: String(d.slug) }))
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) throw new Response("Unauthorized", { status: 401 });
    if (session.role === "gm" && session.slug !== data.slug) {
      throw new Response("Forbidden", { status: 403 });
    }
    const { data: assets } = await supabaseAdmin
      .from("tv_assets")
      .select("*")
      .eq("property_slug", data.slug)
      .order("display_order", { ascending: true });
    return assets ?? [];
  });

export const recordUploadFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    slug: string; file_url: string; file_name: string;
    file_size: number; file_type: "image" | "video";
  }) => d)
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) throw new Response("Unauthorized", { status: 401 });
    if (session.role === "gm" && session.slug !== data.slug) {
      throw new Response("Forbidden", { status: 403 });
    }
    const { data: maxRow } = await supabaseAdmin
      .from("tv_assets")
      .select("display_order")
      .eq("property_slug", data.slug)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.display_order ?? -1) + 1;

    const { data: inserted, error } = await supabaseAdmin
      .from("tv_assets")
      .insert({
        property_slug: data.slug,
        file_url: data.file_url,
        file_name: data.file_name,
        file_size: data.file_size,
        file_type: data.file_type,
        uploaded_by: session.role === "global_marketing" ? "global_marketing" : "gm",
        display_order: nextOrder,
      })
      .select()
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return inserted;
  });

export const createUploadUrlFn = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; file_name: string }) => d)
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) throw new Response("Unauthorized", { status: 401 });
    if (session.role === "gm" && session.slug !== data.slug) {
      throw new Response("Forbidden", { status: 403 });
    }
    const safe = data.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.slug}/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("tv-content")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Response(error?.message || "Upload init failed", { status: 400 });
    const { data: pub } = supabaseAdmin.storage.from("tv-content").getPublicUrl(path);
    return { path, token: signed.token, signedUrl: signed.signedUrl, publicUrl: pub.publicUrl };
  });

export const deleteAssetFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) throw new Response("Unauthorized", { status: 401 });
    const { data: asset } = await supabaseAdmin
      .from("tv_assets").select("*").eq("id", data.id).maybeSingle();
    if (!asset) throw new Response("Not found", { status: 404 });
    if (session.role === "gm" && session.slug !== asset.property_slug) {
      throw new Response("Forbidden", { status: 403 });
    }
    // Delete from storage too
    const url = asset.file_url;
    const m = url.match(/tv-content\/(.+)$/);
    if (m) await supabaseAdmin.storage.from("tv-content").remove([m[1]]);
    await supabaseAdmin.from("tv_assets").delete().eq("id", data.id);
    return { ok: true };
  });

export const reorderAssetsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; ids: string[] }) => d)
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session || session.role !== "global_marketing") {
      throw new Response("Forbidden", { status: 403 });
    }
    for (let i = 0; i < data.ids.length; i++) {
      await supabaseAdmin.from("tv_assets")
        .update({ display_order: i })
        .eq("id", data.ids[i])
        .eq("property_slug", data.slug);
    }
    return { ok: true };
  });

export const regenerateCodeFn = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session || session.role !== "global_marketing") {
      throw new Response("Forbidden", { status: 403 });
    }
    const code = Array.from({ length: 8 }, () =>
      "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]
    ).join("");
    const { data: updated, error } = await supabaseAdmin
      .from("properties")
      .update({ access_code: code })
      .eq("slug", data.slug)
      .select("access_code")
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { access_code: updated.access_code };
  });

// Public play page fetch — no auth.
export const getPlayDataFn = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => ({ slug: String(d.slug) }))
  .handler(async ({ data }) => {
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("slug,name,country,coming_soon")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!prop) return { property: null, assets: [] as any[] };
    const { data: assets } = await supabaseAdmin
      .from("tv_assets")
      .select("id,file_url,file_type,file_name,display_order")
      .eq("property_slug", data.slug)
      .order("display_order", { ascending: true });
    return { property: prop, assets: assets ?? [] };
  });
