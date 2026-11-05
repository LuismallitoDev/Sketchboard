import { getStroke } from "perfect-freehand";
import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";
import { getLocalBox } from "../geometry/bounds";
import type { Point } from "../geometry/math";
import { fontString } from "../geometry/text";
import { pointsBBox } from "../scene/linear";
import type { FreedrawElement, LinearElement, ShapeElement, SketchElement, TextElement } from "../scene/types";

const generator = rough.generator();
const MAX_CANVAS_DIM = 4096;

// Elements are immutable objects, so identity is a perfect cache key: a changed element is a new object.
const drawableCache = new WeakMap<SketchElement, Drawable[]>();
interface CanvasEntry {
  canvas: HTMLCanvasElement;
  scale: number;
  pad: number;
}
const canvasCache = new WeakMap<SketchElement, CanvasEntry>();

/** Extra room around the element's box for stroke width, rough wobble and arrowheads. */
export function getRenderPad(el: SketchElement): number {
  let pad = 6 + el.strokeWidth * 2 + el.roughness * 2;
  if (el.type === "arrow") pad += 30;
  if (el.type === "freedraw") pad += el.strokeWidth * 4;
  return Math.ceil(pad);
}

export function roughOptions(el: SketchElement): Options {
  const o: Options = {
    seed: el.seed,
    roughness: el.roughness,
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
    fill: el.backgroundColor === "transparent" ? undefined : el.backgroundColor,
    fillStyle: el.fillStyle,
    fillWeight: el.strokeWidth / 2,
    hachureGap: el.strokeWidth * 4,
    disableMultiStroke: el.strokeStyle !== "solid",
    preserveVertices: true,
  };
  if (el.strokeStyle === "dashed") o.strokeLineDash = [8, 8 + el.strokeWidth];
  if (el.strokeStyle === "dotted") o.strokeLineDash = [1.5, 6 + el.strokeWidth];
  return o;
}

function roundedRectPath(w: number, h: number): string {
  const r = Math.min(Math.min(w, h) * 0.25, 40);
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}

/** Polygon with every corner cut by a quadratic curve (a fraction `t` of each adjacent edge). */
function roundedPolygonPath(pts: readonly Point[], t = 0.2): string {
  const n = pts.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const a = [cur[0] + (prev[0] - cur[0]) * t, cur[1] + (prev[1] - cur[1]) * t];
    const b = [cur[0] + (next[0] - cur[0]) * t, cur[1] + (next[1] - cur[1]) * t];
    parts.push(`${i === 0 ? "M" : "L"} ${a[0]} ${a[1]} Q ${cur[0]} ${cur[1]} ${b[0]} ${b[1]}`);
  }
  return parts.join(" ") + " Z";
}

/** Points of a line/arrow/freedraw relative to the top-left of its points' bounding box. */
export function localPoints(el: LinearElement | FreedrawElement): Point[] {
  const b = pointsBBox(el.points);
  return el.points.map((p): Point => [p[0] - b.minX, p[1] - b.minY]);
}

function arrowheadArms(tip: Point, from: Point, size: number): [Point, Point] {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const spread = (22 * Math.PI) / 180;
  return [
    [tip[0] - size * Math.cos(angle - spread), tip[1] - size * Math.sin(angle - spread)],
    [tip[0] - size * Math.cos(angle + spread), tip[1] - size * Math.sin(angle + spread)],
  ];
}

