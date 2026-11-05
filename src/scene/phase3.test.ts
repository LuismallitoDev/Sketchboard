import { describe, expect, it } from "vitest";
import type { Bounds } from "../geometry/bounds";
import { dominantAxis, routeElbow, simplifyPath } from "../geometry/elbow";
import type { Point } from "../geometry/math";
import { distanceOutsideShape, rayShapeInterval, sideMidpoints } from "../geometry/outline";
import { snapBoundsToTargets, snapPointToTargets, snapToGrid } from "../geometry/snap";
import { parseScene, serializeScene } from "../data/sceneFile";
import { createFlowchartNode, endFlowchartRun, navigateFlowchart } from "../state/flowchart";
import { applyItemStyle, detachUnselectedArrows, selectedElements } from "../state/operations";
import { defaultAppState } from "../state/appState";
import { Store } from "../state/store";
import { aimPoint, boundEndpoint, elbowEndpoint, findBindingTarget, focusFromPoint } from "./binding";
import { DEFAULT_STYLE } from "./constants";
import { newLinear, newShape } from "./factory";
import type { Binding, LinearElement, ShapeElement } from "./types";

const shape = (type: ShapeElement["type"], id: string, x: number, y: number, w: number, h: number, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  ...newShape(type, x, y, DEFAULT_STYLE),
  id,
  width: w,
  height: h,
  ...extra,
});

const bind = (id: string, focus: [number, number] = [0.5, 0.5]): Binding => ({ elementId: id, gap: 6, focus });
const near = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);

describe("outline geometry", () => {
  it("finds where a ray crosses a rectangle, also when rotated", () => {
    const r = shape("rectangle", "r", 0, 0, 100, 50);
    expect(rayShapeInterval(r, [-50, 25], [1, 0])).toEqual([50, 150]);
    expect(rayShapeInterval(r, [-50, 200], [1, 0])).toBeNull();
    // Turned a quarter circle about its centre (50, 25) the rectangle spans x 25..75.
    const turned = { ...r, angle: Math.PI / 2 };
    const iv = rayShapeInterval(turned, [0, 25], [1, 0])!;
    near(iv[0], 25);
    near(iv[1], 75);
  });

  it("finds where a ray crosses an ellipse and a diamond", () => {
    const e = shape("ellipse", "e", 0, 0, 100, 100);
    const [a, b] = rayShapeInterval(e, [-10, 50], [1, 0])!;
    near(a, 10);
    near(b, 110);
    const d = shape("diamond", "d", 0, 0, 100, 100);
    const [c, f] = rayShapeInterval(d, [-10, 50], [1, 0])!;
    near(c, 10);
    near(f, 110);
    // Along the top edge of the box a diamond is empty except at its vertex column.
    expect(rayShapeInterval(d, [-10, 5], [1, 0])).not.toBeNull();
    const iv = rayShapeInterval(d, [-10, 5], [1, 0])!;
    expect(iv[1] - iv[0]).toBeLessThan(20);
  });

  it("measures how far a point is outside a shape", () => {
    const r = shape("rectangle", "r", 0, 0, 100, 50);
    expect(distanceOutsideShape(r, [50, 25])).toBe(0);
    near(distanceOutsideShape(r, [120, 25]), 20);
    const e = shape("ellipse", "e", 0, 0, 100, 100);
    near(distanceOutsideShape(e, [150, 50]), 50);
    expect(distanceOutsideShape(e, [50, 50])).toBe(0);
  });

  it("lists the side midpoints", () => {
    const r = shape("rectangle", "r", 0, 0, 100, 50);
    expect(sideMidpoints(r)).toEqual([
      [50, 0],
      [100, 25],
      [50, 50],
      [0, 25],
    ]);
  });
});

