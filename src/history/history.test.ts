import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "../scene/constants";
import { newShape } from "../scene/factory";
import { Scene } from "../scene/scene";
import { History } from "./history";

function setup() {
  const scene = new Scene();
  const applied: string[][] = [];
  const history = new History(scene, (ids) => applied.push(ids));
  history.reset();
  const make = (id: string, x = 0) => ({ ...newShape("rectangle", x, 0, DEFAULT_STYLE), id });
  return { scene, history, applied, make };
}

describe("History", () => {
  it("undoes and redoes the creation of an element", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    expect(history.commit()).toBe(true);
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(scene.get("a")).toBeUndefined();
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(scene.get("a")?.isDeleted).toBe(false);
  });

  it("does not record a commit when nothing changed", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    history.commit();
    expect(history.commit()).toBe(false);
  });

  it("restores the previous values after a change", () => {
    const { scene, history, make } = setup();
    scene.add(make("a", 10));
    history.commit();
    scene.update("a", { x: 99 });
    history.commit();

    history.undo();
    expect(scene.get("a")?.x).toBe(10);
    history.redo();
    expect(scene.get("a")?.x).toBe(99);
  });

  it("restores soft-deleted elements at the same z-position", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    scene.add(make("b"));
    scene.add(make("c"));
    history.commit();
    scene.update("b", { isDeleted: true });
    history.commit();

    history.undo();
    expect(scene.all().map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(scene.get("b")?.isDeleted).toBe(false);
  });

  it("treats many changes between commits as a single step", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    scene.add(make("b"));
    history.commit();
    scene.batch(() => {
      scene.update("a", { x: 1 });
      scene.update("b", { x: 2 });
    });
    history.commit();
    history.undo();
    expect(scene.get("a")?.x).toBe(0);
    expect(scene.get("b")?.x).toBe(0);
  });

  it("clears the redo stack when a new change is committed", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    history.commit();
    history.undo();
    scene.add(make("b"));
    history.commit();
    expect(history.canRedo()).toBe(false);
  });

  it("restores and reapplies a changed z-order", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    scene.add(make("b"));
    history.commit();
    scene.reorder(["b", "a"]);
    history.commit();

    history.undo();
    expect(scene.all().map((e) => e.id)).toEqual(["a", "b"]);
    history.redo();
    expect(scene.all().map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("only touches the elements of the step, so unrelated edits survive an undo", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    scene.add(make("b"));
    history.commit();
    scene.update("b", { x: 5 });
    history.commit();
    // Something else (e.g. another tab) edits "a" without going through this history.
    scene.update("a", { x: 77 });

    history.undo();
    expect(scene.get("b")?.x).toBe(0);
    expect(scene.get("a")?.x).toBe(77);
  });

  it("gives restored elements a fresh version so caches never see stale content", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    history.commit();
    scene.update("a", { x: 5 });
    history.commit();
    const before = scene.get("a")!;
    history.undo();
    const after = scene.get("a")!;
    expect(after).not.toBe(before);
    expect(after.version).toBeGreaterThan(before.version);
  });

  it("reports the ids that were changed", () => {
    const { scene, history, applied, make } = setup();
    scene.add(make("a"));
    history.commit();
    scene.update("a", { x: 3 });
    history.commit();
    history.undo();
    expect(applied.at(-1)).toEqual(["a"]);
  });

  it("limits how many steps are kept", () => {
    const { scene, history, make } = setup();
    scene.add(make("a"));
    history.commit();
    for (let i = 1; i <= 250; i++) {
      scene.update("a", { x: i });
      history.commit();
    }
    let steps = 0;
    while (history.undo()) steps++;
    expect(steps).toBe(200);
  });
});
