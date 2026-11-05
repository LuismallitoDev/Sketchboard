import { boxCenter, getLocalBox } from "../geometry/bounds";
import type { Point } from "../geometry/math";
import { BINDING_GAP, isBindable } from "../scene/binding";
import { newId, newSeed, newNonce } from "../scene/ids";
import { newLinear } from "../scene/factory";
import type { ShapeElement, SketchElement } from "../scene/types";
import { selectedElements } from "./operations";
import type { Store } from "./store";

export type FlowDirection = "up" | "down" | "left" | "right";

const VEC: Record<FlowDirection, Point> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
/** Space between a shape and the one created next to it. */
const NODE_GAP = 100;
/** Space between sibling shapes created in the same direction. */
const SIBLING_GAP = 40;

/**
 * Pressing the same arrow again while Ctrl/Cmd is still held adds siblings next to the first new shape instead of
 * chaining a new one off the last. This remembers that run; releasing the modifier ends it.
 */
let run: { originId: string; direction: FlowDirection; nodeIds: string[] } | null = null;

export function endFlowchartRun() {
  run = null;
}

/** A new shape like `src`, `NODE_GAP` away in `dir`, joined to it by an attached arrow. */
function spawn(store: Store, src: ShapeElement, dir: FlowDirection): ShapeElement {
  const box = getLocalBox(src);
  const v = VEC[dir];
  const node: ShapeElement = {
    ...src,
    id: newId(),
    x: box.x + v[0] * (box.width + NODE_GAP),
    y: box.y + v[1] * (box.height + NODE_GAP),
    angle: 0,
    seed: newSeed(),
    version: 1,
    versionNonce: newNonce(),
    groupIds: [],
    boundElements: null,
    locked: false,
    isDeleted: false,
  };
  const style = store.state.currentItem;
  const sc = boxCenter(box);
  const arrow = newLinear("arrow", sc[0], sc[1], { ...style, strokeColor: src.strokeColor }, [
    [0, 0],
    [v[0] * (box.width + NODE_GAP), v[1] * (box.height + NODE_GAP)],
  ]);
  arrow.startBinding = { elementId: src.id, gap: BINDING_GAP, focus: [0.5, 0.5] };
  arrow.endBinding = { elementId: node.id, gap: BINDING_GAP, focus: [0.5, 0.5] };
  store.scene.batch(() => {
    store.scene.add(node);
    store.scene.add(arrow);
  });
  return node;
}

/** Lines the siblings of a run up side by side, centred on the first shape's axis. */
function layoutRun(store: Store, origin: ShapeElement, dir: FlowDirection, ids: readonly string[]) {
  const nodes = ids.map((id) => store.scene.get(id)).filter((e): e is SketchElement => !!e && !e.isDeleted);
  if (nodes.length < 2) return;
  const vertical = dir === "left" || dir === "right"; // siblings stack across the direction of travel
  const sizes = nodes.map((n) => (vertical ? n.height : n.width));
  const total = sizes.reduce((a, b) => a + b, 0) + SIBLING_GAP * (nodes.length - 1);
  const oc = boxCenter(getLocalBox(origin));
  let cursor = (vertical ? oc[1] : oc[0]) - total / 2;
  store.scene.batch(() => {
    nodes.forEach((n, i) => {
      store.scene.update(n.id, vertical ? { y: cursor } : { x: cursor });
      cursor += sizes[i] + SIBLING_GAP;
    });
  });
}

/**
 * Ctrl/Cmd + arrow key: creates a shape next to the selected one, joined by an arrow, and selects it. Pressing it
 * again keeps adding siblings while the modifier is held; pressing another direction continues from the new shape.
 */
export function createFlowchartNode(store: Store, dir: FlowDirection): boolean {
  const sel = selectedElements(store);
  if (sel.length !== 1 || !isBindable(sel[0]) || sel[0].locked) return false;
  const selected = sel[0];

  let source: ShapeElement = selected;
  if (run && run.direction === dir && run.nodeIds.includes(selected.id)) {
    const origin = store.scene.get(run.originId);
    if (isBindable(origin) && !origin.isDeleted) source = origin;
  } else {
    run = { originId: selected.id, direction: dir, nodeIds: [] };
  }
  const node = spawn(store, source, dir);
  run!.nodeIds.push(node.id);
  layoutRun(store, source, dir, run!.nodeIds);
  store.select([node.id]);
  store.commit();
  return true;
}

/** The shapes joined to `node` by arrows: where its arrows go, where they come from, and its siblings. */
function connected(store: Store, node: ShapeElement): ShapeElement[] {
  const arrows = store.scene.visible().filter((e) => e.type === "arrow");
  const ends = (a: SketchElement) => (a.type === "arrow" ? [a.startBinding?.elementId, a.endBinding?.elementId] : []);
  const result = new Map<string, ShapeElement>();
  const add = (id: string | undefined) => {
    const s = id ? store.scene.get(id) : undefined;
    if (isBindable(s) && !s.isDeleted && s.id !== node.id) result.set(s.id, s);
  };
  const parents: string[] = [];
  for (const a of arrows) {
    const [from, to] = ends(a);
    if (from === node.id) add(to);
    if (to === node.id) {
      add(from);
      if (from) parents.push(from);
    }
  }
  for (const a of arrows) {
    const [from, to] = ends(a);
    if (from && parents.includes(from)) add(to);
  }
  return [...result.values()];
}

/** Alt + arrow key: selects the connected shape that lies in that direction. */
export function navigateFlowchart(store: Store, dir: FlowDirection): boolean {
  const sel = selectedElements(store);
  if (sel.length !== 1 || !isBindable(sel[0])) return false;
  const here = boxCenter(getLocalBox(sel[0]));
  const v = VEC[dir];
  let best: { id: string; score: number } | null = null;
  for (const c of connected(store, sel[0])) {
    const there = boxCenter(getLocalBox(c));
    const dx = there[0] - here[0];
    const dy = there[1] - here[1];
    const along = dx * v[0] + dy * v[1];
    if (along <= 0) continue;
    const across = Math.abs(dx * v[1] - dy * v[0]);
    const score = along + across * 2; // prefer the one most nearly straight ahead
    if (!best || score < best.score) best = { id: c.id, score };
  }
  if (!best) return false;
  store.select([best.id]);
  return true;
}