describe("binding geometry", () => {
  const box = shape("rectangle", "box", 100, 100, 100, 100);

  it("converts between a focus and a point, including for rotated shapes", () => {
    expect(aimPoint(box, [0.5, 0.5])).toEqual([150, 150]);
    expect(aimPoint(box, [0, 0])).toEqual([100, 100]);
    const spun = { ...box, angle: Math.PI / 2 };
    const p = aimPoint(spun, [1, 0.5]);
    near(p[0], 150);
    near(p[1], 200);
    const f = focusFromPoint(spun, p);
    near(f[0], 1);
    near(f[1], 0.5);
  });

  it("places an arrow end on the outline, held back by the gap", () => {
    // Coming from the left, aiming at the centre: the left edge is x = 100, so the tip stops at 94.
    expect(boundEndpoint(box, bind("box"), [0, 150])).toEqual([94, 150]);
    // Aiming off-centre makes the arrow come in at an angle.
    const p = boundEndpoint(box, bind("box", [0.5, 0]), [0, 150]);
    expect(p[0]).toBeGreaterThan(94);
    expect(p[1]).toBeLessThan(150);
    // Elbow arrows leave straight out of a side.
    expect(elbowEndpoint(box, bind("box"), [1, 0])).toEqual([206, 150]);
    expect(elbowEndpoint(box, bind("box"), [0, -1])).toEqual([150, 94]);
  });

  describe("finding what an arrow end attaches to", () => {
    const others = [shape("ellipse", "ell", 400, 100, 100, 100)];
    const all = [box, ...others];

    it("attaches within reach of the outline and aims at the centre", () => {
      const t = findBindingTarget(all, [90, 150], 1, new Set(), false)!;
      expect(t.shape.id).toBe("box");
      expect(t.binding.focus).toEqual([0.5, 0.5]);
      expect(t.binding.gap).toBe(6);
      expect(findBindingTarget(all, [60, 150], 1, new Set(), false)).toBeNull();
    });

    it("reach shrinks as you zoom in, and excluded shapes are skipped", () => {
      expect(findBindingTarget(all, [90, 150], 4, new Set(), false)).toBeNull(); // 10 units away, reach 3.5
      expect(findBindingTarget(all, [90, 150], 1, new Set(["box"]), false)).toBeNull();
    });

    it("keeps the drop point as the focus when dropped inside, unless it is near the middle", () => {
      const t = findBindingTarget(all, [110, 120], 1, new Set(), false)!;
      near(t.binding.focus[0], 0.1);
      near(t.binding.focus[1], 0.2);
      expect(findBindingTarget(all, [155, 145], 1, new Set(), false)!.binding.focus).toEqual([0.5, 0.5]);
    });

    it("aims at the nearest side midpoint with midpoint snapping", () => {
      const t = findBindingTarget(all, [190, 130], 1, new Set(), true)!;
      expect(t.binding.focus).toEqual([1, 0.5]); // the right side
      const top = findBindingTarget(all, [140, 105], 1, new Set(), true)!;
      expect(top.binding.focus).toEqual([0.5, 0]);
    });

    it("prefers the topmost shape", () => {
      const over = shape("rectangle", "over", 80, 120, 80, 40);
      expect(findBindingTarget([box, over], [100, 140], 1, new Set(), false)!.shape.id).toBe("over");
    });

    it("ignores locked and deleted shapes and non-shapes", () => {
      expect(findBindingTarget([{ ...box, locked: true }], [90, 150], 1, new Set(), false)).toBeNull();
      expect(findBindingTarget([{ ...box, isDeleted: true }], [90, 150], 1, new Set(), false)).toBeNull();
    });
  });
});

/** A store with two squares and an arrow joined to both. */
function connected(arrowType: LinearElement["arrowType"] = "sharp", bY = 0) {
  const store = new Store();
  store.scene.add(shape("rectangle", "A", 0, 0, 100, 100));
  store.scene.add(shape("rectangle", "B", 300, bY, 100, 100));
  store.scene.add({
    ...newLinear("arrow", 50, 50, { ...DEFAULT_STYLE, arrowType }, [
      [0, 0],
      [300, bY],
    ]),
    id: "arrow",
    startBinding: bind("A"),
    endBinding: bind("B"),
  });
  store.history.reset();
  const arrow = () => store.scene.get("arrow") as LinearElement;
  const abs = (): Point[] => arrow().points.map((p): Point => [arrow().x + p[0], arrow().y + p[1]]);
  return { store, arrow, abs };
}

const orthogonal = (pts: readonly Point[]) => pts.every((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) < 1e-6 || Math.abs(p[1] - pts[i - 1][1]) < 1e-6);
const crossesInterior = (pts: readonly Point[], [x1, y1, x2, y2]: Bounds) =>
  pts.some((p, i) => {
    if (i === 0) return false;
    const q = pts[i - 1];
    // Orthogonal segments only.
    if (p[1] === q[1]) return p[1] > y1 && p[1] < y2 && Math.max(Math.min(p[0], q[0]), x1) < Math.min(Math.max(p[0], q[0]), x2);
    return p[0] > x1 && p[0] < x2 && Math.max(Math.min(p[1], q[1]), y1) < Math.min(Math.max(p[1], q[1]), y2);
  });

