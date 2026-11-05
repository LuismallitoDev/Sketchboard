import type { Point } from "../geometry/math";
import type { PointerInfo, ToolHandler } from "../input/types";
import { newShape } from "../scene/factory";
import type { ShapeElement } from "../scene/types";
import { finishDrawing } from "../state/operations";
import type { Store } from "../state/store";

/** Rectangle, diamond and ellipse: drag to size (Shift = square, Alt = from centre). */
export class ShapeTool implements ToolHandler {
  private id: string | null = null;
  private origin: Point = [0, 0];

  constructor(
    private store: Store,
    private type: ShapeElement["type"],
  ) {}

  down(e: PointerInfo) {
    this.origin = e.scene;
    const el = newShape(this.type, e.scene[0], e.scene[1], this.store.state.currentItem);
    this.store.scene.add(el);
    this.id = el.id;
    this.store.select([]);
  }

  move(e: PointerInfo) {
    if (!this.id) return;
    let dx = e.scene[0] - this.origin[0];
    let dy = e.scene[1] - this.origin[1];
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
    if (!el) return;
    // A click without a drag draws nothing.
    if (Math.max(el.width, el.height) * this.store.state.zoom < 3) {
      this.store.scene.remove(el.id);
      return;
    }
    this.store.select([el.id]);
    this.store.commit();
    finishDrawing(this.store);
  }

  cancel() {
    if (this.id) this.store.scene.remove(this.id);
    this.id = null;
  }
}
