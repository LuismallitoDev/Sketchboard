import type { Bounds } from "./bounds";
import type { Point } from "./math";

type Axis = readonly [number, number];
const DIRS: readonly Axis[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BEND_COST = 24;
const SAME = 0.01;

/** The axis-aligned unit vector (right, left, down, up) closest to the direction of `v`. */
export function dominantAxis(v: Point): Axis {
  if (Math.abs(v[0]) >= Math.abs(v[1])) return [v[0] < 0 ? -1 : 1, 0];
  return [0, v[1] < 0 ? -1 : 1];
}

const dirIndex = (d: Axis) => DIRS.findIndex((x) => x[0] === d[0] && x[1] === d[1]);
const expand = (b: Bounds, m: number): Bounds => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];

class MinHeap {
  private items: Array<[number, number]> = [];
  get size() {
    return this.items.length;
  }
  push(priority: number, value: number) {
    const a = this.items;
    a.push([priority, value]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Sorted unique values plus the midpoint between each neighbouring pair (extra room to route through). */
function withMidpoints(values: Iterable<number>): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const out = new Set(sorted);
  for (let i = 0; i < sorted.length - 1; i++) out.add((sorted[i] + sorted[i + 1]) / 2);
  return [...out].sort((a, b) => a - b);
}

function insideAny(p: Point, obs: readonly Bounds[]): boolean {
  return obs.some((o) => p[0] > o[0] && p[0] < o[2] && p[1] > o[1] && p[1] < o[3]);
}

/** Does the axis-aligned segment p-q pass through the inside of an obstacle? */
function blocked(p: Point, q: Point, obs: readonly Bounds[]): boolean {
  for (const o of obs) {
    if (p[1] === q[1]) {
      if (p[1] > o[1] && p[1] < o[3] && Math.max(Math.min(p[0], q[0]), o[0]) < Math.min(Math.max(p[0], q[0]), o[2])) return true;
    } else if (p[0] > o[0] && p[0] < o[2] && Math.max(Math.min(p[1], q[1]), o[1]) < Math.min(Math.max(p[1], q[1]), o[3])) {
      return true;
    }
  }
  return false;
}

/**
 * A* over a sparse grid: the grid lines are the obstacle edges and the two endpoints (plus midpoints between them),
 * so the search space stays tiny. Costs are distance plus a penalty for every bend. Returns the nodes from `from`
 * to `to`, or null when there is no route.
 */
function search(from: Point, outFrom: Axis, to: Point, outTo: Axis, obs: readonly Bounds[]): Point[] | null {
  const xs = [from[0], to[0]];
  const ys = [from[1], to[1]];
  for (const o of obs) {
    xs.push(o[0], o[2]);
    ys.push(o[1], o[3]);
  }
  const X = withMidpoints(xs);
  const Y = withMidpoints(ys);
  const xIndex = new Map(X.map((v, i) => [v, i]));
  const yIndex = new Map(Y.map((v, i) => [v, i]));
  const H = Y.length;
  const key = (i: number, j: number, d: number) => (i * H + j) * 4 + d;
  const g = new Float64Array(X.length * H * 4).fill(Infinity);
  const prev = new Int32Array(X.length * H * 4).fill(-1);
  const closed = new Uint8Array(X.length * H * 4);

  const si = xIndex.get(from[0])!;
  const sj = yIndex.get(from[1])!;
  const gi = xIndex.get(to[0])!;
  const gj = yIndex.get(to[1])!;
  const goalDir = dirIndex([-outTo[0], -outTo[1]]); // the last move into `to` runs against its outward direction
  const startDir = dirIndex(outFrom);
  const manhattan = (i: number, j: number) => Math.abs(X[i] - to[0]) + Math.abs(Y[j] - to[1]);
  // Routes of equal length are common (a bend anywhere along the way); prefer bends near the middle of the two ends.
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2;
  const heuristic = (i: number, j: number, d: number) => (i === gi && j === gj ? (d === goalDir ? 0 : BEND_COST) : manhattan(i, j));

  const heap = new MinHeap();
  g[key(si, sj, startDir)] = 0;
  heap.push(heuristic(si, sj, startDir), key(si, sj, startDir));

  while (heap.size > 0) {
    const [, k] = heap.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    const d = k % 4;
    const cell = (k - d) / 4;
    const i = Math.floor(cell / H);
    const j = cell % H;
    if (i === gi && j === gj) {
      const out: Point[] = [];
      for (let cur = k; cur !== -1; cur = prev[cur]) {
        const cd = cur % 4;
        const cc = (cur - cd) / 4;
        out.push([X[Math.floor(cc / H)], Y[cc % H]]);
      }
      return out.reverse();
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d ^ 1)) continue; // DIRS pairs are (0,1) and (2,3): no U-turns
      const ni = i + DIRS[nd][0];
      const nj = j + DIRS[nd][1];
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= H) continue;
      const p: Point = [X[i], Y[j]];
      const q: Point = [X[ni], Y[nj]];
      if (insideAny(q, obs) || blocked(p, q, obs)) continue;
      const nk = key(ni, nj, nd);
      if (closed[nk]) continue;
      const bend = nd !== d ? BEND_COST + 0.01 * (Math.abs(p[0] - midX) + Math.abs(p[1] - midY)) : 0;
      const cost = g[k] + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + bend;
      if (cost < g[nk]) {
        g[nk] = cost;
        prev[nk] = k;
        heap.push(cost + heuristic(ni, nj, nd), nk);
      }
    }
  }
  return null;
}

/** When the search fails (endpoints boxed in): a plain Z-shaped route. */
function fallback(a: Point, outFrom: Axis, b: Point): Point[] {
  if (outFrom[0] !== 0) {
    const mx = (a[0] + b[0]) / 2;
    return [a, [mx, a[1]], [mx, b[1]], b];
  }
  const my = (a[1] + b[1]) / 2;
  return [a, [a[0], my], [b[0], my], b];
}

/** Drops repeated points and points in the middle of a straight run. */
export function simplifyPath(pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > SAME || Math.abs(last[1] - p[1]) > SAME) out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-6) out.splice(i, 1);
  }
  return out;
}

/**
 * An orthogonal route from `start` to `end`. The path leaves `start` in direction `startOut` and arrives at `end`
 * travelling against `endOut` (the direction `end` faces). `obstacles` (the shapes the ends are attached to) are
 * avoided with `margin` to spare.
 */
export function routeElbow(
  start: Point,
  startOut: Axis,
  end: Point,
  endOut: Axis,
  obstacles: readonly Bounds[],
  margin = 12,
): Point[] {
  const dist = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const stub = Math.max(4, Math.min(margin + 1, dist / 3));
  const a: Point = [start[0] + startOut[0] * stub, start[1] + startOut[1] * stub];
  const b: Point = [end[0] + endOut[0] * stub, end[1] + endOut[1] * stub];
  const obs = obstacles.map((o) => expand(o, margin));
  let mid: Point[] | null = null;
  if (!insideAny(a, obs) && !insideAny(b, obs)) mid = search(a, startOut, b, endOut, obs);
  return simplifyPath([start, ...(mid ?? fallback(a, startOut, b)), end]);
}