function drawablesFor(el: ShapeElement | LinearElement): Drawable[] {
  const cached = drawableCache.get(el);
  if (cached) return cached;
  const opts = roughOptions(el);
  const out: Drawable[] = [];
  if (el.type === "line" || el.type === "arrow") {
    const pts = localPoints(el);
    if (pts.length >= 2) out.push(generator.linearPath(pts as [number, number][], { ...opts, fill: undefined }));
    if (el.type === "arrow" && pts.length >= 2) {
      const headOpts: Options = { ...opts, fill: undefined, strokeLineDash: undefined, disableMultiStroke: true };
      const addHead = (tip: Point, from: Point) => {
        const segLen = Math.hypot(tip[0] - from[0], tip[1] - from[1]);
        if (segLen < 1) return;
        const size = Math.min(14 + el.strokeWidth * 3, segLen * 0.6);
        for (const arm of arrowheadArms(tip, from, size)) out.push(generator.line(tip[0], tip[1], arm[0], arm[1], headOpts));
      };
      if (el.endArrowhead === "arrow") addHead(pts[pts.length - 1], pts[pts.length - 2]);
      if (el.startArrowhead === "arrow") addHead(pts[0], pts[1]);
    }
  } else {
    const w = el.width;
    const h = el.height;
    if (el.type === "rectangle") {
      out.push(el.roundness ? generator.path(roundedRectPath(w, h), opts) : generator.rectangle(0, 0, w, h, opts));
    } else if (el.type === "diamond") {
      const pts: Point[] = [
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ];
      out.push(el.roundness ? generator.path(roundedPolygonPath(pts), opts) : generator.polygon(pts as [number, number][], opts));
    } else {
      out.push(generator.ellipse(w / 2, h / 2, w, h, opts));
    }
  }
  drawableCache.set(el, out);
  return out;
}

function freedrawPath(el: FreedrawElement): Path2D {
  const pts = localPoints(el);
  const input: number[][] = pts.map((p, i) => (el.simulatePressure ? [p[0], p[1]] : [p[0], p[1], el.pressures[i] ?? 0.5]));
  if (input.length === 1) input.push([input[0][0] + 0.1, input[0][1] + 0.1, ...input[0].slice(2)]);
  const outline = getStroke(input, {
    size: el.strokeWidth * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    simulatePressure: el.simulatePressure,
    last: true,
  });
  if (outline.length === 0) return new Path2D();
  const d: (string | number)[] = ["M", outline[0][0], outline[0][1], "Q"];
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  d.push("Z");
  return new Path2D(d.join(" "));
}

function paintText(ctx: CanvasRenderingContext2D, el: TextElement) {
  ctx.font = fontString(el.fontSize, el.fontFamily);
  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = "top";
  ctx.textAlign = el.textAlign;
  const lh = el.fontSize * el.lineHeight;
  const x = el.textAlign === "left" ? 0 : el.textAlign === "center" ? el.width / 2 : el.width;
  el.text.split("\n").forEach((line, i) => ctx.fillText(line, x, i * lh + (lh - el.fontSize) / 2));
}

function getEntry(el: SketchElement, zoom: number, dpr: number): CanvasEntry {
  const box = getLocalBox(el);
  const pad = getRenderPad(el);
  const logicalW = box.width + pad * 2;
  const logicalH = box.height + pad * 2;
  const scale = Math.max(0.01, Math.min(zoom * dpr, MAX_CANVAS_DIM / logicalW, MAX_CANVAS_DIM / logicalH));
  const cached = canvasCache.get(el);
  if (cached && Math.abs(cached.scale - scale) < 1e-3) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(logicalW * scale));
  canvas.height = Math.max(1, Math.ceil(logicalH * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(pad, pad);
  if (el.type === "text") {
    paintText(ctx, el);
  } else if (el.type === "freedraw") {
    ctx.fillStyle = el.strokeColor;
    ctx.fill(freedrawPath(el));
  } else {
    const rc = rough.canvas(canvas);
    for (const d of drawablesFor(el)) rc.draw(d);
  }
  const entry = { canvas, scale, pad };
  canvasCache.set(el, entry);
  return entry;
}

/** Draws one element onto the (CSS-pixel) scene canvas context. */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: SketchElement,
  view: { zoom: number; offsetX: number; offsetY: number },
  dpr: number,
  alpha = 1,
) {
  if (el.type === "text" && el.text === "") return;
  const box = getLocalBox(el);
  const { canvas, pad } = getEntry(el, view.zoom, dpr);
  const cx = (box.x + box.width / 2) * view.zoom + view.offsetX;
  const cy = (box.y + box.height / 2) * view.zoom + view.offsetY;
  const w = (box.width + pad * 2) * view.zoom;
  const h = (box.height + pad * 2) * view.zoom;
  ctx.save();
  ctx.globalAlpha = alpha * (el.opacity / 100);
  ctx.translate(cx, cy);
  if (el.angle) ctx.rotate(el.angle);
  ctx.drawImage(canvas, -w / 2, -h / 2, w, h);
  ctx.restore();
}
