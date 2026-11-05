import { getCommonBounds, type Bounds } from "../geometry/bounds";
import type { ElementPatches } from "../geometry/transform";
import { outerGroupId } from "./selection";
import type { SketchElement } from "./types";

export type AlignKind = "left" | "right" | "top" | "bottom" | "centerH" | "centerV";

interface Unit {
  els: SketchElement[];
  bounds: Bounds;
}

/** A group moves as one unit; a loose element is a unit of its own. */
function buildUnits(els: readonly SketchElement[]): Unit[] {
  const map = new Map<string, SketchElement[]>();
  for (const el of els) {
    const key = outerGroupId(el) ?? el.id;
    map.set(key, [...(map.get(key) ?? []), el]);
  }
  return [...map.values()].map((members) => ({ els: members, bounds: getCommonBounds(members)! }));
}

const shift = (unit: Unit, dx: number, dy: number): ElementPatches =>
  unit.els.map((el) => [el.id, { x: el.x + dx, y: el.y + dy }]);

/** Aligns the units of the selection to the edge or centre of their common bounds. */
export function alignPatches(els: readonly SketchElement[], kind: AlignKind): ElementPatches {
  const units = buildUnits(els);
  if (units.length < 2) return [];
  const all = getCommonBounds(els)!;
  const out: ElementPatches = [];
  for (const u of units) {
    const [x1, y1, x2, y2] = u.bounds;
    let dx = 0;
    let dy = 0;
    if (kind === "left") dx = all[0] - x1;
    else if (kind === "right") dx = all[2] - x2;
    else if (kind === "centerH") dx = (all[0] + all[2]) / 2 - (x1 + x2) / 2;
    else if (kind === "top") dy = all[1] - y1;
    else if (kind === "bottom") dy = all[3] - y2;
    else dy = (all[1] + all[3]) / 2 - (y1 + y2) / 2;
    if (dx !== 0 || dy !== 0) out.push(...shift(u, dx, dy));
  }
  return out;
}

/** Evens out the gaps between three or more units, keeping the outermost two where they are. */
export function distributePatches(els: readonly SketchElement[], axis: "h" | "v"): ElementPatches {
  const units = buildUnits(els);
  if (units.length < 3) return [];
  const lo = axis === "h" ? 0 : 1;
  const hi = lo + 2;
  const sorted = [...units].sort((a, b) => a.bounds[lo] - b.bounds[lo]);
  const first = sorted[0].bounds[lo];
  const last = Math.max(...sorted.map((u) => u.bounds[hi]));
  const total = sorted.reduce((sum, u) => sum + (u.bounds[hi] - u.bounds[lo]), 0);
  const gap = (last - first - total) / (sorted.length - 1);
  const out: ElementPatches = [];
  let cursor = first;
  for (const u of sorted) {
    const d = cursor - u.bounds[lo];
    if (d !== 0) out.push(...shift(u, axis === "h" ? d : 0, axis === "v" ? d : 0));
    cursor += u.bounds[hi] - u.bounds[lo] + gap;
  }
  return out;
}
