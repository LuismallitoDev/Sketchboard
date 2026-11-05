import { boundsOverlap, getElementBounds, type Bounds } from "../geometry/bounds";
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

  const view: Bounds = [
    -state.offsetX / state.zoom,
    -state.offsetY / state.zoom,
    (state.width - state.offsetX) / state.zoom,
    (state.height - state.offsetY) / state.zoom,
  ];
  const erasing = state.erasingIds.length ? new Set(state.erasingIds) : null;

  for (const el of elements) {
    if (el.isDeleted || el.id === state.editingTextId) continue;
    const b = getElementBounds(el);
    const pad = getRenderPad(el);
    if (!boundsOverlap([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], view)) continue;
    drawElement(ctx, el, state, dpr, erasing?.has(el.id) ? 0.2 : 1);
  }
}