describe("attached arrows follow their shapes", () => {
  it("snaps both ends to the outlines and lists the arrow on both shapes", () => {
    const { store, abs } = connected();
    const [s, e] = [abs()[0], abs()[1]];
    near(s[0], 106);
    near(s[1], 50);
    near(e[0], 294);
    expect(store.scene.get("A")!.boundElements).toEqual([{ id: "arrow", type: "arrow" }]);
    expect(store.scene.get("B")!.boundElements).toEqual([{ id: "arrow", type: "arrow" }]);
  });

  it("moves with a shape, also when the shape is resized or rotated", () => {
    const { store, abs } = connected();
    store.scene.update("B", { x: 500 });
    near(abs()[1][0], 494);
    store.scene.update("B", { x: 300, y: 100 });
    // B's centre is now (350, 150): the end meets B's outline on the line from A's centre to it.
    expect(abs()[1][1]).toBeGreaterThan(50);
    store.scene.update("B", { width: 200 });
    expect(abs()[1][0]).toBeCloseTo(294, 0);
  });

  it("lets go when the shape is deleted, and takes hold again on undo", () => {
    const { store, arrow } = connected();
    store.scene.update("B", { isDeleted: true });
    store.commit();
    expect(arrow().endBinding).toBeNull();
    expect(arrow().startBinding).not.toBeNull();
    store.undo();
    expect(arrow().endBinding).not.toBeNull();
    expect(store.scene.get("B")!.isDeleted).toBe(false);
  });

  it("removes the link from a shape when its arrow is deleted", () => {
    const { store } = connected();
    store.scene.update("arrow", { isDeleted: true });
    expect(store.scene.get("A")!.boundElements).toBeNull();
    expect(store.scene.get("B")!.boundElements).toBeNull();
  });

  it("does not move an end that starts inside the shape it is attached to", () => {
    const store = new Store();
    store.scene.add(shape("rectangle", "A", 0, 0, 200, 200));
    store.scene.add({
      ...newLinear("arrow", 100, 100, DEFAULT_STYLE),
      id: "arrow",
      startBinding: bind("A"),
    });
    const a = store.scene.get("arrow") as LinearElement;
    expect([a.x, a.y]).toEqual([100, 100]); // both points are inside A, so nothing is pushed around
  });

  it("detaches arrows that move without their shapes", () => {
    const { store, arrow } = connected();
    // Only the arrow is selected: moving it lets go of both shapes.
    detachUnselectedArrows(store, [arrow()]);
    expect(arrow().startBinding).toBeNull();
    expect(arrow().endBinding).toBeNull();
  });

  it("stays attached when it moves together with its shapes", () => {
    const { store, arrow } = connected();
    detachUnselectedArrows(store, [store.scene.get("A")!, store.scene.get("B")!, arrow()]);
    expect(arrow().startBinding).not.toBeNull();
    expect(arrow().endBinding).not.toBeNull();
  });

  it("is saved and restored with its attachments", () => {
    const { store } = connected();
    const parsed = parseScene(serializeScene(store.scene.all(), defaultAppState()))!;
    const arrow = parsed.elements.find((e) => e.id === "arrow") as LinearElement;
    expect(arrow.startBinding).toEqual(bind("A"));
    expect(arrow.endBinding).toEqual(bind("B"));
    // Malformed attachments are dropped instead of breaking the arrow.
    const broken = parseScene(JSON.stringify({ type: "sketchboard", elements: [{ ...arrow, startBinding: { elementId: 5 }, endBinding: "x" }] }))!;
    expect((broken.elements[0] as LinearElement).startBinding).toBeNull();
    expect((broken.elements[0] as LinearElement).endBinding).toBeNull();
  });

  it("keeps the arrow when copying only its shapes: copies are attached only to copies", () => {
    const { store } = connected();
    store.select(["A", "B", "arrow"]);
    const before = store.scene.visible().length;
    // Duplicate through the real operation.
    return import("../state/operations").then(({ duplicateSelected }) => {
      duplicateSelected(store);
      expect(store.scene.visible().length).toBe(before * 2);
      const copy = store.scene.visible().filter((e) => e.type === "arrow" && e.id !== "arrow")[0] as LinearElement;
      expect(copy.startBinding!.elementId).not.toBe("A");
      expect(store.scene.get(copy.startBinding!.elementId)!.type).toBe("rectangle");
    });
  });
});

