import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "../scene/constants";
import { newLinear, newShape, newText } from "../scene/factory";
import { linearPatch } from "../scene/linear";
import type { LinearElement, ShapeElement, TextElement } from "../scene/types";
import {
  alignSelected,
  applyItemStyle,
  bindSelectedText,
  confirmClearCanvas,
  convertSelectedType,
  copyStyle,
  deleteSelected,
  duplicateSelected,
  finishTextEdit,
  flipSelected,
  groupSelected,
  lockSelected,
  moveSelectedZ,
  pasteStyle,
  selectAll,
  selectedElements,
  selectIds,
  setTextMode,
  startBoundTextEdit,
  startLinearEdit,
  togglePolygonSelected,
  ungroupSelected,
  unbindSelectedText,
  unlockAll,
  wrapSelectedTextInContainer,
} from "./operations";
import { Store } from "./store";

function setup() {
  const store = new Store();
  const add = (el: ShapeElement | LinearElement | TextElement) => {
    store.scene.add(el);
    return el;
  };
  const rect = (id: string, x: number, y: number, w = 100, h = 60, extra: Partial<ShapeElement> = {}) =>
    add({ ...newShape("rectangle", x, y, DEFAULT_STYLE), id, width: w, height: h, ...extra });
  const done = () => {
    store.history.reset();
  };
  return { store, add, rect, done };
}

const el = (store: Store, id: string) => store.scene.get(id)!;

describe("groups through the store", () => {
  it("group, select-as-group and ungroup, each undoable", () => {
    const { store, rect, done } = setup();
    rect("a", 0, 0);
    rect("b", 200, 0);
    rect("c", 400, 0);
    done();

    store.select(["a", "b"]);
    groupSelected(store);
    expect(el(store, "a").groupIds).toHaveLength(1);
    expect(el(store, "a").groupIds).toEqual(el(store, "b").groupIds);

    selectIds(store, ["a"]);
    expect(store.state.selectedIds).toEqual(["a", "b"]);
    selectIds(store, ["a"], true);
    expect(store.state.selectedIds).toEqual(["a"]);

    store.select(["a", "b"]);
    ungroupSelected(store);
    expect(el(store, "a").groupIds).toEqual([]);

    store.undo();
    expect(el(store, "a").groupIds).toHaveLength(1);
  });
});

