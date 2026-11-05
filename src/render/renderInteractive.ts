import { boxCenter, getLocalBox } from "../geometry/bounds";
import { linearHandles } from "../geometry/linearEdit";
import {
  CORNER_HANDLES,
  HANDLE_PAD,
  RESIZE_HANDLES,
  getSelectionFrame,
  handlePositions,
  type HandleName,
} from "../geometry/transform";
import type { SketchElement } from "../scene/types";
import type { AppState } from "../state/appState";
import { sceneToScreen } from "../state/viewport";

export const ACCENT_LIGHT = "#0d9488";
export const ACCENT_DARK = "#2dd4bf";

/** Which handles a selection offers (text only scales from its corners). */
export function allowedHandles(selected: readonly SketchElement[]): HandleName[] {
  if (selected.length === 1 && selected[0].locked) return [];
  // An elbow arrow's route is derived from its ends, so turning it makes no sense.
  if (selected.length === 1 && selected[0].type === "arrow" && selected[0].arrowType === "elbow") return [...RESIZE_HANDLES];
  // A single text scales from its corners and wraps from its sides; mixed with other elements only corners apply.
  if (selected.length === 1 && selected[0].type === "text") return ["rotate", ...CORNER_HANDLES, "e", "w"];
  if (selected.some((e) => e.type === "text")) return ["rotate", ...CORNER_HANDLES];
  return ["rotate", ...RESIZE_HANDLES];
}

/** Selection outlines, resize/rotate handles and the rubber-band box on the transparent overlay canvas. */
export function renderInteractive(
  canvas: HTMLCanvasElement,
  state: AppState,
  selected: readonly SketchElement[],
  dpr: number,
  dark: boolean,
  highlight: SketchElement | null = null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const accent = dark ? ACCENT_DARK : ACCENT_LIGHT;
  const z = state.zoom;

  if (highlight) drawBindingHighlight(ctx, state, highlight, accent);
  if (state.snapGuides.length > 0) drawGuides(ctx, state, dark ? "#fb7185" : "#e11d48");

  if (state.selectionBox) {
    const [x, y] = sceneToScreen(state, state.selectionBox.x, state.selectionBox.y);
    ctx.fillStyle = dark ? "rgba(45,212,191,0.12)" : "rgba(13,148,136,0.1)";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, state.selectionBox.width * z, state.selectionBox.height * z);
    ctx.strokeRect(x + 0.5, y + 0.5, state.selectionBox.width * z, state.selectionBox.height * z);
  }

  if (selected.length === 0 || state.editingTextId) return;

  // Point-editing mode: handles on the vertices and midpoints instead of the usual frame.
  const editing = state.editingLinearId ? selected.find((e) => e.id === state.editingLinearId) : undefined;
  if (editing && (editing.type === "line" || editing.type === "arrow")) {
    const { points, mids, editable } = linearHandles(editing);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accent;
    ctx.fillStyle = dark ? "rgba(45,212,191,0.45)" : "rgba(13,148,136,0.4)";
    for (const m of mids) {
      const [sx, sy] = sceneToScreen(state, m[0], m[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    points.forEach((p, i) => {
      if (!editable.includes(i)) return;
      const [sx, sy] = sceneToScreen(state, p[0], p[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = state.selectedPoints.includes(i) ? accent : dark ? "#1f2937" : "#ffffff";
      ctx.fill();
      ctx.stroke();
    });
    return;
  }

  // Outline every selected element when several are selected.
  if (selected.length > 1) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    for (const el of selected) strokeRotatedBox(ctx, state, getLocalBox(el), el.angle, 3);
  }

  const frame = getSelectionFrame(selected);
  if (!frame) return;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(selected.length > 1 ? [6, 4] : []);
  strokeRotatedBox(ctx, state, frame.box, frame.angle, HANDLE_PAD);
  ctx.setLineDash([]);

  const allowed = allowedHandles(selected);
  if (allowed.length === 0) return;
  const pos = handlePositions(frame, z);
  ctx.fillStyle = dark ? "#1f2937" : "#ffffff";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  for (const name of allowed) {
    const [sx, sy] = sceneToScreen(state, pos[name][0], pos[name][1]);
    ctx.save();
    ctx.translate(sx, sy);
    if (name === "rotate") {
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
    } else {
      ctx.rotate(frame.angle);
      ctx.beginPath();
      ctx.roundRect(-4.5, -4.5, 9, 9, 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** A soft outline around the shape an arrow end would attach to. */
function drawBindingHighlight(ctx: CanvasRenderingContext2D, view: AppState, shape: SketchElement, accent: string) {
  const box = getLocalBox(shape);
  const [cx, cy] = sceneToScreen(view, boxCenter(box)[0], boxCenter(box)[1]);
  const pad = 5;
  const w = box.width * view.zoom + pad * 2;
  const h = box.height * view.zoom + pad * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(shape.angle);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (shape.type === "ellipse") ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape.type === "diamond") {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.lineTo(-w / 2, 0);
    ctx.closePath();
  } else ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  ctx.stroke();
  ctx.restore();
}

/** Alignment lines and equal-gap markers (a line with a tick at each end). */
function drawGuides(ctx: CanvasRenderingContext2D, view: AppState, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const g of view.snapGuides) {
    const [ax, ay] = sceneToScreen(view, g.a[0], g.a[1]);
    const [bx, by] = sceneToScreen(view, g.b[0], g.b[1]);
    ctx.beginPath();
    ctx.moveTo(Math.round(ax) + 0.5, Math.round(ay) + 0.5);
    ctx.lineTo(Math.round(bx) + 0.5, Math.round(by) + 0.5);
    if (g.kind === "gap") {
      // Ticks across the line at both ends; the gap runs along x or y.
      const horizontal = Math.abs(by - ay) < Math.abs(bx - ax);
      for (const [px, py] of [
        [ax, ay],
        [bx, by],
      ]) {
        if (horizontal) {
          ctx.moveTo(Math.round(px) + 0.5, py - 4);
          ctx.lineTo(Math.round(px) + 0.5, py + 4);
        } else {
          ctx.moveTo(px - 4, Math.round(py) + 0.5);
          ctx.lineTo(px + 4, Math.round(py) + 0.5);
        }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function strokeRotatedBox(
  ctx: CanvasRenderingContext2D,
  view: Pick<AppState, "zoom" | "offsetX" | "offsetY">,
  box: { x: number; y: number; width: number; height: number },
  angle: number,
  padPx: number,
) {
  const [cx, cy] = sceneToScreen(view, boxCenter(box)[0], boxCenter(box)[1]);
  const w = box.width * view.zoom + padPx * 2;
  const h = box.height * view.zoom + padPx * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}
