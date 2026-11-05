import { getImageEntry } from "../data/files";
import { boundsOverlap, getElementBounds, getLocalBox, type Bounds } from "../geometry/bounds";
import { GRID_SIZE } from "../geometry/snap";
import { parseEmbedUrl } from "../embed/embed";
import type { EmbeddableElement, FrameElement, ImageElement, SketchElement } from "../scene/types";
import type { AppState } from "../state/appState";
import { resolveTheme } from "../state/operations";
import { drawElement, getRenderPad } from "./elementCanvas";

/**
 * The page's dark mode inverts the whole scene canvas with a CSS filter. Pictures are drawn with the opposite
 * filter first so they keep their own colours.
 */
export const IMAGE_COUNTER_FILTER = "invert(100%) hue-rotate(180deg) saturate(1.25)";

/** Paints the scene (background + every visible element) onto the static canvas. */
export function renderStatic(canvas: HTMLCanvasElement, state: AppState, elements: readonly SketchElement[], dpr: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = state.viewBackgroundColor;
  ctx.fillRect(0, 0, state.width, state.height);
  if (state.gridMode) drawGrid(ctx, state);

  const view: Bounds = [
    -state.offsetX / state.zoom,
    -state.offsetY / state.zoom,
    (state.width - state.offsetX) / state.zoom,
    (state.height - state.offsetY) / state.zoom,
  ];
  const erasing = state.erasingIds.length ? new Set(state.erasingIds) : null;
  const dark = resolveTheme(state.theme) === "dark";
  let byId: Map<string, SketchElement> | null = null;
  const lookup = () => (byId ??= new Map(elements.map((e) => [e.id, e])));

  for (const el of elements) {
    if (el.isDeleted) continue;
    const b = getElementBounds(el);
    const pad = getRenderPad(el) + (el.type === "frame" ? 30 : 0); // a frame's name sits above it
    if (!boundsOverlap([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], view)) continue;
    const alpha = erasing?.has(el.id) ? 0.2 : 1;

    if (el.type === "frame") {
      drawFrame(ctx, el, state, alpha);
      continue;
    }
    if (el.type === "text" && el.containerId) {
      // An arrow's label gets a canvas-coloured backing so the line does not run through the letters.
      if (lookup().get(el.containerId)?.type === "arrow" && el.text !== "") drawLabelBacking(ctx, el, state, alpha);
    }
    if (el.id === state.editingTextId) continue;

    // Elements in a frame are clipped to it.
    const frame = state.frameRendering && el.frameId ? lookup().get(el.frameId) : undefined;
    const clip = frame && frame.type === "frame" && !frame.isDeleted ? frame : null;
    if (clip) {
      const fb = getLocalBox(clip);
      ctx.save();
      ctx.beginPath();
      ctx.rect(fb.x * state.zoom + state.offsetX, fb.y * state.zoom + state.offsetY, fb.width * state.zoom, fb.height * state.zoom);
      ctx.clip();
    }
    if (el.type === "image") drawImageElement(ctx, el, state, dark, alpha);
    else if (el.type === "embeddable") drawEmbedPlaceholder(ctx, el, state, alpha);
    else drawElement(ctx, el, state, dpr, alpha);
    if (clip) ctx.restore();
  }
}

/** Faint grid lines every GRID_SIZE units (stronger every fifth), coarser when zoomed far out. */
function drawGrid(ctx: CanvasRenderingContext2D, state: AppState) {
  const z = state.zoom;
  let step = GRID_SIZE;
  while (step * z < 8) step *= 5;
  const major = GRID_SIZE * 5;
  const minorPath = new Path2D();
  const majorPath = new Path2D();
  const x0 = Math.floor(-state.offsetX / z / step) * step;
  const x1 = (state.width - state.offsetX) / z;
  for (let x = x0; x <= x1; x += step) {
    const sx = Math.round(x * z + state.offsetX) + 0.5;
    const path = Math.abs(x % major) < 1e-6 ? majorPath : minorPath;
    path.moveTo(sx, 0);
    path.lineTo(sx, state.height);
  }
  const y0 = Math.floor(-state.offsetY / z / step) * step;
  const y1 = (state.height - state.offsetY) / z;
  for (let y = y0; y <= y1; y += step) {
    const sy = Math.round(y * z + state.offsetY) + 0.5;
    const path = Math.abs(y % major) < 1e-6 ? majorPath : minorPath;
    path.moveTo(0, sy);
    path.lineTo(state.width, sy);
  }
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
  ctx.stroke(minorPath);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.13)";
  ctx.stroke(majorPath);
  ctx.restore();
}