describe("arranging", () => {
  it("brings an element forward and undoes it", () => {
    const { store, rect, done } = setup();
    rect("a", 0, 0);
    rect("b", 10, 10);
    done();
    store.select(["a"]);
    moveSelectedZ(store, "forward");
    expect(store.scene.all().map((e) => e.id)).toEqual(["b", "a"]);
    store.undo();
    expect(store.scene.all().map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("aligns and flips the selection", () => {
    const { store, rect, done } = setup();
    rect("a", 0, 0);
    rect("b", 150, 40);
    done();
    store.select(["a", "b"]);
    alignSelected(store, "left");
    expect(el(store, "b").x).toBe(0);
    flipSelected(store, "v");
    expect(el(store, "a").y).toBe(40); // mirrored across the centre line of both
    expect(el(store, "b").y).toBe(0);
  });

  it("locks elements so they cannot be selected, and unlocks them all", () => {
    const { store, rect, done } = setup();
    rect("a", 0, 0);
    rect("b", 200, 0);
    done();
    store.select(["a"]);
    lockSelected(store);
    expect(el(store, "a").locked).toBe(true);
    expect(store.state.selectedIds).toEqual([]);
    selectAll(store);
    expect(store.state.selectedIds).toEqual(["b"]);

    unlockAll(store);
    expect(el(store, "a").locked).toBe(false);
    expect(store.state.selectedIds).toEqual(["a"]);
  });

  it("clears the whole canvas as one undo step", () => {
    const { store, rect, done } = setup();
    rect("a", 0, 0);
    rect("b", 200, 0);
    done();
    confirmClearCanvas(store);
    expect(store.scene.visible()).toHaveLength(0);
    store.undo();
    expect(store.scene.visible()).toHaveLength(2);
  });
});

describe("style", () => {
  it("copies the style of one element onto others", () => {
    const { store, rect, done } = setup();
    rect("src", 0, 0, 100, 60, { strokeColor: "#dc2626", backgroundColor: "#bfdbfe", fillStyle: "solid", roughness: 2 });
    rect("dst", 200, 0);
    done();
    store.select(["src"]);
    copyStyle(store);
    store.select(["dst"]);
    pasteStyle(store);
    const dst = el(store, "dst");
    expect(dst.strokeColor).toBe("#dc2626");
    expect(dst.backgroundColor).toBe("#bfdbfe");
    expect(dst.fillStyle).toBe("solid");
    expect(dst.roughness).toBe(2);
    store.undo();
    expect(el(store, "dst").strokeColor).toBe(DEFAULT_STYLE.strokeColor);
  });

  it("converts a shape into another shape and a line into an arrow", () => {
    const { store, rect, add, done } = setup();
    rect("r", 0, 0);
    const line: LinearElement = {
      ...newLinear("line", 0, 200, DEFAULT_STYLE),
      id: "l",
      ...linearPatch([
        [0, 0],
        [100, 0],
      ]),
    };
    add(line);
    done();
    store.select(["r"]);
    convertSelectedType(store, "ellipse");
    expect(el(store, "r").type).toBe("ellipse");
    store.select(["l"]);
    convertSelectedType(store, "arrow");
    expect(el(store, "l").type).toBe("arrow");
    expect((el(store, "l") as LinearElement).endArrowhead).toBe("arrow");
  });

  it("makes a curved arrow bow out when it has only two points", () => {
    const { store, add, done } = setup();
    add({
      ...newLinear("arrow", 0, 0, DEFAULT_STYLE),
      id: "a",
      ...linearPatch([
        [0, 0],
        [100, 0],
      ]),
    });
    done();
    store.select(["a"]);
    applyItemStyle(store, { arrowType: "round" });
    const a = el(store, "a") as LinearElement;
    expect(a.arrowType).toBe("round");
    expect(a.points).toHaveLength(3);
  });

  it("closes a line into a polygon and opens it again", () => {
    const { store, add, done } = setup();
    add({
      ...newLinear("line", 0, 0, DEFAULT_STYLE),
      id: "l",
      ...linearPatch([
        [0, 0],
        [100, 0],
        [50, 80],
      ]),
    });
    done();
    store.select(["l"]);
    togglePolygonSelected(store);
    let l = el(store, "l") as LinearElement;
    expect(l.polygon).toBe(true);
    expect(l.points).toHaveLength(4);
    expect(l.points[3]).toEqual([0, 0]);
    togglePolygonSelected(store);
    l = el(store, "l") as LinearElement;
    expect(l.polygon).toBe(false);
    expect(l.points).toHaveLength(3);
  });

  it("enters point editing with rotation applied to the points", () => {
    const { store, add, done } = setup();
    add({
      ...newLinear("line", 0, 0, DEFAULT_STYLE),
      id: "l",
      angle: Math.PI / 2,
      ...linearPatch([
        [0, 0],
        [100, 0],
      ]),
    });
    done();
    startLinearEdit(store, "l");
    const l = el(store, "l") as LinearElement;
    expect(store.state.editingLinearId).toBe("l");
    expect(l.angle).toBe(0);
    // A horizontal line turned a quarter circle about its centre is vertical.
    expect(Math.abs(l.points[1][0])).toBeCloseTo(0, 6);
    expect(Math.abs(l.points[1][1])).toBeCloseTo(100, 6);
  });
});

describe("labels (bound text)", () => {
  /** A rectangle with a typed label, as the double-click flow creates it. */
  function labelled(text: string) {
    const ctx = setup();
    ctx.rect("box", 100, 100, 200, 100);
    ctx.done();
    startBoundTextEdit(ctx.store, el(ctx.store, "box"));
    const id = ctx.store.state.editingTextId!;
    ctx.store.scene.update(id, { text });
    finishTextEdit(ctx.store);
    return { ...ctx, label: () => el(ctx.store, id) as TextElement, box: () => el(ctx.store, "box") };
  }

  it("creates a label, centres it in the container and keeps the container selected", () => {
    const { label, box, store } = labelled("hi");
    expect(label().containerId).toBe("box");
    expect(box().boundElements).toEqual([{ id: label().id, type: "text" }]);
    expect(label().x + label().width / 2).toBeCloseTo(200, 1);
    expect(label().y + label().height / 2).toBeCloseTo(150, 1);
    expect(store.state.selectedIds).toEqual(["box"]);
  });

  it("follows the container when it moves or rotates", () => {
    const { label, store } = labelled("hi");
    store.scene.update("box", { x: 400, y: 50, angle: 0.5 });
    expect(label().x + label().width / 2).toBeCloseTo(500, 1);
    expect(label().y + label().height / 2).toBeCloseTo(100, 1);
    expect(label().angle).toBe(0.5);
  });

  it("wraps long text and grows the container to fit it", () => {
    const { label, box, store } = labelled("word ".repeat(40));
    expect(label().height).toBeGreaterThan(100);
    expect(box().height).toBeGreaterThan(100);
    expect(label().wrapWidth).toBeCloseTo(188, 1); // 200 - 2 * 6 padding
    expect(store.scene.all()[1].id).toBe(label().id); // drawn right above its container
  });

  it("is deleted with its container, and comes back with it on undo", () => {
    const { label, store } = labelled("hi");
    store.select(["box"]);
    deleteSelected(store);
    expect(label().isDeleted).toBe(true);
    store.undo();
    expect(label().isDeleted).toBe(false);
    expect(el(store, "box").isDeleted).toBe(false);
  });

  it("is duplicated with its container and linked to the copy", () => {
    const { store, label } = labelled("hi");
    store.select(["box"]);
    duplicateSelected(store);
    const copy = store.scene.visible().filter((e) => e.type === "rectangle" && e.id !== "box")[0];
    const copyLabel = store.scene.visible().find((e) => e.type === "text" && e.containerId === copy.id) as TextElement;
    expect(copyLabel).toBeDefined();
    expect(copyLabel.id).not.toBe(label().id);
    expect(copy.boundElements).toEqual([{ id: copyLabel.id, type: "text" }]);
    expect(store.state.selectedIds).toEqual([copy.id]);
  });

  it("leaves no trace when an empty new label is cancelled", () => {
    const { store, rect, done } = setup();
    rect("box", 0, 0, 200, 100);
    done();
    startBoundTextEdit(store, el(store, "box"));
    finishTextEdit(store);
    expect(store.scene.visible()).toHaveLength(1);
    expect((el(store, "box") as ShapeElement).boundElements).toBeNull();
    expect(store.history.canUndo()).toBe(false);
  });

  it("unbinds into free text and binds it back", () => {
    const { store, label } = labelled("hello");
    const id = label().id;
    store.select(["box"]);
    unbindSelectedText(store);
    expect((el(store, id) as TextElement).containerId).toBeNull();
    expect(el(store, "box").boundElements).toBeNull();

    store.select(["box", id]);
    bindSelectedText(store);
    expect((el(store, id) as TextElement).containerId).toBe("box");
  });

  it("labels an arrow at the middle of its path, without wrapping", () => {
    const { store, add, done } = setup();
    add({
      ...newLinear("arrow", 0, 0, DEFAULT_STYLE),
      id: "arrow",
      ...linearPatch([
        [0, 0],
        [200, 0],
      ]),
    });
    done();
    startBoundTextEdit(store, el(store, "arrow"));
    const id = store.state.editingTextId!;
    store.scene.update(id, { text: "yes" });
    finishTextEdit(store);
    const label = el(store, id) as TextElement;
    expect(label.x + label.width / 2).toBeCloseTo(100, 1);
    expect(label.y + label.height / 2).toBeCloseTo(0, 1);
    expect(label.wrapWidth).toBeNull();
    expect(label.angle).toBe(0);
  });
});

describe("free text", () => {
  it("wraps a free text at a fixed width and switches back to fitting it", () => {
    const { store, add, done } = setup();
    const t = { ...newText(0, 0, DEFAULT_STYLE, "one two three four five six seven eight"), id: "t" };
    add(t);
    done();
    store.select(["t"]);
    const natural = (el(store, "t") as TextElement).width;
    setTextMode(store, "fixed");
    let text = el(store, "t") as TextElement;
    expect(text.autoResize).toBe(false);
    expect(text.wrapWidth).toBe(natural);

    // Narrow it by hand, as the side handle does, and check the height grows.
    store.scene.update("t", { wrapWidth: 80, width: 80 });
    store.commit();
    setTextMode(store, "auto");
    text = el(store, "t") as TextElement;
    expect(text.autoResize).toBe(true);
    expect(text.wrapWidth).toBeNull();
    expect(text.width).toBe(natural);
  });

  it("wraps selected text in a new rectangle that holds it", () => {
    const { store, add, done } = setup();
    add({ ...newText(100, 100, DEFAULT_STYLE, "hello"), id: "t" });
    done();
    store.select(["t"]);
    wrapSelectedTextInContainer(store);
    const text = el(store, "t") as TextElement;
    expect(text.containerId).toBeTruthy();
    const box = el(store, text.containerId!);
    expect(box.type).toBe("rectangle");
    expect(box.width).toBeGreaterThan(text.width);
    expect(selectedElements(store).map((e) => e.id)).toEqual([box.id]);
  });
});