describe("elbow arrows", () => {
  it("runs straight when the shapes are level", () => {
    const { abs } = connected("elbow");
    const pts = abs();
    expect(pts).toHaveLength(2);
    near(pts[0][0], 106);
    near(pts[1][0], 294);
  });

  it("is orthogonal and leaves/enters the sides when the shapes are offset", () => {
    const { abs } = connected("elbow", 200);
    const pts = abs();
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(orthogonal(pts)).toBe(true);
    // Leaves the right side of A, arrives at the left side of B.
    near(pts[0][0], 106);
    near(pts[0][1], 50);
    near(pts[pts.length - 1][0], 294);
    near(pts[pts.length - 1][1], 250);
  });

  it("re-routes when a shape moves and stays stable once settled", () => {
    const { store, arrow, abs } = connected("elbow", 200);
    store.scene.update("B", { x: 500, y: -150 });
    expect(orthogonal(abs())).toBe(true);
    const settled = JSON.stringify(arrow().points);
    store.scene.update("A", { opacity: 90 }); // an unrelated change runs the normalizer again
    expect(JSON.stringify(arrow().points)).toBe(settled);
  });

  it("goes around a shape that is in the way", () => {
    // B is above A and the arrow must come round the outside; the route never cuts through either shape.
    const store = new Store();
    store.scene.add(shape("rectangle", "A", 0, 100, 100, 100));
    store.scene.add(shape("rectangle", "B", 20, -100, 100, 100));
    store.scene.add({
      ...newLinear("arrow", 50, 150, { ...DEFAULT_STYLE, arrowType: "elbow" }, [
        [0, 0],
        [20, -50],
      ]),
      id: "arrow",
      startBinding: bind("A"),
      endBinding: bind("B"),
    });
    const a = store.scene.get("arrow") as LinearElement;
    const pts = a.points.map((p): Point => [a.x + p[0], a.y + p[1]]);
    expect(orthogonal(pts)).toBe(true);
    expect(crossesInterior(pts, [0, 100, 100, 200])).toBe(false);
    expect(crossesInterior(pts, [20, -100, 120, 0])).toBe(false);
  });

  it("routes free ends, and an arrow leaving elbow mode keeps only its ends", () => {
    const store = new Store();
    store.scene.add({
      ...newLinear("arrow", 0, 0, { ...DEFAULT_STYLE, arrowType: "elbow" }, [
        [0, 0],
        [200, 100],
      ]),
      id: "arrow",
    });
    let a = store.scene.get("arrow") as LinearElement;
    expect(a.points.length).toBeGreaterThanOrEqual(3);
    const pts = a.points.map((p): Point => [a.x + p[0], a.y + p[1]]);
    expect(orthogonal(pts)).toBe(true);
    expect(pts[0][1]).toBe(pts[1][1]); // wider than tall: it sets off horizontally

    store.select(["arrow"]);
    applyItemStyle(store, { arrowType: "sharp" });
    a = store.scene.get("arrow") as LinearElement;
    expect(a.arrowType).toBe("sharp");
    expect(a.points).toHaveLength(2);
  });

  it("an elbow arrow cannot be rotated: it is reset to upright", () => {
    const store = new Store();
    store.scene.add({
      ...newLinear("arrow", 0, 0, { ...DEFAULT_STYLE, arrowType: "elbow" }, [
        [0, 0],
        [200, 100],
      ]),
      id: "arrow",
      angle: 1,
    });
    expect((store.scene.get("arrow") as LinearElement).angle).toBe(0);
  });
});

