import { describe, expect, it } from "vitest";
import { bowPoint, curveSegments, pointAtHalfLength, sampleCurve } from "../geometry/curve";
import { hitElement, isInsideShape, topElementAt } from "../geometry/hit";
import { insertPointPatch, linearHandles, movePointsPatch, removePointsPatch } from "../geometry/linearEdit";
import { distance } from "../geometry/math";
import { layoutText, wrapParagraph } from "../geometry/text";
import { ARROWHEAD_KINDS, arrowheadPrimitives } from "../render/arrowheads";
import { alignPatches, distributePatches } from "./align";
import { DEFAULT_STYLE } from "./constants";
import { newLinear, newShape, newText } from "./factory";
import { flipPatches } from "./flip";
import { canGroup, canUngroup, groupPatches, ungroupPatches } from "./groups";
import { linearPatch } from "./linear";
import { groupAwareBoxSelection, resolveSelection, withBoundTexts } from "./selection";
import type { LinearElement, ShapeElement, SketchElement, TextElement } from "./types";
import { reorderZ } from "./zindex";

const rect = (id: string, x: number, y: number, w = 50, h = 50, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  ...newShape("rectangle", x, y, DEFAULT_STYLE),
  id,
  width: w,
  height: h,
  ...extra,
});

const apply = (els: SketchElement[], patches: Array<[string, Partial<SketchElement>]>) =>
  els.map((e) => {
    const p = patches.filter(([id]) => id === e.id).at(-1)?.[1];
    return p ? ({ ...e, ...p } as SketchElement) : e;
  });

const byId = (els: SketchElement[], id: string) => els.find((e) => e.id === id)!;

