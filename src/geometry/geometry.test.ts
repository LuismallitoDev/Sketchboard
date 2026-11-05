import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "../scene/constants";
import { newFreedraw, newLinear, newShape, newText } from "../scene/factory";
import { linearPatch } from "../scene/linear";
import type { LinearElement, ShapeElement, SketchElement } from "../scene/types";
import { boxCenter, getCommonBounds, getElementBounds, getLocalBox } from "./bounds";
import { hitElement, topElementAt } from "./hit";
import { rotatePoint, type Point } from "./math";
import { getSelectionFrame, resizeElementToBox, resizeSelection, rotateSelection } from "./transform";

const rect = (x: number, y: number, w: number, h: number, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  ...newShape("rectangle", x, y, DEFAULT_STYLE),
  width: w,
  height: h,
  ...extra,
});

const near = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

describe("bounds", () => {
  it("is the plain box when not rotated", () => {
    expect(getElementBounds(rect(10, 20, 100, 50))).toEqual([10, 20, 110, 70]);
  });

  it("swaps width and height for a 90 degree rotation about the centre", () => {
    const b = getElementBounds(rect(0, 0, 100, 50, { angle: Math.PI / 2 }));
    near(b[0], 25);
    near(b[1], -25);
    near(b[2], 75);
    near(b[3], 75);
  });

  it("uses the exact extent for a rotated ellipse", () => {
    const e = { ...newShape("ellipse", 0, 0, DEFAULT_STYLE), width: 100, height: 40, angle: Math.PI / 2 };
    const b = getElementBounds(e);
    near(b[2] - b[0], 40);
    near(b[3] - b[1], 100);
  });

  it("covers the points of a line, including negative coordinates", () => {
    const l = newLinear("line", 10, 10, DEFAULT_STYLE);
    const patch = linearPatch([
      [0, 0],
      [-20, 30],
    ]);
    const line: LinearElement = { ...l, ...patch };
    expect(getLocalBox(line)).toEqual({ x: -10, y: 10, width: 20, height: 30 });
    expect(getElementBounds(line)).toEqual([-10, 10, 10, 40]);
  });

  it("merges several elements", () => {
    expect(getCommonBounds([rect(0, 0, 10, 10), rect(50, 60, 10, 10)])).toEqual([0, 0, 60, 70]);
    expect(getCommonBounds([])).toBeNull();
  });
});

describe("hit testing", () => {
  it("only hits the outline of an unfilled rectangle", () => {
    const r = rect(0, 0, 100, 100);
    expect(hitElement(r, [50, 50], 4)).toBe(false);
    expect(hitElement(r, [0, 50], 4)).toBe(true);
    expect(hitElement(r, [101, 50], 4)).toBe(true);
    expect(hitElement(r, [120, 50], 4)).toBe(false);
  });

  it("hits the inside of a filled rectangle", () => {
    expect(hitElement(rect(0, 0, 100, 100, { backgroundColor: "#ff0000" }), [50, 50], 4)).toBe(true);
  });

  it("follows rotation", () => {
    // A tall thin filled rectangle rotated 90 degrees becomes wide.
    const r = rect(0, 0, 10, 200, { backgroundColor: "#f00", angle: Math.PI / 2 });
    expect(hitElement(r, [90, 100], 2)).toBe(true); // inside the rotated (wide) shape
    expect(hitElement(r, [5, 190], 2)).toBe(false); // inside the unrotated box only
  });

  it("handles ellipse and diamond", () => {
    const e = { ...newShape("ellipse", 0, 0, DEFAULT_STYLE), width: 100, height: 60 };
    expect(hitElement(e, [0, 30], 3)).toBe(true);
    expect(hitElement(e, [50, 30], 3)).toBe(false);
    expect(hitElement({ ...e, backgroundColor: "#00f" }, [50, 30], 3)).toBe(true);
    const d = { ...newShape("diamond", 0, 0, DEFAULT_STYLE), width: 100, height: 100, backgroundColor: "#00f" };
    expect(hitElement(d, [50, 50], 3)).toBe(true);
    expect(hitElement(d, [5, 5], 3)).toBe(false); // corner of the box, outside the diamond
  });

  it("hits lines near the segment", () => {
    const line: LinearElement = {
      ...newLinear("line", 0, 0, DEFAULT_STYLE),
      ...linearPatch([
        [0, 0],
        [100, 0],
      ]),
    };
    expect(hitElement(line, [50, 3], 4)).toBe(true);
    expect(hitElement(line, [50, 30], 4)).toBe(false);
  });

  it("returns the topmost element and skips locked or deleted ones", () => {
    const a = rect(0, 0, 100, 100, { backgroundColor: "#f00", id: "a" });
    const b = rect(0, 0, 100, 100, { backgroundColor: "#0f0", id: "b" });
    expect(topElementAt([a, b], [50, 50], 3)?.id).toBe("b");
    expect(topElementAt([a, { ...b, locked: true }], [50, 50], 3)?.id).toBe("a");
    expect(topElementAt([a, { ...b, isDeleted: true }], [50, 50], 3)?.id).toBe("a");
  });
});

