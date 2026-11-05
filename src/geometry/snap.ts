import type { Bounds } from "./bounds";
import type { Point } from "./math";

/** What the user sees while snapping: an alignment line, or a marker for an equal gap. */
export type Guide = { kind: "line"; a: Point; b: Point } | { kind: "gap"; a: Point; b: Point };

export const SNAP_DISTANCE = 8; // screen px
export const GRID_SIZE = 20; // scene units

export const snapToGrid = (v: number, size = GRID_SIZE): number => Math.round(v / size) * size;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const toRect = (b: Bounds): Rect => ({ x1: b[0], y1: b[1], x2: b[2], y2: b[3] });
const transpose = (r: Rect): Rect => ({ x1: r.y1, y1: r.x1, x2: r.y2, y2: r.x2 });
const transposeGuide = (g: Guide): Guide => ({ kind: g.kind, a: [g.a[1], g.a[0]], b: [g.b[1], g.b[0]] });
const keyLines = (r: Rect): [number, number, number] => [r.x1, (r.x1 + r.x2) / 2, r.x2];

interface AxisResult {
  delta: number;
  /** Gap markers for the final position (in this axis' own coordinates), if the snap was an equal-gap one. */
  gapGuides: (delta: number) => Guide[];
}

/** Best horizontal shift (within `th`) that lines `m` up with a target edge/centre or evens out the gaps in its row. */
function snapAxis(m: Rect, ts: readonly Rect[], th: number): AxisResult {
  let best: { delta: number; gap: ((d: number) => Guide[]) | null } | null = null;
  const consider = (delta: number, gap: ((d: number) => Guide[]) | null) => {
    if (Math.abs(delta) > th) return;
    if (!best || Math.abs(delta) < Math.abs(best.delta) - 1e-9) best = { delta, gap };
  };

  // 1. Edge and centre alignment.
  for (const t of ts) for (const tx of keyLines(t)) for (const mx of keyLines(m)) consider(tx - mx, null);

  // 2. Equal gaps, against the elements that share a row with `m`.
  const y = (m.y1 + m.y2) / 2;
  const gapSeg = (from: number, to: number): Guide => ({ kind: "gap", a: [from, y], b: [to, y] });
  const row = ts.filter((t) => t.y2 >= m.y1 && t.y1 <= m.y2).sort((a, b) => a.x1 - b.x1);
  const left = [...row].filter((t) => t.x2 <= m.x1 + 1e-9).sort((a, b) => b.x2 - a.x2)[0];
  const right = row.find((t) => t.x1 >= m.x2 - 1e-9);
  if (left && right) {
    const gl = m.x1 - left.x2;
    const gr = right.x1 - m.x2;
    consider((gr - gl) / 2, (d) => [gapSeg(left.x2, m.x1 + d), gapSeg(m.x2 + d, right.x1)]);
  }
  for (let k = 0; k < row.length - 1; k++) {
    const A = row[k];
    const B = row[k + 1];
    if (A.x2 > B.x1) continue;
    const g = B.x1 - A.x2;
    // Continue the rhythm to the right of the pair, or to its left.
    if (m.x1 >= B.x2 - 1e-9) consider(B.x2 + g - m.x1, (d) => [gapSeg(A.x2, B.x1), gapSeg(B.x2, m.x1 + d)]);
    if (m.x2 <= A.x1 + 1e-9) consider(A.x1 - g - m.x2, (d) => [gapSeg(m.x2 + d, A.x1), gapSeg(A.x2, B.x1)]);
  }

  const found = best as { delta: number; gap: ((d: number) => Guide[]) | null } | null;
  if (!found) return { delta: 0, gapGuides: () => [] };
  const gap = found.gap;
  return { delta: found.delta, gapGuides: gap ?? (() => []) };
}

/** Alignment lines where the (already moved) rectangle shares an edge or centre with a target. */
function alignmentGuides(r: Rect, ts: readonly Rect[]): Guide[] {
  const guides: Guide[] = [];
  const add = (g: Guide) => {
    if (!guides.some((o) => o.kind === g.kind && o.a[0] === g.a[0] && o.b[0] === g.b[0] && o.a[1] === g.a[1] && o.b[1] === g.b[1])) guides.push(g);
  };
  for (const t of ts) {
    for (const tx of keyLines(t)) {
      if (keyLines(r).some((mx) => Math.abs(mx - tx) < 0.5)) {
        add({ kind: "line", a: [tx, Math.min(r.y1, t.y1)], b: [tx, Math.max(r.y2, t.y2)] });
      }
    }
    for (const ty of keyLines(transpose(t))) {
      if (keyLines(transpose(r)).some((my) => Math.abs(my - ty) < 0.5)) {
        add({ kind: "line", a: [Math.min(r.x1, t.x1), ty], b: [Math.max(r.x2, t.x2), ty] });
      }
    }
  }
  return guides;
}

/**
 * Snaps a moving rectangle to the other elements: edges and centres line up, and gaps between neighbours become
 * equal. Returns the shift to apply and the guides to draw for the snapped position.
 */
export function snapBoundsToTargets(moving: Bounds, targets: readonly Bounds[], th: number): { dx: number; dy: number; guides: Guide[] } {
  const m = toRect(moving);
  const ts = targets.map(toRect);
  const rx = snapAxis(m, ts, th);
  const ry = snapAxis(transpose(m), ts.map(transpose), th);
  const fin: Rect = { x1: m.x1 + rx.delta, x2: m.x2 + rx.delta, y1: m.y1 + ry.delta, y2: m.y2 + ry.delta };
  const guides = [...alignmentGuides(fin, ts), ...rx.gapGuides(rx.delta), ...ry.gapGuides(ry.delta).map(transposeGuide)];
  return { dx: rx.delta, dy: ry.delta, guides };
}

/** Snaps a single point (a corner being dragged, the start of a new shape) to the edges and centres of the targets. */
export function snapPointToTargets(p: Point, targets: readonly Bounds[], th: number): { point: Point; guides: Guide[] } {
  const pick = (v: number, lines: number[]) => {
    let best: number | null = null;
    for (const l of lines) if (Math.abs(l - v) <= th && (best === null || Math.abs(l - v) < Math.abs(best - v))) best = l;
    return best;
  };
  const ts = targets.map(toRect);
  const x = pick(p[0], ts.flatMap(keyLines));
  const y = pick(p[1], ts.map(transpose).flatMap(keyLines));
  const point: Point = [x ?? p[0], y ?? p[1]];
  const dot: Rect = { x1: point[0], x2: point[0], y1: point[1], y2: point[1] };
  const guides = alignmentGuides(dot, ts).filter((g) => (g.a[0] === g.b[0] ? x !== null : y !== null));
  return { point, guides };
}
