import { getImageEntry } from "../data/files";
import { boundsContain, boxCenter, getCommonBounds, getElementBounds, isPointInBox, type Box } from "../geometry/bounds";
import { cropAfterDrag } from "../geometry/crop";
import { topElementAt } from "../geometry/hit";
import { hitLinearHandle, insertPointPatch, linearHandles, movePointsPatch } from "../geometry/linearEdit";
import { distance, snapAngle, type Point } from "../geometry/math";
import { snapBoundsToTargets, snapToGrid } from "../geometry/snap";
import {
  HANDLE_DIRS,
  RESIZE_HANDLES,
  getSelectionFrame,
  handleAnchorPoint,
  hitHandle,
  resizeSelection,
  rotateSelection,
  type Frame,
  type HandleName,
  type ResizeHandle,
} from "../geometry/transform";
import { clearGuides, setGuides, snapMode, snapPointer, snapTargets, snapThreshold } from "../input/snapping";
import type { PointerInfo, ToolHandler } from "../input/types";
import { allowedHandles } from "../render/renderInteractive";
import { findBindingTarget } from "../scene/binding";
import { cloneElements } from "../scene/factory";
import { groupAwareBoxSelection, isBoundText, resolveSelection, withBoundTexts } from "../scene/selection";
import { withFrameChildren } from "../scene/frames";
import type { ImageElement, LinearElement, SketchElement } from "../scene/types";
import { detachUnselectedArrows, exitLinearEdit, removeSelectedPoints, selectedElements, selectIds } from "../state/operations";
import { exitCrop } from "../state/rich";
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
  | { kind: "box"; origin: Point; base: string[]; additive: boolean }
  | { kind: "point"; start: Point; original: LinearElement; indices: number[]; changed: boolean }
  | { kind: "crop"; handle: ResizeHandle; original: ImageElement; grab: Point; changed: boolean };

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

/**
 * Click, Shift-click, box select, drag to move (Alt = duplicate), resize and rotate handles. Selecting an element
 * selects its whole group (Ctrl/Cmd-click picks one member). While a line is in point-editing mode the pointer
 * works on its points instead. Moving, resizing and drawing snap to the grid or to other elements when those
 * modes are on (Ctrl/Cmd switches snapping off while dragging).
 */
export class SelectionTool implements ToolHandler {
  private mode: Mode | null = null;

  constructor(private store: Store) {}

  private tolerance() {
    return 8 / this.store.state.zoom;
  }

  /** The image being cropped, when crop mode is on. */
  private croppingImage(): ImageElement | null {
    const id = this.store.state.croppingId;
    const el = id ? this.store.scene.get(id) : undefined;
    return el && el.type === "image" && !el.isDeleted ? el : null;
  }

  private editingLine(): LinearElement | null {
    const id = this.store.state.editingLinearId;
    const el = id ? this.store.scene.get(id) : undefined;
    return el && (el.type === "line" || el.type === "arrow") && !el.isDeleted ? el : null;
  }

  /** The cursor to show for a pointer position (used when hovering). */
  cursorAt(e: PointerInfo): string {
    const line = this.editingLine();
    if (line) return hitLinearHandle(line, e.scene, this.store.state.zoom) ? "move" : "default";
    const selected = selectedElements(this.store);
    const frame = getSelectionFrame(selected);
    if (frame) {
      const h = hitHandle(frame, e.scene, this.store.state.zoom, allowedHandles(selected));
      if (h) return CURSORS[h];
    }
    return topElementAt(this.store.scene.visible(), e.scene, this.tolerance(), this.store.state.frameRendering) ? "move" : "default";
  }