describe("groups", () => {
  it("wraps every selected element in a new outermost group", () => {
    const a = rect("a", 0, 0, 10, 10, { groupIds: ["inner"] });
    const b = rect("b", 20, 0);
    const out = apply([a, b], groupPatches([a, b], "g"));
    expect(byId(out, "a").groupIds).toEqual(["inner", "g"]);
    expect(byId(out, "b").groupIds).toEqual(["g"]);
  });

  it("only groups two or more elements that are not already one group", () => {
    const a = rect("a", 0, 0, 10, 10, { groupIds: ["g"] });
    const b = rect("b", 20, 0, 10, 10, { groupIds: ["g"] });
    expect(canGroup([a])).toBe(false);
    expect(canGroup([a, b])).toBe(false);
    expect(canGroup([a, rect("c", 40, 0)])).toBe(true);
    expect(canUngroup([a])).toBe(true);
    expect(canUngroup([rect("c", 0, 0)])).toBe(false);
  });

  it("ungroups the outermost group and keeps inner ones", () => {
    const a = rect("a", 0, 0, 10, 10, { groupIds: ["inner", "outer"] });
    const b = rect("b", 20, 0, 10, 10, { groupIds: ["outer"] });
    const out = apply([a, b], ungroupPatches([a], [a, b]));
    expect(byId(out, "a").groupIds).toEqual(["inner"]);
    expect(byId(out, "b").groupIds).toEqual([]);
  });

  it("selecting one member selects the whole group, unless picking deep", () => {
    const a = rect("a", 0, 0, 10, 10, { groupIds: ["g"] });
    const b = rect("b", 20, 0, 10, 10, { groupIds: ["g"] });
    const c = rect("c", 40, 0);
    expect(resolveSelection([a, b, c], ["a"], { groups: true })).toEqual(["a", "b"]);
    expect(resolveSelection([a, b, c], ["a"], { groups: false })).toEqual(["a"]);
  });

  it("a label stands for its container in a selection", () => {
    const box = rect("box", 0, 0, 100, 50, { boundElements: [{ id: "label", type: "text" }] });
    const label: TextElement = { ...newText(10, 10, DEFAULT_STYLE, "hi"), id: "label", containerId: "box" };
    expect(resolveSelection([box, label], ["label"], { groups: true })).toEqual(["box"]);
    expect(withBoundTexts([box, label], [box]).map((e) => e.id)).toEqual(["box", "label"]);
  });

  it("box selection takes a group only when all of its members are inside", () => {
    const a = rect("a", 0, 0, 10, 10, { groupIds: ["g"] });
    const b = rect("b", 20, 0, 10, 10, { groupIds: ["g"] });
    const c = rect("c", 40, 0);
    expect(groupAwareBoxSelection([a, b, c], new Set(["a", "c"]))).toEqual(["c"]);
    expect(groupAwareBoxSelection([a, b, c], new Set(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });
});

describe("z-order", () => {
  const A = rect("A", 0, 0);
  const B = rect("B", 200, 200);
  const C = rect("C", 10, 10);

  it("moves to the front and back keeping the selection's own order", () => {
    expect(reorderZ([A, B, C], new Set(["A", "B"]), "front")).toEqual(["C", "A", "B"]);
    expect(reorderZ([A, B, C], new Set(["B", "C"]), "back")).toEqual(["B", "C", "A"]);
  });

  it("forward hops over the next overlapping element, skipping unrelated ones", () => {
    expect(reorderZ([A, B, C], new Set(["A"]), "forward")).toEqual(["B", "C", "A"]);
  });

  it("backward hops under the nearest overlapping element", () => {
    expect(reorderZ([A, B, C], new Set(["C"]), "backward")).toEqual(["C", "A", "B"]);
  });

  it("does nothing when nothing overlaps", () => {
    expect(reorderZ([A, B], new Set(["A"]), "forward")).toEqual(["A", "B"]);
  });

  it("ignores deleted elements when hopping", () => {
    const gone = { ...C, isDeleted: true };
    expect(reorderZ([A, gone], new Set(["A"]), "forward")).toEqual(["A", "C"]);
  });
});

describe("align and distribute", () => {
  const a = rect("a", 0, 0);
  const b = rect("b", 100, 40);
  const c = rect("c", 300, 80);

  it("aligns edges and centres to the common bounds", () => {
    expect(byId(apply([a, b, c], alignPatches([a, b, c], "left")), "c").x).toBe(0);
    expect(byId(apply([a, b, c], alignPatches([a, b, c], "right")), "a").x).toBe(300);
    expect(byId(apply([a, b, c], alignPatches([a, b, c], "top")), "c").y).toBe(0);
    expect(byId(apply([a, b, c], alignPatches([a, b, c], "bottom")), "a").y).toBe(80);
    // Common bounds are 0..350 wide, so the centre is 175 and a 50-wide element starts at 150.
    expect(byId(apply([a, b, c], alignPatches([a, b, c], "centerH")), "a").x).toBe(150);
    expect(byId(apply([a, b, c], alignPatches([a, b, c], "centerV")), "a").y).toBe(40);
  });

  it("needs at least two units", () => {
    expect(alignPatches([a], "left")).toEqual([]);
    const g1 = rect("g1", 0, 0, 10, 10, { groupIds: ["g"] });
    const g2 = rect("g2", 50, 0, 10, 10, { groupIds: ["g"] });
    expect(alignPatches([g1, g2], "left")).toEqual([]); // one group is one unit
  });

  it("moves a group as one unit", () => {
    const g1 = rect("g1", 100, 0, 20, 20, { groupIds: ["g"] });
    const g2 = rect("g2", 140, 30, 20, 20, { groupIds: ["g"] });
    const loose = rect("loose", 0, 0, 20, 20);
    const out = apply([g1, g2, loose], alignPatches([g1, g2, loose], "left"));
    expect(byId(out, "g1").x).toBe(0);
    expect(byId(out, "g2").x).toBe(40); // keeps its offset inside the group
  });

  it("distributes with equal gaps and fixed ends", () => {
    const x1 = rect("x1", 0, 0);
    const x2 = rect("x2", 20, 0);
    const x3 = rect("x3", 200, 0);
    const out = apply([x1, x2, x3], distributePatches([x1, x2, x3], "h"));
    expect(byId(out, "x1").x).toBe(0);
    expect(byId(out, "x2").x).toBe(100);
    expect(byId(out, "x3").x).toBe(200);
    expect(distributePatches([x1, x2], "h")).toEqual([]);
  });
});

describe("flip", () => {
  it("mirrors positions across the group centre", () => {
    const a = rect("a", 0, 0, 100, 50);
    const b = rect("b", 200, 0, 100, 50);
    const out = apply([a, b], flipPatches([a, b], "h"));
    expect(byId(out, "a").x).toBe(200);
    expect(byId(out, "b").x).toBe(0);
  });

  it("reverses the direction of a rotation", () => {
    const a = rect("a", 0, 0, 100, 50, { angle: 0.3 });
    const out = apply([a], flipPatches([a], "h"));
    expect(byId(out, "a").angle).toBeCloseTo(Math.PI * 2 - 0.3, 9);
    // A single element mirrored about its own centre stays where it is.
    expect(byId(out, "a").x).toBeCloseTo(0, 9);
  });

  it("flips vertically", () => {
    const a = rect("a", 0, 0, 50, 50);
    const b = rect("b", 0, 100, 50, 50);
    const out = apply([a, b], flipPatches([a, b], "v"));
    expect(byId(out, "a").y).toBe(100);
    expect(byId(out, "b").y).toBe(0);
  });

  it("is its own inverse", () => {
    const line: LinearElement = {
      ...newLinear("arrow", 10, 20, DEFAULT_STYLE),
      ...linearPatch([
        [0, 0],
        [60, 30],
        [90, -10],
      ]),
    };
    const r = rect("r", 200, 100, 40, 80, { angle: 0.7 });
    for (const axis of ["h", "v"] as const) {
      const once = apply([line, r], flipPatches([line, r], axis));
      const twice = apply(once, flipPatches(once, axis));
      const l2 = byId(twice, line.id) as LinearElement;
      line.points.forEach((p, i) => {
        expect(l2.points[i][0]).toBeCloseTo(p[0], 6);
        expect(l2.points[i][1]).toBeCloseTo(p[1], 6);
      });
      expect(l2.x).toBeCloseTo(line.x, 6);
      expect(byId(twice, "r").x).toBeCloseTo(200, 6);
      expect(byId(twice, "r").angle).toBeCloseTo(0.7, 6);
    }
  });

  it("mirrors the points of a line", () => {
    const l: LinearElement = {
      ...newLinear("line", 0, 0, DEFAULT_STYLE),
      ...linearPatch([
        [0, 0],
        [100, 40],
      ]),
    };
    const out = byId(apply([l], flipPatches([l], "h")), l.id) as LinearElement;
    // Mirrored in place: now it starts at the right end and goes down-left.
    expect(out.x).toBe(100);
    expect(out.points).toEqual([
      [0, 0],
      [-100, 40],
    ]);
  });
});

describe("curves", () => {
  it("passes through every control point", () => {
    const pts = [
      [0, 0],
      [50, 40],
      [100, 0],
    ] as const;
    const s = sampleCurve(pts);
    expect(s[0]).toEqual([0, 0]);
    expect(distance(s[s.length - 1], [100, 0])).toBeLessThan(1e-9);
    expect(s.some((p) => distance(p, [50, 40]) < 1e-9)).toBe(true);
    expect(curveSegments(pts)).toHaveLength(2);
  });

  it("leaves two points straight", () => {
    expect(sampleCurve([[0, 0], [10, 10]])).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });

  it("finds the middle of a path and bows a segment sideways", () => {
    expect(pointAtHalfLength([[0, 0], [10, 0]])).toEqual([5, 0]);
    expect(pointAtHalfLength([[0, 0], [10, 0], [10, 10]])).toEqual([10, 0]);
    expect(bowPoint([0, 0], [10, 0], 0.2)).toEqual([5, 2]);
  });

  it("makes hit tests follow a curved line", () => {
    const l: LinearElement = {
      ...newLinear("line", 0, 0, { ...DEFAULT_STYLE, lineCurved: true }),
      ...linearPatch([
        [0, 0],
        [100, 80],
        [200, 0],
      ]),
    };
    expect(l.arrowType).toBe("round");
    expect(hitElement(l, [100, 80], 4)).toBe(true);
    // The straight chord between the end points is far from the curve.
    expect(hitElement(l, [100, 0], 4)).toBe(false);
  });
});

describe("polygon lines", () => {
  const tri: LinearElement = {
    ...newLinear("line", 0, 0, { ...DEFAULT_STYLE, backgroundColor: "#f00" }),
    ...linearPatch([
      [0, 0],
      [100, 0],
      [50, 100],
      [0, 0],
    ]),
    polygon: true,
  };

  it("hits the inside of a filled polygon", () => {
    expect(hitElement(tri, [50, 30], 3)).toBe(true);
    expect(hitElement(tri, [5, 90], 3)).toBe(false);
    expect(hitElement({ ...tri, backgroundColor: "transparent" }, [50, 30], 3)).toBe(false);
  });

  it("moves the first and closing point together and refuses to drop below a triangle", () => {
    const moved = movePointsPatch(tri, [0], 10, 10);
    expect(moved.points[moved.points.length - 1]).toEqual(moved.points[0]);
    expect(removePointsPatch(tri, [1])).toBeNull();
    const square: LinearElement = {
      ...tri,
      ...linearPatch([
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ]),
    };
    const smaller = removePointsPatch(square, [3])!;
    expect(smaller.points).toHaveLength(4); // triangle + closing point
    expect(smaller.points[3]).toEqual(smaller.points[0]);
  });
});

describe("point editing helpers", () => {
  const line: LinearElement = {
    ...newLinear("line", 10, 10, DEFAULT_STYLE),
    ...linearPatch([
      [0, 0],
      [100, 0],
      [100, 100],
    ]),
  };

  it("lists vertices and the midpoints between them", () => {
    const h = linearHandles(line);
    expect(h.points).toEqual([
      [10, 10],
      [110, 10],
      [110, 110],
    ]);
    expect(h.mids).toEqual([
      [60, 10],
      [110, 60],
    ]);
  });

  it("moves a vertex, including the first one (which becomes the new origin)", () => {
    const p = movePointsPatch(line, [0], 5, 5);
    expect(p.x).toBe(15);
    expect(p.y).toBe(15);
    expect(p.points[0]).toEqual([0, 0]);
    expect(p.points[1]).toEqual([95, -5]);
  });

  it("inserts a vertex after an index and removes vertices", () => {
    const ins = insertPointPatch(line, 0, [60, 30]);
    expect(ins.points).toHaveLength(4);
    expect(ins.points[1]).toEqual([50, 20]);
    expect(removePointsPatch(line, [1])!.points).toHaveLength(2);
    expect(removePointsPatch({ ...line, ...linearPatch([[0, 0], [5, 5]]) }, [0])).toBeNull();
  });
});

describe("text wrapping", () => {
  // Without a canvas the width is estimated as 0.55 * fontSize per character: 5.5px per character at size 10.
  it("wraps at word boundaries", () => {
    expect(wrapParagraph("aaa bbb ccc", 40, 10, "hand")).toEqual(["aaa bbb", "ccc"]);
    expect(wrapParagraph("", 40, 10, "hand")).toEqual([""]);
  });

  it("breaks a word that is wider than the line", () => {
    expect(wrapParagraph("abcdefghij", 20, 10, "hand")).toEqual(["abc", "def", "ghi", "j"]);
  });

  it("keeps explicit newlines and measures the widest line", () => {
    const m = layoutText("a\n\nbbbb", 10, "hand", 1.25, null);
    expect(m.lines).toEqual(["a", "", "bbbb"]);
    expect(m.width).toBe(Math.ceil(4 * 5.5));
    expect(m.height).toBe(Math.ceil(3 * 12.5));
  });

  it("wraps long text to a width", () => {
    const m = layoutText("one two three four five six", 10, "hand", 1.25, 60);
    expect(m.lines.length).toBeGreaterThan(2);
    expect(m.width).toBeLessThanOrEqual(60);
  });
});

describe("arrowheads", () => {
  it("every kind draws something", () => {
    for (const kind of ARROWHEAD_KINDS) {
      expect(arrowheadPrimitives(kind, [100, 0], [0, 0], 20).length).toBeGreaterThan(0);
    }
  });

  it("builds the expected symbols", () => {
    const lines = (k: (typeof ARROWHEAD_KINDS)[number]) => arrowheadPrimitives(k, [100, 0], [0, 0], 20).filter((p) => p.k === "line").length;
    expect(lines("arrow")).toBe(2);
    expect(lines("bar")).toBe(1);
    expect(lines("crowfoot_many")).toBe(3);
    expect(lines("crowfoot_one_or_many")).toBe(4);
    expect(lines("cardinality_exactly_one")).toBe(2);
    const outline = arrowheadPrimitives("circle_outline", [100, 0], [0, 0], 20)[0];
    const filled = arrowheadPrimitives("circle", [100, 0], [0, 0], 20)[0];
    expect(outline).toMatchObject({ k: "circle", filled: false });
    expect(filled).toMatchObject({ k: "circle", filled: true });
  });

  it("puts the tip at the end and points back along the line", () => {
    const tri = arrowheadPrimitives("triangle", [100, 0], [0, 0], 20)[0];
    expect(tri.k).toBe("poly");
    if (tri.k === "poly") {
      expect(tri.pts[0]).toEqual([100, 0]);
      expect(tri.pts[1][0]).toBeCloseTo(80, 9); // behind the tip
    }
  });
});

describe("hit testing shapes by their inside", () => {
  it("finds an unfilled shape when the point is inside", () => {
    const r = rect("r", 0, 0, 100, 100);
    expect(isInsideShape(r, [50, 50])).toBe(true);
    expect(isInsideShape(r, [150, 50])).toBe(false);
    const e = { ...newShape("ellipse", 0, 0, DEFAULT_STYLE), width: 100, height: 100 };
    expect(isInsideShape(e, [50, 50])).toBe(true);
    expect(isInsideShape(e, [3, 3])).toBe(false);
  });

  it("hitting a label hits its container, and a locked container hits nothing", () => {
    const box = rect("box", 0, 0, 100, 50, { backgroundColor: "#fff" });
    const label: TextElement = { ...newText(30, 15, DEFAULT_STYLE, "hello"), id: "label", containerId: "box" };
    expect(topElementAt([box, label], [40, 25], 3)?.id).toBe("box");
    expect(topElementAt([{ ...box, locked: true }, { ...label, locked: true }], [40, 25], 3)).toBeNull();
  });
});