function drawLabelBacking(ctx: CanvasRenderingContext2D, el: SketchElement, state: AppState, alpha: number) {
  const box = getLocalBox(el);
  const pad = 4;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = state.viewBackgroundColor;
  ctx.fillRect(
    box.x * state.zoom + state.offsetX - pad,
    box.y * state.zoom + state.offsetY - pad,
    box.width * state.zoom + pad * 2,
    box.height * state.zoom + pad * 2,
  );
  ctx.restore();
}

/** A frame: a thin rounded outline with its name above the top-left corner. Nothing when frame rendering is off. */
function drawFrame(ctx: CanvasRenderingContext2D, el: FrameElement, state: AppState, alpha: number) {
  if (!state.frameRendering) return;
  const box = getLocalBox(el);
  const z = state.zoom;
  const x = box.x * z + state.offsetX;
  const y = box.y * z + state.offsetY;
  const w = box.width * z;
  const h = box.height * z;
  ctx.save();
  ctx.globalAlpha = alpha * (el.opacity / 100);
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.stroke();
  if (state.editingFrameId !== el.id) {
    ctx.font = '600 12px "Nunito", system-ui, sans-serif';
    ctx.fillStyle = el.strokeColor;
    ctx.textBaseline = "bottom";
    let text = el.name ?? "Frame";
    while (text.length > 1 && ctx.measureText(text).width > w) text = text.slice(0, -2) + "…";
    ctx.fillText(text, x, y - 6, Math.max(w, 1));
  }
  ctx.restore();
}

function drawImageElement(ctx: CanvasRenderingContext2D, el: ImageElement, state: AppState, dark: boolean, alpha: number) {
  const box = getLocalBox(el);
  const z = state.zoom;
  const w = box.width * z;
  const h = box.height * z;
  const entry = getImageEntry(el.fileId);
  ctx.save();
  ctx.globalAlpha = alpha * (el.opacity / 100);
  ctx.translate((box.x + box.width / 2) * z + state.offsetX, (box.y + box.height / 2) * z + state.offsetY);
  if (el.angle) ctx.rotate(el.angle);
  if (entry) {
    ctx.scale(el.scale[0], el.scale[1]);
    if (dark) ctx.filter = IMAGE_COUNTER_FILTER;
    const c = el.crop;
    ctx.drawImage(entry.image, c?.x ?? 0, c?.y ?? 0, c?.width ?? entry.width, c?.height ?? entry.height, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = "#e5e7eb";
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "#6b7280";
    ctx.font = '600 13px "Nunito", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(el.status === "pending" || el.fileId ? "Loading image…" : "Image unavailable", 0, 0, Math.max(w - 8, 1));
  }
  ctx.restore();
}

/** What shows on the canvas (and in exports) for an embed; the live page is an iframe drawn over it. */
function drawEmbedPlaceholder(ctx: CanvasRenderingContext2D, el: EmbeddableElement, state: AppState, alpha: number) {
  const box = getLocalBox(el);
  const z = state.zoom;
  const x = box.x * z + state.offsetX;
  const y = box.y * z + state.offsetY;
  const w = box.width * z;
  const h = box.height * z;
  const info = el.link ? parseEmbedUrl(el.link) : null;
  ctx.save();
  ctx.globalAlpha = alpha * (el.opacity / 100);
  ctx.fillStyle = "#f3f4f6";
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#4b5563";
  ctx.font = '700 14px "Nunito", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(info ? info.label : "Embed", x + w / 2, y + h / 2, Math.max(w - 12, 1));
  ctx.restore();
}
