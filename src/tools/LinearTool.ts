import { distance, snapAngle, type Point } from "../geometry/math";
import type { PointerInfo, ToolHandler } from "../input/types";
import { newLinear } from "../scene/factory";
import { linearPatch } from "../scene/linear";
import type { LinearElement, Pt } from "../scene/types";
import { finishDrawing } from "../state/operations";
import type { Store } from "../state/store";

/**
 * Line and arrow. Drag to draw a two-point line; or click (without dragging) to start a multi-point line,
 * click to add points, and finish with Enter / Escape / a click on the last point.
 * While drawing, the last point is a "preview" point that follows the pointer.
 */
export class LinearTool implements ToolHandler {
  private id: string | null = null;
  private multi = false;
  private downScreen: Point = [0, 0];

  constructor(
    private store: Store,
    private type: LinearElement["type"],
  ) {}

  private get el(): LinearElement | undefined {
    return this.id ? (this.store.scene.get(this.id) as LinearElement | undefined) : undefined;
  }

  /** Shift snaps the segment to 15-degree steps from the previous point. */
  private constrain(e: PointerInfo, prev: Point): Point {
    if (!e.shiftKey) return e.scene;
    const dx = e.scene[0] - prev[0];
    const dy = e.scene[1] - prev[1];
    const len = Math.hypot(dx, dy);
    const a = snapAngle(Math.atan2(dy, dx));
    return [prev[0] + len * Math.cos(a), prev[1] + len * Math.sin(a)];
  }

  private abs(el: LinearElement, i: number): Point {
    return [el.x + el.points[i][0], el.y + el.points[i][1]];
  }

  private setLast(el: LinearElement, p: Point) {
    const pts = el.points.slice();
    pts[pts.length - 1] = [p[0] - el.x, p[1] - el.y];
    this.store.scene.update(el.id, linearPatch(pts));
  }

  down(e: PointerInfo) {
    this.downScreen = e.screen;
    const el = this.el;
    if (this.multi && el) {
      const fixedLast = this.abs(el, el.points.length - 2);
      // Clicking on the last placed point (or double-clicking) finishes the line.
      if (el.points.length >= 3 && distance(e.scene, fixedLast) * this.store.state.zoom < 8) {
        this.finalize();
        return;
      }
      const p = this.constrain(e, fixedLast);
      const pts = el.points.slice();
      pts[pts.length - 1] = [p[0] - el.x, p[1] - el.y];
      pts.push([p[0] - el.x, p[1] - el.y]);
      this.store.scene.update(el.id, linearPatch(pts));
      return;
    }
    const created = newLinear(this.type, e.scene[0], e.scene[1], this.store.state.currentItem);
    this.store.scene.add(created);
    this.id = created.id;
    this.multi = false;
    this.store.select([]);
  }

  move(e: PointerInfo) {
    const el = this.el;
    if (!el) return;
    this.setLast(el, this.constrain(e, this.abs(el, el.points.length - 2)));
  }

  hover(e: PointerInfo) {
    const el = this.el;
    if (!el || !this.multi) return;
    this.setLast(el, this.constrain(e, this.abs(el, el.points.length - 2)));
  }

  up(e: PointerInfo) {
    if (!this.el || this.multi) return;
    if (distance(this.downScreen, e.screen) >= 4) this.finalize(false);
    else this.multi = true; // a click: keep going, adding points
  }

  /** `dropPreview`: in multi-point mode the last point is only a preview and is removed. */
  private finalize(dropPreview = true) {
    const el = this.el;
    const zoom = this.store.state.zoom;
    this.id = null;
    this.multi = false;
    if (!el) return;
    const pts: Pt[] = el.points.slice();
    if (dropPreview) pts.pop();
    while (pts.length >= 2 && distance(pts[pts.length - 1], pts[pts.length - 2]) * zoom < 2) pts.pop();
    if (pts.length < 2) {
      this.store.scene.remove(el.id);
      return;
    }
    this.store.scene.update(el.id, linearPatch(pts));
    this.store.select([el.id]);
    this.store.commit();
    finishDrawing(this.store);
  }

  keyDown(e: KeyboardEvent): boolean {
    if (!this.id) return false;
    if (e.key === "Enter") {
      this.finalize(this.multi);
      return true;
    }
    if (e.key === "Escape") {
      if (this.multi) this.finalize(true);
      else this.cancel();
      return true;
    }
    return false;
  }

  deactivate() {
    if (this.id) this.finalize(this.multi);
  }

  cancel() {
    if (this.id) this.store.scene.remove(this.id);
    this.id = null;
    this.multi = false;
  }
}
