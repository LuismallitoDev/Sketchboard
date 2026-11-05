import {
  boundsContain,
  boxCenter,
  getElementBounds,
  isPointInBox,
  type Box,
} from "../geometry/bounds";
import { topElementAt } from "../geometry/hit";
import { distance, snapAngle, type Point } from "../geometry/math";
import {
  getSelectionFrame,
  handleAnchorPoint,
  hitHandle,
  resizeSelection,
  rotateSelection,
  type Frame,
  type HandleName,
  type ResizeHandle,
} from "../geometry/transform";
import type { PointerInfo, ToolHandler } from "../input/types";
import { allowedHandles } from "../render/renderInteractive";
import { cloneElements } from "../scene/factory";
import type { SketchElement } from "../scene/types";
import { selectedElements } from "../state/operations";
import type { Store } from "../state/store";

type Mode =
  | {
      kind: "move";
      startScene: Point;
      startScreen: Point;
      originals: SketchElement[];
      moved: boolean;
      hitId: string | null;
      wasSelected: boolean;
      shift: boolean;
      duplicated: boolean;
    }
  | { kind: "resize"; handle: ResizeHandle; frame: Frame; originals: SketchElement[]; grab: Point; changed: boolean }
  | { kind: "rotate"; center: Point; startAngle: number; originals: SketchElement[]; changed: boolean }
  | { kind: "box"; origin: Point; base: string[]; additive: boolean };

const CURSORS: Record<HandleName, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  rotate: "grab",
};

/** Click, shift-click, box select, drag to move (Alt = duplicate), resize and rotate handles. */
export class SelectionTool implements ToolHandler {
  private mode: Mode | null = null;

  constructor(private store: Store) {}

  private tolerance() {
    return 8 / this.store.state.zoom;
  }

  /** The cursor to show for a pointer position (used when hovering). */
  cursorAt(e: PointerInfo): string {
    const selected = selectedElements(this.store);
    const frame = getSelectionFrame(selected);
    if (frame) {
      const h = hitHandle(frame, e.scene, this.store.state.zoom, allowedHandles(selected));
      if (h) return CURSORS[h];
    }
    return topElementAt(this.store.scene.visible(), e.scene, this.tolerance()) ? "move" : "default";
  }

  down(e: PointerInfo) {
    const store = this.store;
    const s = store.state;
    const selected = selectedElements(store);
    const frame = getSelectionFrame(selected);

    if (frame && selected.every((el) => !el.locked)) {
      const h = hitHandle(frame, e.scene, s.zoom, allowedHandles(selected));
      if (h === "rotate") {
        const c = boxCenter(frame.box);
        this.mode = {
          kind: "rotate",
          center: c,
          startAngle: Math.atan2(e.scene[1] - c[1], e.scene[0] - c[0]),
          originals: selected,
          changed: false,
        };
        return;
      }
      if (h) {
        const anchor = handleAnchorPoint(frame, h as ResizeHandle);
        this.mode = {
          kind: "resize",
          handle: h as ResizeHandle,
          frame,
          originals: selected,
          grab: [e.scene[0] - anchor[0], e.scene[1] - anchor[1]],
          changed: false,
        };
        return;
      }
    }

    const hit = topElementAt(store.scene.visible(), e.scene, this.tolerance());
    if (hit) {
      const already = s.selectedIds.includes(hit.id);
      if (e.shiftKey) {
        if (!already) store.select([...s.selectedIds, hit.id]);
      } else if (!already) {
        store.select([hit.id]);
      }
      this.mode = {
        kind: "move",
        startScene: e.scene,
        startScreen: e.screen,
        originals: selectedElements(store),
        moved: false,
        hitId: hit.id,
        wasSelected: already,
        shift: e.shiftKey,
        duplicated: false,
      };
      return;
    }

    // Inside a multi-selection's frame: drag the whole selection.
    if (selected.length > 1 && frame && isPointInBox(e.scene, frame.box)) {
      this.mode = {
        kind: "move",
        startScene: e.scene,
        startScreen: e.screen,
        originals: selected,
        moved: false,
        hitId: null,
        wasSelected: true,
        shift: e.shiftKey,
        duplicated: false,
      };
      return;
    }

    if (!e.shiftKey) store.select([]);
    this.mode = { kind: "box", origin: e.scene, base: [...store.state.selectedIds], additive: e.shiftKey };
  }

  move(e: PointerInfo) {
    const m = this.mode;
    if (!m) return;
    const scene = this.store.scene;

    if (m.kind === "move") {
      if (!m.moved) {
        if (distance(e.screen, m.startScreen) < 3) return;
        m.moved = true;
        if (e.altKey && !m.duplicated) {
          const copies = cloneElements(m.originals, 0, 0);
          scene.batch(() => copies.forEach((c) => scene.add(c)));
          this.store.select(copies.map((c) => c.id));
          m.originals = copies;
          m.duplicated = true;
        }
      }
      let dx = e.scene[0] - m.startScene[0];
      let dy = e.scene[1] - m.startScene[1];
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      scene.batch(() => {
        for (const o of m.originals) if (!o.locked) scene.update(o.id, { x: o.x + dx, y: o.y + dy });
      });
    } else if (m.kind === "resize") {
      const p: Point = [e.scene[0] - m.grab[0], e.scene[1] - m.grab[1]];
      const patches = resizeSelection(m.originals, m.frame, m.handle, p, e.shiftKey);
      scene.batch(() => patches.forEach(([id, patch]) => scene.update(id, patch)));
      m.changed = true;
    } else if (m.kind === "rotate") {
      let delta = Math.atan2(e.scene[1] - m.center[1], e.scene[0] - m.center[0]) - m.startAngle;
      if (e.shiftKey) {
        // Snap the resulting angle (single element) or the turn itself (group) to 15-degree steps.
        delta = m.originals.length === 1 ? snapAngle(m.originals[0].angle + delta) - m.originals[0].angle : snapAngle(delta);
      }
      const patches = rotateSelection(m.originals, m.center, delta);
      scene.batch(() => patches.forEach(([id, patch]) => scene.update(id, patch)));
      m.changed = true;
    } else {
      const box: Box = {
        x: Math.min(m.origin[0], e.scene[0]),
        y: Math.min(m.origin[1], e.scene[1]),
        width: Math.abs(e.scene[0] - m.origin[0]),
        height: Math.abs(e.scene[1] - m.origin[1]),
      };
      const outer = [box.x, box.y, box.x + box.width, box.y + box.height] as const;
      const inside = scene
        .visible()
        .filter((el) => !el.locked && boundsContain(outer, getElementBounds(el)))
        .map((el) => el.id);
      this.store.select(m.additive ? [...new Set([...m.base, ...inside])] : inside);
      this.store.setState({ selectionBox: box });
    }
  }

  up() {
    const m = this.mode;
    this.mode = null;
    if (!m) return;
    const store = this.store;
    if (m.kind === "move") {
      if (m.moved) {
        store.commit();
      } else if (m.hitId) {
        if (m.shift && m.wasSelected) store.select(store.state.selectedIds.filter((id) => id !== m.hitId));
        else if (!m.shift && store.state.selectedIds.length > 1) store.select([m.hitId]);
      }
    } else if (m.kind === "resize" || m.kind === "rotate") {
      if (m.changed) store.commit();
    } else {
      store.setState({ selectionBox: null });
    }
  }

  cancel() {
    this.mode = null;
    this.store.setState({ selectionBox: null });
  }
}
