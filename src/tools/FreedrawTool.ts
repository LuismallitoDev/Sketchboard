import { distance } from "../geometry/math";
import type { PointerInfo, ToolHandler } from "../input/types";
import { newFreedraw } from "../scene/factory";
import { linearPatch } from "../scene/linear";
import type { FreedrawElement, Pt } from "../scene/types";
import type { Store } from "../state/store";

/** Pen: records the pointer path. A stylus draws with real pressure; a mouse simulates it (or stays constant). */
export class FreedrawTool implements ToolHandler {
  private id: string | null = null;
  private realPressure = false;

  constructor(private store: Store) {}

  private get el(): FreedrawElement | undefined {
    return this.id ? (this.store.scene.get(this.id) as FreedrawElement | undefined) : undefined;
  }

  down(e: PointerInfo) {
    const style = this.store.state.currentItem;
    this.realPressure = e.pointerType === "pen" && style.simulatePressure;
    const el = newFreedraw(e.scene[0], e.scene[1], style, this.realPressure ? e.pressure || 0.5 : undefined);
    el.simulatePressure = style.simulatePressure && !this.realPressure;
    this.store.scene.add(el);
    this.id = el.id;
    this.store.select([]);
  }

  move(e: PointerInfo) {
    const el = this.el;
    if (!el) return;
    const last = el.points[el.points.length - 1];
    const p: Pt = [e.scene[0] - el.x, e.scene[1] - el.y];
    if (distance(p, last) * this.store.state.zoom < 1) return;
    const points = [...el.points, p];
    const patch: Partial<FreedrawElement> = linearPatch(points);
    if (this.realPressure) patch.pressures = [...el.pressures, e.pressure || 0.5];
    this.store.scene.update(el.id, patch);
  }

  up() {
    if (!this.id) return;
    this.id = null;
    this.store.commit(); // the pen stays active, like a real pen
  }

  cancel() {
    if (this.id) this.store.scene.remove(this.id);
    this.id = null;
  }
}
