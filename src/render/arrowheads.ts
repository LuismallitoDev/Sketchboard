import type { Point } from "../geometry/math";
import type { Arrowhead } from "../scene/types";

export type Prim =
  | { k: "line"; a: Point; b: Point }
  | { k: "poly"; pts: Point[]; filled: boolean }
  | { k: "circle"; c: Point; r: number; filled: boolean };

/** In the order they are offered in the picker. */
export const ARROWHEAD_KINDS: readonly Arrowhead[] = [
  "arrow",
  "bar",
  "circle",
  "circle_outline",
  "triangle",
  "triangle_outline",
  "diamond",
  "diamond_outline",
  "crowfoot_many",
  "crowfoot_one",
  "crowfoot_one_or_many",
  "cardinality_exactly_one",
  "cardinality_zero_or_one",
  "cardinality_zero_or_many",
];

export const ARROWHEAD_LABELS: Record<Arrowhead, string> = {
  arrow: "Arrow",
  bar: "Bar",
  circle: "Circle",
  circle_outline: "Circle (outline)",
  triangle: "Triangle",
  triangle_outline: "Triangle (outline)",
  diamond: "Diamond",
  diamond_outline: "Diamond (outline)",
  crowfoot_many: "Crow's foot (many)",
  crowfoot_one: "Crow's foot (one)",
  crowfoot_one_or_many: "Crow's foot (one or many)",
  cardinality_exactly_one: "Cardinality (exactly one)",
  cardinality_zero_or_one: "Cardinality (zero or one)",
  cardinality_zero_or_many: "Cardinality (zero or many)",
};

/**
 * The strokes and fills that make up an arrowhead of size `size`, with its tip at `tip` and the line arriving
 * from `from`. Everything is described relative to the line so the same geometry serves any direction.
 */
export function arrowheadPrimitives(kind: Arrowhead, tip: Point, from: Point, size: number): Prim[] {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const d: Point = [dx / len, dy / len];
  const n: Point = [-d[1], d[0]];
  /** A point `back` along the line behind the tip and `side` to the left. */
  const at = (back: number, side: number): Point => [tip[0] - d[0] * back + n[0] * side, tip[1] - d[1] * back + n[1] * side];
  const s = size;
  const bar = (back: number, half = s * 0.4): Prim => ({ k: "line", a: at(back, half), b: at(back, -half) });
  const foot = (): Prim[] => [
    { k: "line", a: at(s * 0.9, 0), b: at(0, s * 0.4) },
    { k: "line", a: at(s * 0.9, 0), b: at(0, 0) },
    { k: "line", a: at(s * 0.9, 0), b: at(0, -s * 0.4) },
  ];
  const ring = (back: number, r = s * 0.25): Prim => ({ k: "circle", c: at(back, 0), r, filled: false });

  switch (kind) {
    case "arrow": {
      const spread = (22 * Math.PI) / 180;
      return [
        { k: "line", a: tip, b: at(s * Math.cos(spread), s * Math.sin(spread)) },
        { k: "line", a: tip, b: at(s * Math.cos(spread), -s * Math.sin(spread)) },
      ];
    }
    case "bar":
      return [bar(0)];
    case "circle":
    case "circle_outline":
      return [{ k: "circle", c: at(s * 0.3, 0), r: s * 0.3, filled: kind === "circle" }];
    case "triangle":
    case "triangle_outline":
      return [{ k: "poly", pts: [at(0, 0), at(s, s * 0.38), at(s, -s * 0.38)], filled: kind === "triangle" }];
    case "diamond":
    case "diamond_outline":
      return [{ k: "poly", pts: [at(0, 0), at(s * 0.5, s * 0.3), at(s, 0), at(s * 0.5, -s * 0.3)], filled: kind === "diamond" }];
    case "crowfoot_many":
      return foot();
    case "crowfoot_one":
      return [bar(s * 0.35)];
    case "crowfoot_one_or_many":
      return [...foot(), bar(s * 1.05)];
    case "cardinality_exactly_one":
      return [bar(s * 0.25), bar(s * 0.55)];
    case "cardinality_zero_or_one":
      return [bar(s * 0.3), ring(s * 0.65)];
    case "cardinality_zero_or_many":
      return [...foot(), ring(s * 1.2)];
  }
}

/** Reach of an arrowhead behind its tip, as a multiple of its size (used to size render padding). */
export const ARROWHEAD_REACH = 1.5;