  down(e: PointerInfo) {
    const store = this.store;
    const s = store.state;

    const cropping = this.croppingImage();
    if (cropping) {
      const frame = getSelectionFrame([cropping]);
      const h = frame ? hitHandle(frame, e.scene, s.zoom, RESIZE_HANDLES) : null;
      if (frame && h) {
        const anchor = handleAnchorPoint(frame, h as ResizeHandle);
        this.mode = { kind: "crop", handle: h as ResizeHandle, original: cropping, grab: [e.scene[0] - anchor[0], e.scene[1] - anchor[1]], changed: false };
        return;
      }
      exitCrop(store); // clicking away ends cropping, then acts as a normal click
    }

    const line = this.editingLine();
    if (line) {
      if (this.downOnPoints(line, e)) return;
      exitLinearEdit(store); // clicking away leaves point editing, then acts as a normal click
    }

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

    const deep = e.ctrlKey || e.metaKey;
    const hit = topElementAt(store.scene.visible(), e.scene, this.tolerance(), s.frameRendering);
    if (hit) {
      const already = s.selectedIds.includes(hit.id);
      if (e.shiftKey) {
        if (!already) selectIds(store, [...s.selectedIds, hit.id], deep);
      } else if (!already || deep) {
        selectIds(store, [hit.id], deep);
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

  /** Pointer down while editing a line's points. Returns false when the click missed every handle. */
  private downOnPoints(line: LinearElement, e: PointerInfo): boolean {
    const store = this.store;
    const hit = hitLinearHandle(line, e.scene, store.state.zoom);
    if (!hit) return false;
    if (hit.kind === "point") {
      const cur = store.state.selectedPoints;
      let next: number[];
      if (e.shiftKey) next = cur.includes(hit.index) ? cur.filter((i) => i !== hit.index) : [...cur, hit.index];
      else next = cur.includes(hit.index) ? [...cur] : [hit.index];
      store.setState({ selectedPoints: next });
      this.mode = { kind: "point", start: e.scene, original: line, indices: next, changed: false };
    } else {
      // Dragging a midpoint inserts a new point there.
      const at = linearHandles(line).mids[hit.index];
      const patch = insertPointPatch(line, hit.index, at);
      const updated = store.scene.update(line.id, patch) as LinearElement;
      store.setState({ selectedPoints: [hit.index + 1] });
      this.mode = { kind: "point", start: e.scene, original: updated, indices: [hit.index + 1], changed: true };
    }
    return true;
  }

  /** Applies grid or object snapping to a drag of the selection by (dx, dy). */
  private snapMove(originals: readonly SketchElement[], dx: number, dy: number, e: PointerInfo) {
    const store = this.store;
    const mode = snapMode(store, e.ctrlKey || e.metaKey);
    const b0 = getCommonBounds(originals);
    if (!b0 || !mode) {
      clearGuides(store);
      return { dx, dy };
    }
    if (mode === "grid") {
      clearGuides(store);
      return { dx: snapToGrid(b0[0] + dx) - b0[0], dy: snapToGrid(b0[1] + dy) - b0[1] };
    }
    const r = snapBoundsToTargets(
      [b0[0] + dx, b0[1] + dy, b0[2] + dx, b0[3] + dy],
      snapTargets(store, new Set(originals.map((o) => o.id))),
      snapThreshold(store),
    );
    setGuides(store, r.guides);
    return { dx: dx + r.dx, dy: dy + r.dy };
  }

  move(e: PointerInfo) {
    const m = this.mode;
    if (!m) return;
    const store = this.store;
    const scene = store.scene;
    const ctrl = e.ctrlKey || e.metaKey;

    if (m.kind === "move") {
      if (!m.moved) {
        if (distance(e.screen, m.startScreen) < 3) return;
        m.moved = true;
        if (e.altKey && !m.duplicated) {
          // Alt-drag: leave the originals and drag copies (with their labels, and what is inside copied frames).
          const copies = cloneElements(withBoundTexts(scene.visible(), withFrameChildren(scene.visible(), m.originals)), 0, 0);
          scene.batch(() => copies.forEach((c) => scene.add(c)));
          const movable = copies.filter((c) => !isBoundText(c));
          const copiedFrames = new Set(movable.filter((c) => c.type === "frame").map((c) => c.id));
          store.select(movable.filter((c) => !(c.frameId && copiedFrames.has(c.frameId))).map((c) => c.id));
          m.originals = movable;
          m.duplicated = true;
        } else {
          // A frame carries everything inside it.
          m.originals = withFrameChildren(scene.visible(), m.originals);
        }
        detachUnselectedArrows(store, m.originals);
      }
      let dx = e.scene[0] - m.startScene[0];
      let dy = e.scene[1] - m.startScene[1];
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      ({ dx, dy } = this.snapMove(m.originals, dx, dy, e));
      scene.batch(() => {
        for (const o of m.originals) if (!o.locked) scene.update(o.id, { x: o.x + dx, y: o.y + dy });
      });
    } else if (m.kind === "resize") {
      if (!m.changed) detachUnselectedArrows(store, m.originals);
      let p: Point = [e.scene[0] - m.grab[0], e.scene[1] - m.grab[1]];
      if (m.frame.angle === 0) {
        const [sx, sy] = HANDLE_DIRS[m.handle];
        p = snapPointer(store, p, new Set(m.originals.map((o) => o.id)), ctrl, { x: sx !== 0, y: sy !== 0 });
      }
      // A picture keeps its proportions from a corner (Shift frees it); everything else frees with no key and locks with Shift.
      const [hx, hy] = HANDLE_DIRS[m.handle];
      const keepAspect = m.originals.length === 1 && m.originals[0].type === "image" && hx !== 0 && hy !== 0 ? !e.shiftKey : e.shiftKey;
      const patches = resizeSelection(m.originals, m.frame, m.handle, p, keepAspect);
      scene.batch(() => patches.forEach(([id, patch]) => scene.update(id, patch)));
      m.changed = true;
    } else if (m.kind === "rotate") {
      if (!m.changed) detachUnselectedArrows(store, m.originals);
      let delta = Math.atan2(e.scene[1] - m.center[1], e.scene[0] - m.center[0]) - m.startAngle;
      if (e.shiftKey) {
        // Snap the resulting angle (single element) or the turn itself (group) to 15-degree steps.
        delta = m.originals.length === 1 ? snapAngle(m.originals[0].angle + delta) - m.originals[0].angle : snapAngle(delta);
      }
      const patches = rotateSelection(m.originals, m.center, delta);
      scene.batch(() => patches.forEach(([id, patch]) => scene.update(id, patch)));
      m.changed = true;
    } else if (m.kind === "crop") {
      const entry = getImageEntry(m.original.fileId);
      if (!entry) return;
      const p: Point = [e.scene[0] - m.grab[0], e.scene[1] - m.grab[1]];
      scene.update(m.original.id, cropAfterDrag(m.original, m.handle, p, entry));
      m.changed = true;
    } else if (m.kind === "point") {
      const dx = e.scene[0] - m.start[0];
      const dy = e.scene[1] - m.start[1];
      if (!m.changed && Math.hypot(dx, dy) * store.state.zoom < 2) return;
      m.changed = true;
      let patch: Partial<LinearElement> = movePointsPatch(m.original, m.indices, dx, dy);
      const el = m.original;
      const last = el.points.length - 1;
      if (el.type === "arrow" && !el.polygon && m.indices.length === 1 && (m.indices[0] === 0 || m.indices[0] === last)) {
        // Dragging an arrow's end: attach it to the shape under the pointer, or let go.
        const isStart = m.indices[0] === 0;
        const otherShape = (isStart ? el.endBinding : el.startBinding)?.elementId;
        const t =
          store.state.arrowBinding && !ctrl
            ? findBindingTarget(scene.visible(), e.scene, store.state.zoom, new Set(otherShape ? [otherShape] : []), store.state.midpointSnapping)
            : null;
        store.setState({ bindingHighlight: t?.shape.id ?? null });
        patch = { ...patch, [isStart ? "startBinding" : "endBinding"]: t?.binding ?? null };
      }
      scene.update(el.id, patch);
    } else {
      const box: Box = {
        x: Math.min(m.origin[0], e.scene[0]),
        y: Math.min(m.origin[1], e.scene[1]),
        width: Math.abs(e.scene[0] - m.origin[0]),
        height: Math.abs(e.scene[1] - m.origin[1]),
      };
      const outer = [box.x, box.y, box.x + box.width, box.y + box.height] as const;
      const visible = scene.visible();
      const inside = new Set(visible.filter((el) => !el.locked && boundsContain(outer, getElementBounds(el))).map((el) => el.id));
      const picked = groupAwareBoxSelection(visible, inside);
      store.select(m.additive ? resolveSelection(visible, [...m.base, ...picked], { groups: false }) : picked);
      store.setState({ selectionBox: box });
    }
  }

  up() {
    const m = this.mode;
    this.mode = null;
    if (!m) return;
    const store = this.store;
    clearGuides(store);
    if (store.state.bindingHighlight) store.setState({ bindingHighlight: null });
    if (m.kind === "move") {
      if (m.moved) {
        store.commit();
      } else if (m.hitId) {
        if (m.shift && m.wasSelected) {
          // Shift-click on something already selected removes it (and the rest of its group).
          const drop = new Set(resolveSelection(store.scene.visible(), [m.hitId], { groups: true }));
          store.select(store.state.selectedIds.filter((id) => !drop.has(id)));
        } else if (!m.shift && store.state.selectedIds.length > 1) {
          // A plain click on one member of a multi-selection narrows the selection to it (or to its group).
          selectIds(store, [m.hitId], false);
        }
      }
    } else if (m.kind === "resize" || m.kind === "rotate" || m.kind === "point" || m.kind === "crop") {
      if (m.changed) store.commit();
    } else {
      store.setState({ selectionBox: null });
    }
  }

  keyDown(e: KeyboardEvent): boolean {
    if (this.store.state.croppingId && (e.key === "Escape" || e.key === "Enter")) {
      exitCrop(this.store);
      return true;
    }
    if (!this.store.state.editingLinearId) return false;
    if (e.key === "Escape" || e.key === "Enter") {
      exitLinearEdit(this.store);
      return true;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      removeSelectedPoints(this.store);
      return true; // never delete the whole line while editing its points
    }
    return false;
  }

  cancel() {
    this.mode = null;
    clearGuides(this.store);
    this.store.setState({ selectionBox: null, bindingHighlight: null });
  }
}
