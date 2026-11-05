import type { Point } from "../geometry/math";
import { clearGuides, snapPointer } from "../input/snapping";
import type { PointerInfo, ToolHandler } from "../input/types";
import { newEmbeddable, newFrame, newShape } from "../scene/factory";
import { nextFrameName } from "../scene/frames";
import type { ShapeElement, SketchElement } from "../scene/types";
import { finishDrawing } from "../state/operations";
import { openEmbedDialog } from "../state/rich";
import type { Store } from "../state/store";

export type DragShapeKind = ShapeElement["type"] | "frame" | "embeddable";

/**
 * Rectangle, diamond, ellipse, frame and web embed: drag to size (Shift = square, Alt = from centre). Corners snap
 * when snapping is on. A new embed asks for its address when the drag ends.
 */
export class ShapeTool implements ToolHandler {
  private id: string | null = null;
  private origin: Point = [0, 0];

  constructor(
    private store: Store,
    private kind: DragShapeKind,
  ) {}

  private create(x: number, y: number): SketchElement {
    if (this.kind === "frame") return newFrame(x, y, 0, 0, nextFrameName(this.store.scene.all()));
    if (this.kind === "embeddable") return newEmbeddable(x, y, 0, 0);
    return newShape(this.kind, x, y, this.store.state.currentItem);
  }

  down(e: PointerInfo) {
    this.origin = snapPointer(this.store, e.scene, new Set(), e.ctrlKey || e.metaKey);
    const el = this.create(this.origin[0], this.origin[1]);
    this.store.scene.add(el);
    this.id = el.id;
    this.store.select([]);
  }

  move(e: PointerInfo) {
    if (!this.id) return;
    // A square is already exact, so Shift and snapping do not mix.
    const p = e.shiftKey ? e.scene : snapPointer(this.store, e.scene, new Set([this.id]), e.ctrlKey || e.metaKey);
    let dx = p[0] - this.origin[0];
    let dy = p[1] - this.origin[1];
    if (e.shiftKey) {
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      dx = (dx < 0 ? -1 : 1) * s;
      dy = (dy < 0 ? -1 : 1) * s;
    }
    const x1 = e.altKey ? this.origin[0] - dx : this.origin[0];
    const y1 = e.altKey ? this.origin[1] - dy : this.origin[1];
    const x2 = this.origin[0] + dx;
    const y2 = this.origin[1] + dy;
    this.store.scene.update(this.id, {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    });
  }

  up() {
    const el = this.id ? this.store.scene.get(this.id) : undefined;
    this.id = null;
    clearGuides(this.store);
    if (!el) return;
    // A click without a drag draws nothing.
    if (Math.max(el.width, el.height) * this.store.state.zoom < 3) {
      this.store.scene.remove(el.id);
      return;
    }
    if (el.type === "embeddable") {
      // Not part of the history until it has an address.
      openEmbedDialog(this.store, el.id);
      return;
    }
    this.store.select([el.id]);
    this.store.commit();
    finishDrawing(this.store);
  }

  cancel() {
    if (this.id) this.store.scene.remove(this.id);
    this.id = null;
    clearGuides(this.store);
  }
}
