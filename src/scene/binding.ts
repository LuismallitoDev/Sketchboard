import { boxCenter, getElementBounds, getLocalBox, type Bounds } from "../geometry/bounds";
import { dominantAxis, routeElbow } from "../geometry/elbow";
import { isInsideShape } from "../geometry/hit";
import { clamp, distance, rotatePoint, type Point } from "../geometry/math";
import { distanceOutsideShape, rayShapeInterval, sideMidpoints } from "../geometry/outline";
import { linearPatchFromAbs } from "./linear";
import type { Scene } from "./scene";
import type { Binding, LinearElement, Pt, ShapeElement, SketchElement } from "./types";

/** Space kept between an arrow's tip and the outline it is attached to. */
export const BINDING_GAP = 6;
/** How close (screen px) a dragged arrow end must be to a shape to attach to it. */
export const BIND_DISTANCE = 14;

export const isBindable = (el: SketchElement | undefined): el is ShapeElement =>
  !!el && (el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse");

export const shapeCenter = (el: SketchElement): Point => boxCenter(getLocalBox(el));

/** The point inside the shape an arrow aims at (scene coordinates). */
export function aimPoint(shape: SketchElement, focus: Pt): Point {
  const box = getLocalBox(shape);
  return rotatePoint([box.x + focus[0] * box.width, box.y + focus[1] * box.height], boxCenter(box), shape.angle);
}

/** The focus (fractions of the shape's box) for a scene point. */
export function focusFromPoint(shape: SketchElement, p: Point): Pt {
  const box = getLocalBox(shape);
  const q = rotatePoint(p, boxCenter(box), -shape.angle);
  return [
    box.width > 0 ? clamp((q[0] - box.x) / box.width, 0, 1) : 0.5,
    box.height > 0 ? clamp((q[1] - box.y) / box.height, 0, 1) : 0.5,
  ];
}

const unit = (v: Point): Point | null => {
  const len = Math.hypot(v[0], v[1]);
  return len < 1e-9 ? null : [v[0] / len, v[1] / len];
};

/**
 * Where an arrow end attached to `shape` sits: on the outline along the line from `from` (the arrow's other side)
 * towards the shape's aim point, held `binding.gap` away from the outline.
 */
export function boundEndpoint(shape: SketchElement, binding: Binding, from: Point): Point {
  const aim = aimPoint(shape, binding.focus);
  const dir = unit([aim[0] - from[0], aim[1] - from[1]]);
  if (!dir) return aim;
  const iv = rayShapeInterval(shape, from, dir);
  if (!iv) return aim;
  const t = iv[0] >= 0 ? iv[0] : iv[1]; // entering point, or the exit point when `from` is already inside
  const back = Math.min(binding.gap, Math.max(t, 0));
  return [from[0] + dir[0] * (t - back), from[1] + dir[1] * (t - back)];
}

/** Elbow arrows leave a shape straight out of a side: from the aim point along `out`, to the outline plus the gap. */
export function elbowEndpoint(shape: SketchElement, binding: Binding, out: readonly [number, number]): Point {
  const aim = aimPoint(shape, binding.focus);
  const iv = rayShapeInterval(shape, aim, [out[0], out[1]]);
  const t = iv ? Math.max(iv[1], 0) : 0;
  return [aim[0] + out[0] * (t + binding.gap), aim[1] + out[1] * (t + binding.gap)];
}

export interface BindingTarget {
  shape: ShapeElement;
  binding: Binding;
}

/**
 * The shape an arrow end dropped at `p` attaches to, if any: the topmost shape whose outline is within reach
 * (inside counts). Dropped inside, the arrow aims at that spot (or the centre when it is close to it); with
 * midpoint snapping it aims at the middle of the nearest side.
 */
export function findBindingTarget(
  elements: readonly SketchElement[],
  p: Point,
  zoom: number,
  exclude: ReadonlySet<string>,
  midpointSnapping: boolean,
): BindingTarget | null {
  const reach = BIND_DISTANCE / zoom;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.isDeleted || el.locked || exclude.has(el.id) || !isBindable(el)) continue;
    if (distanceOutsideShape(el, p) > reach) continue;

    let focus: Pt = [0.5, 0.5];
    if (midpointSnapping) {
      const mids = sideMidpoints(el);
      const nearest = mids.reduce((best, m) => (distance(m, p) < distance(best, p) ? m : best));
      focus = focusFromPoint(el, nearest);
    } else if (isInsideShape(el, p)) {
      const f = focusFromPoint(el, p);
      // Close to the middle counts as the middle.
      focus = Math.abs(f[0] - 0.5) < 0.12 && Math.abs(f[1] - 0.5) < 0.12 ? [0.5, 0.5] : f;
    }
    return { shape: el, binding: { elementId: el.id, gap: BINDING_GAP, focus } };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- the normalizer

const absPoints = (a: LinearElement): Point[] => a.points.map((p): Point => [a.x + p[0], a.y + p[1]]);
const samePoints = (a: readonly Point[], b: readonly Point[]) =>
  a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.01 && Math.abs(p[1] - b[i][1]) < 0.01);