describe("resize and rotate", () => {
  it("keeps the opposite corner fixed in the scene when resizing a rotated rectangle", () => {
    const angle = Math.PI / 6;
    const el = rect(100, 100, 100, 50, { angle });
    const frame = getSelectionFrame([el])!;
    const c = boxCenter(frame.box);
    const nwBefore = rotatePoint([100, 100], c, angle);

    // Drag the se handle 20 units further along the element's own x axis.
    const seBefore = rotatePoint([200, 150], c, angle);
    const pointer: Point = [seBefore[0] + 20 * Math.cos(angle), seBefore[1] + 20 * Math.sin(angle)];
    const [[, patch]] = resizeSelection([el], frame, "se", pointer, false);
    const next = { ...el, ...patch } as SketchElement;

    near(next.width, 120, 4);
    near(next.height, 50, 4);
    const nc = boxCenter(getLocalBox(next));
    const nwAfter = rotatePoint([next.x, next.y], nc, angle);
    near(nwAfter[0], nwBefore[0], 4);
    near(nwAfter[1], nwBefore[1], 4);
  });

  it("never shrinks below the minimum size", () => {
    const el = rect(0, 0, 100, 50);
    const frame = getSelectionFrame([el])!;
    const [[, patch]] = resizeSelection([el], frame, "se", [-500, -500], false);
    expect((patch as { width: number }).width).toBeGreaterThan(0);
    expect((patch as { height: number }).height).toBeGreaterThan(0);
  });

  it("keeps the aspect ratio when asked", () => {
    const el = rect(0, 0, 100, 50);
    const frame = getSelectionFrame([el])!;
    const [[, patch]] = resizeSelection([el], frame, "se", [200, 60], true);
    const p = patch as { width: number; height: number };
    near(p.width / p.height, 2, 4);
  });

  it("scales line points with the box", () => {
    const line: LinearElement = {
      ...newLinear("line", 10, 10, DEFAULT_STYLE),
      ...linearPatch([
        [0, 0],
        [100, 50],
      ]),
    };
    const patch = resizeElementToBox(line, { x: 10, y: 10, width: 200, height: 50 }) as Pick<LinearElement, "points" | "width" | "height">;
    expect(patch.points).toEqual([
      [0, 0],
      [200, 50],
    ]);
    expect(patch.width).toBe(200);
  });

  it("scales text by its font size", () => {
    const text = newText(0, 0, DEFAULT_STYLE, "hello");
    const patch = resizeElementToBox(text, { x: 0, y: 0, width: text.width * 2, height: text.height * 2 }) as { fontSize: number };
    expect(patch.fontSize).toBe(text.fontSize * 2);
  });

  it("resizes a group by mapping every element through the group box", () => {
    const a = rect(0, 0, 50, 50, { id: "a" });
    const b = rect(100, 0, 50, 50, { id: "b" });
    const frame = getSelectionFrame([a, b])!;
    expect(frame.box).toEqual({ x: 0, y: 0, width: 150, height: 50 });
    // Double the width by dragging the east handle.
    const patches = Object.fromEntries(resizeSelection([a, b], frame, "e", [300, 25], false)) as Record<string, { x: number; width: number }>;
    near(patches.a.x, 0);
    near(patches.a.width, 100);
    near(patches.b.x, 200);
    near(patches.b.width, 100);
  });

  it("rotating about its own centre leaves a single element in place", () => {
    const el = rect(100, 100, 100, 50);
    const [[, patch]] = rotateSelection([el], boxCenter(getLocalBox(el)), Math.PI / 3);
    const p = patch as { x: number; y: number; angle: number };
    near(p.x, 100);
    near(p.y, 100);
    near(p.angle, Math.PI / 3);
  });

  it("orbits elements around the group centre", () => {
    const a = rect(0, 0, 10, 10, { id: "a" });
    const patches = rotateSelection([a], [100, 5], Math.PI);
    const p = patches[0][1] as { x: number; y: number };
    // The centre (5,5) rotated 180deg about (100,5) lands at (195,5), so the top-left is (190,0).
    near(p.x, 190);
    near(p.y, 0);
  });
});

describe("factories", () => {
  it("creates a freedraw with its first point at the origin", () => {
    const f = newFreedraw(5, 6, DEFAULT_STYLE);
    expect(f.points).toEqual([[0, 0]]);
    expect(f.x).toBe(5);
  });
});
