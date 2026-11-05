import { boundsOverlap, getElementBounds, getLocalBox, type Bounds } from "../geometry/bounds";
import { GRID_SIZE } from "../geometry/snap";
import type { SketchElement } from "../scene/types";
import type { AppState } from "../state/appState";
import { drawElement, getRenderPad } from "./elementCanvas";

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
  let byId: Map<string, SketchElement> | null = null;

  for (const el of elements) {
    if (el.isDeleted) continue;
    const b = getElementBounds(el);
    const pad = getRenderPad(el);
    if (!boundsOverlap([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], view)) continue;
    const alpha = erasing?.has(el.id) ? 0.2 : 1;
    if (el.type === "text" && el.containerId) {
      // An arrow's label gets a canvas-coloured backing so the line does not run through the letters.
      byId ??= new Map(elements.map((e) => [e.id, e]));
      if (byId.get(el.containerId)?.type === "arrow" && el.text !== "") drawLabelBacking(ctx, el, state, alpha);
    }
    if (el.id === state.editingTextId) continue;
    drawElement(ctx, el, state, dpr, alpha);
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