/** New points of a straight or curved arrow whose ends follow the shapes they are attached to. */
function attachedPoints(a: LinearElement, S: SketchElement | undefined, E: SketchElement | undefined, abs: Point[]): Point[] {
  const n = abs.length;
  const out = [...abs];
  if (S && a.startBinding) {
    // With only two points, each end aims along the line to the other end's aim point.
    const from = n === 2 && E && a.endBinding ? aimPoint(E, a.endBinding.focus) : abs[1];
    if (!isInsideShape(S, from)) out[0] = boundEndpoint(S, a.startBinding, from);
  }
  if (E && a.endBinding) {
    const from = n === 2 && S && a.startBinding ? aimPoint(S, a.startBinding.focus) : abs[n - 2];
    if (!isInsideShape(E, from)) out[n - 1] = boundEndpoint(E, a.endBinding, from);
  }
  return out;
}

/** The route of an elbow arrow: orthogonal segments leaving and entering the attached shapes from their sides. */
function elbowPoints(a: LinearElement, S: SketchElement | undefined, E: SketchElement | undefined, abs: Point[]): Point[] {
  const startFree = abs[0];
  const endFree = abs[abs.length - 1];
  const sc = S ? shapeCenter(S) : startFree;
  const ec = E ? shapeCenter(E) : endFree;
  const outS = dominantAxis([ec[0] - sc[0], ec[1] - sc[1]]);
  const outE = dominantAxis([sc[0] - ec[0], sc[1] - ec[1]]);
  const start = S && a.startBinding ? elbowEndpoint(S, a.startBinding, outS) : startFree;
  const end = E && a.endBinding ? elbowEndpoint(E, a.endBinding, outE) : endFree;
  const obstacles: Bounds[] = [];
  if (S && a.startBinding) obstacles.push(getElementBounds(S));
  if (E && a.endBinding) obstacles.push(getElementBounds(E));
  return routeElbow(start, outS, end, outE, obstacles);
}

/**
 * Scene normalizer for arrows: drops attachments to shapes that are gone, moves attached ends (and re-routes
 * elbow arrows) when a shape moves, and keeps each shape's list of attached arrows in step with the arrows.
 */
export function syncArrowBindings(scene: Scene): void {
  const all = scene.all();
  const relevant =
    all.some((e) => !e.isDeleted && e.type === "arrow" && (e.startBinding || e.endBinding || e.arrowType === "elbow")) ||
    all.some((e) => e.boundElements?.some((b) => b.type === "arrow"));
  if (!relevant) return;

  for (const snap of all) {
    if (snap.type !== "arrow" || snap.isDeleted) continue;
    let a = scene.get(snap.id) as LinearElement;

    // 1. Attachments to shapes that no longer exist.
    const cleared: Partial<LinearElement> = {};
    for (const side of ["startBinding", "endBinding"] as const) {
      const b = a[side];
      if (b && !isBindable(scene.get(b.elementId) ?? undefined)) cleared[side] = null;
      else if (b && scene.get(b.elementId)!.isDeleted) cleared[side] = null;
    }
    if (Object.keys(cleared).length > 0) a = scene.update(a.id, cleared) as LinearElement;

    // 2. Positions.
    const S = a.startBinding ? scene.get(a.startBinding.elementId) : undefined;
    const E = a.endBinding ? scene.get(a.endBinding.elementId) : undefined;
    const elbow = a.arrowType === "elbow";
    if (!S && !E && !elbow) continue;
    const abs = absPoints(a);
    const next = elbow ? elbowPoints(a, S, E, abs) : attachedPoints(a, S, E, abs);
    if (!samePoints(abs, next) || (elbow && a.angle !== 0)) {
      scene.update(a.id, { ...linearPatchFromAbs(next), ...(elbow ? { angle: 0 } : {}) });
    }
  }

  // 3. Each shape lists the arrows attached to it.
  const attached = new Map<string, Set<string>>();
  for (const e of scene.all()) {
    if (e.type !== "arrow" || e.isDeleted) continue;
    for (const b of [e.startBinding, e.endBinding]) {
      if (!b) continue;
      if (!attached.has(b.elementId)) attached.set(b.elementId, new Set());
      attached.get(b.elementId)!.add(e.id);
    }
  }
  for (const shape of scene.all()) {
    if (shape.isDeleted || !isBindable(shape)) continue;
    const current = (shape.boundElements ?? []).filter((b) => b.type === "arrow").map((b) => b.id);
    const wanted = attached.get(shape.id) ?? new Set<string>();
    if (current.length === wanted.size && current.every((id) => wanted.has(id))) continue;
    const links = [...(shape.boundElements ?? []).filter((b) => b.type !== "arrow"), ...[...wanted].map((id) => ({ id, type: "arrow" as const }))];
    scene.update(shape.id, { boundElements: links.length > 0 ? links : null });
  }
}
