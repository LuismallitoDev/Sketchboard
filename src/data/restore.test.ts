import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "../scene/constants";
import { newFreedraw, newLinear, newShape, newText } from "../scene/factory";
import { linearPatch } from "../scene/linear";
import type { LinearElement, SketchElement } from "../scene/types";
import { defaultAppState } from "../state/appState";
import { restoreAppState, restoreElement, restoreElements } from "./restore";
import { parseScene, serializeScene } from "./sceneFile";

function sampleScene(): SketchElement[] {
  const arrow: LinearElement = {
    ...newLinear("arrow", 10, 20, DEFAULT_STYLE),
    ...linearPatch([
      [0, 0],
      [50, -30],
      [90, 10],
    ]),
  };
  const pen = newFreedraw(5, 5, { ...DEFAULT_STYLE, simulatePressure: false }, 0.4);
  pen.points.push([3, 4], [8, 1]);
  pen.pressures.push(0.5, 0.6);
  return [
    { ...newShape("rectangle", 0, 0, { ...DEFAULT_STYLE, backgroundColor: "#bfdbfe", fillStyle: "cross-hatch" }), width: 120, height: 80, angle: 0.5 },
    newShape("ellipse", 200, 100, DEFAULT_STYLE),
    newShape("diamond", -50, 30, DEFAULT_STYLE),
    arrow,
    { ...pen, ...linearPatch(pen.points) },
    newText(30, 40, { ...DEFAULT_STYLE, fontFamily: "code", textAlign: "center" }, "hello\nworld"),
  ];
}

describe("restoreElement", () => {
  it("round-trips every element type through JSON", () => {
    const original = sampleScene();
    const restored = restoreElements(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
  });

  it("rejects unknown types and non-objects", () => {
    expect(restoreElement(null)).toBeNull();
    expect(restoreElement("rectangle")).toBeNull();
    expect(restoreElement({ type: "spaceship" })).toBeNull();
  });

  it("fills in defaults for missing fields", () => {
    const el = restoreElement({ type: "rectangle", x: 1, y: 2, width: 3, height: 4 })!;
    expect(el.strokeColor).toBe(DEFAULT_STYLE.strokeColor);
    expect(el.backgroundColor).toBe("transparent");
    expect(el.opacity).toBe(100);
    expect(el.id).toBeTruthy();
    expect(el.isDeleted).toBe(false);
  });

  it("repairs invalid numbers and out-of-range values", () => {
    const el = restoreElement({ type: "ellipse", x: "oops", y: Infinity, width: -30, opacity: 500, roughness: 9 })!;
    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
    expect(el.width).toBe(30);
    expect(el.opacity).toBe(100);
    expect(el.roughness).toBe(2);
  });

  it("drops lines without enough points", () => {
    expect(restoreElement({ type: "line", points: [[0, 0]] })).toBeNull();
    expect(restoreElement({ type: "arrow", points: "nope" })).toBeNull();
    expect(restoreElement({ type: "freedraw", points: [] })).toBeNull();
  });

  it("normalises a line whose first point is not the origin", () => {
    const el = restoreElement({ type: "line", x: 10, y: 10, points: [[5, 5], [15, 25]] }) as LinearElement;
    expect(el.points[0]).toEqual([0, 0]);
    expect(el.x).toBe(15);
    expect(el.y).toBe(15);
    expect(el.points[1]).toEqual([10, 20]);
  });

  it("remeasures text instead of trusting stored sizes", () => {
    const el = restoreElement({ type: "text", text: "abc", fontSize: 20, width: 9999, height: 9999 })!;
    expect(el.width).toBeLessThan(9999);
    expect(el.height).toBe(25);
  });

  it("drops duplicate ids", () => {
    const list = restoreElements([
      { type: "rectangle", id: "same" },
      { type: "ellipse", id: "same" },
    ]);
    expect(list).toHaveLength(1);
  });
});

describe("scene files", () => {
  it("serialises and parses a scene with its app state", () => {
    const els = sampleScene();
    const state = { ...defaultAppState(), zoom: 2.5, offsetX: 40, theme: "dark" as const, viewBackgroundColor: "#fffce8" };
    const parsed = parseScene(serializeScene(els, state))!;
    expect(parsed.elements).toEqual(els);
    expect(parsed.appState.zoom).toBe(2.5);
    expect(parsed.appState.offsetX).toBe(40);
    expect(parsed.appState.theme).toBe("dark");
    expect(parsed.appState.viewBackgroundColor).toBe("#fffce8");
  });

  it("does not save deleted elements or empty text", () => {
    const els = sampleScene();
    const deleted = { ...els[1], isDeleted: true };
    const empty = newText(0, 0, DEFAULT_STYLE, "");
    const parsed = parseScene(serializeScene([els[0], deleted, empty], defaultAppState()))!;
    expect(parsed.elements).toHaveLength(1);
  });

  it("rejects text that is not a Sketchboard scene", () => {
    expect(parseScene("not json")).toBeNull();
    expect(parseScene(JSON.stringify({ type: "something-else", elements: [] }))).toBeNull();
    expect(parseScene("42")).toBeNull();
  });

  it("clamps a wild zoom and ignores bad values", () => {
    const s = restoreAppState({ zoom: 9999, theme: "purple", offsetX: "x" });
    expect(s.zoom).toBe(30);
    expect(s.theme).toBe("system");
    expect(s.offsetX).toBeUndefined();
  });
});
