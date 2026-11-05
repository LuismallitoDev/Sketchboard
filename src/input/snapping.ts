import { boundsOverlap, getElementBounds, type Bounds } from "../geometry/bounds";
import { SNAP_DISTANCE, snapPointToTargets, snapToGrid, GRID_SIZE, type Guide } from "../geometry/snap";
import type { Point } from "../geometry/math";
import { isBoundText } from "../scene/selection";
import type { Store } from "../state/store";

export type SnapMode = "grid" | "objects" | null;

/**
 * Which kind of snapping applies right now: the grid when grid mode is on, otherwise the other elements when object
 * snapping is on. Holding Ctrl/Cmd switches snapping off while dragging.
 */
export function snapMode(store: Store, bypass: boolean): SnapMode {
  if (bypass) return null;
  if (store.state.gridMode) return "grid";
  return store.state.objectsSnap ? "objects" : null;
}

/** Bounds of the elements that things snap to: the visible, unselected ones in view (labels are part of their shape). */
export function snapTargets(store: Store, exclude: ReadonlySet<string>): Bounds[] {
  const s = store.state;
  const view: Bounds = [-s.offsetX / s.zoom, -s.offsetY / s.zoom, (s.width - s.offsetX) / s.zoom, (s.height - s.offsetY) / s.zoom];
  const out: Bounds[] = [];
  for (const el of store.scene.visible()) {
    if (exclude.has(el.id) || isBoundText(el)) continue;
    const b = getElementBounds(el);
    if (boundsOverlap(b, view)) out.push(b);
  }
  return out;
}

export const snapThreshold = (store: Store): number => SNAP_DISTANCE / store.state.zoom;

export function setGuides(store: Store, guides: readonly Guide[]) {
  const cur = store.state.snapGuides;
  if (cur.length === 0 && guides.length === 0) return;
  store.setState({ snapGuides: guides });
}

export const clearGuides = (store: Store) => setGuides(store, []);

/**
 * A pointer position with snapping applied. `axes` limits which coordinates may change (a dragged edge only moves
 * along one axis), and only the guides for those axes are shown.
 */
export function snapPointer(
  store: Store,
  p: Point,
  exclude: ReadonlySet<string>,
  bypass: boolean,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
): Point {
  const mode = snapMode(store, bypass);
  if (mode === "grid") {
    clearGuides(store);
    return [axes.x ? snapToGrid(p[0], GRID_SIZE) : p[0], axes.y ? snapToGrid(p[1], GRID_SIZE) : p[1]];
  }
  if (mode === "objects") {
    const r = snapPointToTargets(p, snapTargets(store, exclude), snapThreshold(store));
    setGuides(
      store,
      r.guides.filter((g) => (g.a[0] === g.b[0] ? axes.x : axes.y)),
    );
    return [axes.x ? r.point[0] : p[0], axes.y ? r.point[1] : p[1]];
  }
  clearGuides(store);
  return p;
}
