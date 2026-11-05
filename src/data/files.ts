import { openDB, type IDBPDatabase } from "idb";

/** Pictures larger than this (on their longer side) are scaled down before they are stored. */
export const MAX_IMAGE_SIDE = 2000;
/** Larger files are refused. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPTED = /^image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif)$/;

export interface ImageEntry {
  /** SHA-1 of the stored bytes: the same picture is only kept once. */
  id: string;
  mimeType: string;
  blob: Blob;
  image: HTMLImageElement;
  /** Natural size of the (possibly downscaled) picture. */
  width: number;
  height: number;
}

/** Fits a size inside `max` on its longer side, keeping the aspect ratio. Never scales up. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export async function sha1Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------------------------- memory cache

const entries = new Map<string, ImageEntry>();
const loading = new Map<string, Promise<ImageEntry | null>>();
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version++;
  for (const l of [...listeners]) l();
}

/** Called when pictures finish loading, so the canvas can redraw. */
export const subscribeFiles = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const filesVersion = (): number => version;
export const getImageEntry = (id: string | null | undefined): ImageEntry | undefined => (id ? entries.get(id) : undefined);

// ---------------------------------------------------------------------------------------------- IndexedDB

interface StoredFile {
  id: string;
  mimeType: string;
  blob: Blob;
  created: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  return (dbPromise ??= openDB("sketchboard-files", 1, {
    upgrade(d) {
      d.createObjectStore("files", { keyPath: "id" });
    },
  }));
}

async function persist(entry: ImageEntry) {
  try {
    const record: StoredFile = { id: entry.id, mimeType: entry.mimeType, blob: entry.blob, created: Date.now() };
    await (await db()).put("files", record);
  } catch {
    /* storage unavailable (private window, quota): the picture still works until the page is closed */
  }
}

// ---------------------------------------------------------------------------------------------- decoding

async function decode(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url); // the decoded pixels stay available to drawImage
  }
}

const sizeOf = (img: HTMLImageElement) => ({ width: img.naturalWidth || 512, height: img.naturalHeight || 512 });

function rescale(img: HTMLImageElement, width: number, height: number, type: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  const mime = type === "image/jpeg" ? "image/jpeg" : "image/png";
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not scale the image"))), mime, 0.92));
}

/** Validates, downscales if large, hashes and stores a picture. The same bytes always give the same entry. */
export async function addImageBlob(input: Blob): Promise<ImageEntry> {
  if (!ACCEPTED.test(input.type)) throw new Error("That file type is not a supported image.");
  if (input.size > MAX_IMAGE_BYTES) throw new Error("That image is too large (the limit is 12 MB).");
  let blob = input;
  let img = await decode(blob);
  const natural = sizeOf(img);
  if (input.type !== "image/svg+xml") {
    const fit = fitWithin(natural.width, natural.height, MAX_IMAGE_SIDE);
    if (fit.width < natural.width || fit.height < natural.height) {
      blob = await rescale(img, fit.width, fit.height, input.type);
      img = await decode(blob);
    }
  }
  const id = await sha1Hex(await blob.arrayBuffer());
  const existing = entries.get(id);
  if (existing) return existing;
  const entry: ImageEntry = { id, mimeType: blob.type, blob, image: img, ...sizeOf(img) };
  entries.set(id, entry);
  bump();
  void persist(entry);
  return entry;
}

/** Brings a stored picture into memory (resolves null when it is not stored). */
export function loadImageEntry(id: string): Promise<ImageEntry | null> {
  const have = entries.get(id);
  if (have) return Promise.resolve(have);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      try {
        const rec = (await (await db()).get("files", id)) as StoredFile | undefined;
        if (!rec) return null;
        const img = await decode(rec.blob);
        const entry: ImageEntry = { id, mimeType: rec.mimeType, blob: rec.blob, image: img, ...sizeOf(img) };
        entries.set(id, entry);
        bump();
        return entry;
      } catch {
        return null;
      } finally {
        loading.delete(id);
      }
    })();
    loading.set(id, p);
  }
  return p;
}

/** Starts loading every picture the elements use (the canvas redraws as they arrive). */
export function preloadImages(elements: readonly { type: string; fileId?: string | null }[]) {
  for (const el of elements) if (el.type === "image" && el.fileId && !entries.has(el.fileId)) void loadImageEntry(el.fileId);
}
