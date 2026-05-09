/**
 * Client-side media compression for the TV Hub uploader.
 *
 * - Images: drawn into a <canvas> at max 1920x1080 and re-encoded as JPEG.
 * - Videos: transcoded with ffmpeg.wasm to 1080p H.264 + AAC (Fire Stick friendly).
 *
 * All work happens in the GM's browser — no server transcoding.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const MAX_W = 1920;
const MAX_H = 1080;
const IMAGE_QUALITY = 0.85;

/**
 * Compress an image to <=1920x1080 JPEG. Returns the original file if it's
 * already small or the compression somehow produced a larger file.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file; // preserve animation

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  let { width, height } = bitmap;
  const ratio = Math.min(MAX_W / width, MAX_H / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY),
  );
  if (!blob || blob.size >= file.size) return file;

  const newName = file.name.replace(/\.(png|jpe?g|webp|heic|bmp)$/i, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
}

// ---------- Video (ffmpeg.wasm) ----------

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

const FFMPEG_CDN = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

async function getFFmpeg(onLoadProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    onLoadProgress?.("Loading compressor (one-time, ~30 MB)…");
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ff;
    return ff;
  })();

  try {
    return await ffmpegLoading;
  } finally {
    ffmpegLoading = null;
  }
}

/** Returns true if ffmpeg.wasm has finished loading once already. */
export function isFFmpegReady() {
  return ffmpegInstance !== null;
}

export type VideoCompressProgress = {
  /** Human-readable status. */
  status: string;
  /** 0..100, or null when indeterminate (e.g. during load). */
  pct: number | null;
};

/**
 * Transcode a video to 1080p H.264 + AAC. Returns the original file if the
 * compressed result would be larger.
 */
export async function compressVideo(
  file: File,
  onProgress?: (p: VideoCompressProgress) => void,
): Promise<File> {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
    return file;
  }

  const ff = await getFFmpeg((msg) => onProgress?.({ status: msg, pct: null }));

  const inputName = "in" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
  const outputName = "out.mp4";

  onProgress?.({ status: "Reading file…", pct: null });
  await ff.writeFile(inputName, await fetchFile(file));

  const handleProgress = ({ progress }: { progress: number }) => {
    if (progress >= 0 && progress <= 1) {
      onProgress?.({ status: "Compressing video…", pct: Math.round(progress * 100) });
    }
  };
  ff.on("progress", handleProgress);

  try {
    // 1080p max, H.264 baseline-friendly profile, AAC audio, fast preset.
    await ff.exec([
      "-i", inputName,
      "-vf", "scale='min(1920,iw)':'-2':flags=lanczos",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
      "-pix_fmt", "yuv420p",
      "-profile:v", "high",
      "-level", "4.0",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      outputName,
    ]);
  } finally {
    ff.off("progress", handleProgress);
  }

  const data = await ff.readFile(outputName);
  const buffer = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  // Cleanup virtual FS so memory is freed for the next file.
  try { await ff.deleteFile(inputName); } catch { /* noop */ }
  try { await ff.deleteFile(outputName); } catch { /* noop */ }

  if (buffer.byteLength >= file.size) {
    onProgress?.({ status: "Already optimized — keeping original", pct: 100 });
    return file;
  }

  const newName = file.name.replace(/\.[a-z0-9]+$/i, "") + ".mp4";
  // Copy into a fresh ArrayBuffer to satisfy BlobPart typing.
  const out = new Uint8Array(buffer.byteLength);
  out.set(buffer);
  return new File([out], newName, { type: "video/mp4", lastModified: Date.now() });
}