describe("the elbow router", () => {
  it("picks the dominant axis", () => {
    expect(dominantAxis([5, 1])).toEqual([1, 0]);
    expect(dominantAxis([-5, 1])).toEqual([-1, 0]);
    expect(dominantAxis([1, 5])).toEqual([0, 1]);
    expect(dominantAxis([1, -5])).toEqual([0, -1]);
    expect(dominantAxis([0, 0])).toEqual([1, 0]);
  });

  it("makes a Z between two free ends, leaving along the given direction", () => {
    const r = routeElbow([0, 0], [1, 0], [200, 100], [-1, 0], []);
    expect(orthogonal(r)).toBe(true);
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1]).toEqual([200, 100]);
    expect(r[1][1]).toBe(0); // first segment horizontal
    expect(r[r.length - 2][1]).toBe(100); // last segment horizontal
  });

  it("puts the bend halfway between the ends when nothing is in the way", () => {
    const r = routeElbow([0, 0], [1, 0], [208, 140], [-1, 0], []);
    expect(r).toEqual([
      [0, 0],
      [104, 0],
      [104, 140],
      [208, 140],
    ]);
    const down = routeElbow([0, 0], [0, 1], [140, 208], [0, -1], []);
    expect(down).toEqual([
      [0, 0],
      [0, 104],
      [140, 104],
      [140, 208],
    ]);
  });

  it("routes around an obstacle in the direct path", () => {
    const wall: Bounds = [100, 0, 200, 100];
    const r = routeElbow([60, 50], [1, 0], [300, 50], [-1, 0], [wall]);
    expect(orthogonal(r)).toBe(true);
    expect(crossesInterior(r, wall)).toBe(false);
    expect(r.length).toBeGreaterThan(2);
  });

  it("simplifies repeated and collinear points", () => {
    expect(
      simplifyPath([
        [0, 0],
        [0, 0],
        [5, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });
});

describe("snapping", () => {
  const target: Bounds = [0, 0, 100, 50];

  it("snaps an edge to a nearby edge or centre, within the threshold only", () => {
    const r = snapBoundsToTargets([103, 80, 153, 130], [target], 8);
    expect(r.dx).toBe(-3); // left edge to the target's right edge
    expect(r.guides.some((g) => g.kind === "line")).toBe(true);
    const far = snapBoundsToTargets([140, 200, 190, 250], [target], 8);
    expect(far.dx).toBe(0);
    expect(far.dy).toBe(0);
    expect(far.guides).toEqual([]);
  });

  it("snaps centres and the vertical axis independently", () => {
    // Centre y of the mover (63) is 2 from the target's centre line (25 + 40 = ... use a mover at y 12..62 -> centre 37, target centre 25)
    const r = snapBoundsToTargets([300, 12, 350, 62], [[0, 0, 100, 50]], 14);
    expect(r.dy).toBe(-12);
    expect(r.dx).toBe(0);
  });

  it("evens out the gaps when dropped between two elements", () => {
    const a: Bounds = [0, 0, 50, 50];
    const c: Bounds = [250, 0, 300, 50];
    // Gaps are 68 and 82: moving 7 to the right makes both 75.
    const r = snapBoundsToTargets([118, 0, 168, 50], [a, c], 10);
    expect(r.dx).toBe(7);
    expect(r.guides.filter((g) => g.kind === "gap")).toHaveLength(2);
  });

  it("continues the rhythm of two elements", () => {
    const a: Bounds = [0, 0, 50, 50];
    const b: Bounds = [100, 0, 150, 50]; // 50 apart
    const r = snapBoundsToTargets([205, 0, 255, 50], [a, b], 10);
    expect(r.dx).toBe(-5);
    expect(r.guides.filter((g) => g.kind === "gap")).toHaveLength(2);
    // And on the other side.
    const left = snapBoundsToTargets([-107, 0, -57, 50], [a, b], 10);
    expect(left.dx).toBe(7);
  });

  it("snaps a single point and the grid", () => {
    // Both coordinates are within 8 of a line of the target: x = 100 (right edge), y = 25 (centre line).
    const r = snapPointToTargets([97, 31], [target], 8);
    expect(r.point).toEqual([100, 25]);
    expect(r.guides.length).toBeGreaterThanOrEqual(2);
    // Only the coordinate that is close enough snaps.
    expect(snapPointToTargets([97, 40], [target], 8).point).toEqual([100, 40]);
    expect(snapToGrid(31)).toBe(40);
    expect(snapToGrid(29)).toBe(20);
    expect(snapToGrid(-9)).toBe(-0);
  });
});

describe("flowchart mode", () => {
  function start() {
    const store = new Store();
    store.scene.add(shape("rectangle", "root", 100, 100, 120, 60, { strokeColor: "#dc2626" }));
    store.history.reset();
    store.select(["root"]);
    endFlowchartRun();
    return store;
  }
  const arrowsFrom = (store: Store, id: string) =>
    store.scene.visible().filter((e): e is LinearElement => e.type === "arrow" && e.startBinding?.elementId === id);

  it("creates a connected shape to the side, selects it, and attaches the arrow to both", () => {
    const store = start();
    expect(createFlowchartNode(store, "right")).toBe(true);
    const node = selectedElements(store)[0];
    expect(node.id).not.toBe("root");
    expect(node.x).toBe(100 + 120 + 100);
    expect(node.y).toBe(100);
    expect([node.width, node.height]).toEqual([120, 60]);
    expect(node.strokeColor).toBe("#dc2626");
    const [arrow] = arrowsFrom(store, "root");
    expect(arrow.endBinding!.elementId).toBe(node.id);
    expect(store.scene.get("root")!.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
    // The arrow runs between the outlines.
    expect(arrow.x).toBeCloseTo(226, 0);
  });

  it("is one undo step", () => {
    const store = start();
    createFlowchartNode(store, "down");
    expect(store.scene.visible()).toHaveLength(3);
    store.undo();
    expect(store.scene.visible()).toHaveLength(1);
  });

  it("chains forward when the direction changes or the modifier was released", () => {
    const store = start();
    createFlowchartNode(store, "right");
    const first = selectedElements(store)[0];
    createFlowchartNode(store, "down"); // another direction: continues from the new shape
    const second = selectedElements(store)[0];
    expect(second.x).toBe(first.x);
    expect(second.y).toBe(first.y + first.height + 100);
    expect(arrowsFrom(store, first.id)).toHaveLength(1);
  });

  it("adds siblings of the first new shape while the same key is repeated", () => {
    const store = start();
    createFlowchartNode(store, "right");
    createFlowchartNode(store, "right");
    createFlowchartNode(store, "right");
    expect(arrowsFrom(store, "root")).toHaveLength(3);
    const nodes = store.scene.visible().filter((e) => e.type === "rectangle" && e.id !== "root");
    expect(nodes).toHaveLength(3);
    // They line up in a column centred on the root's row.
    expect(new Set(nodes.map((n) => n.x)).size).toBe(1);
    const ys = nodes.map((n) => n.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBe(100); // height 60 + spacing 40
    expect(ys[2] - ys[1]).toBe(100);
    const mid = (ys[0] + ys[2] + 60) / 2;
    expect(mid).toBe(100 + 30); // centred on the root (100..160)
  });

  it("a released modifier ends the run, so the next press chains from the new shape", () => {
    const store = start();
    createFlowchartNode(store, "right");
    const first = selectedElements(store)[0];
    endFlowchartRun();
    createFlowchartNode(store, "right");
    expect(selectedElements(store)[0].x).toBe(first.x + first.width + 100);
    expect(arrowsFrom(store, "root")).toHaveLength(1);
  });

  it("needs exactly one selected shape", () => {
    const store = start();
    store.select([]);
    expect(createFlowchartNode(store, "right")).toBe(false);
    store.scene.add(shape("ellipse", "e", 500, 500, 50, 50));
    store.select(["root", "e"]);
    expect(createFlowchartNode(store, "right")).toBe(false);
  });

  it("navigates to the connected shape in the pressed direction", () => {
    const store = start();
    createFlowchartNode(store, "right");
    const right = selectedElements(store)[0];
    store.select(["root"]);
    expect(navigateFlowchart(store, "left")).toBe(false); // nothing to the left
    expect(navigateFlowchart(store, "right")).toBe(true);
    expect(store.state.selectedIds).toEqual([right.id]);
    expect(navigateFlowchart(store, "left")).toBe(true); // back to the parent
    expect(store.state.selectedIds).toEqual(["root"]);
  });

  it("navigates between siblings", () => {
    const store = start();
    createFlowchartNode(store, "right");
    createFlowchartNode(store, "right");
    const nodes = store.scene.visible().filter((e) => e.type === "rectangle" && e.id !== "root").sort((a, b) => a.y - b.y);
    store.select([nodes[0].id]);
    expect(navigateFlowchart(store, "down")).toBe(true);
    expect(store.state.selectedIds).toEqual([nodes[1].id]);
    expect(navigateFlowchart(store, "up")).toBe(true);
    expect(store.state.selectedIds).toEqual([nodes[0].id]);
  });
});
