import { bowPoint } from "../geometry/curve";
import { distance, snapAngle, type Point } from "../geometry/math";
import { clearGuides, snapPointer } from "../input/snapping";
import type { PointerInfo, ToolHandler } from "../input/types";
import { findBindingTarget, type BindingTarget } from "../scene/binding";
import { newLinear } from "../scene/factory";
import { linearPatch } from "../scene/linear";
import type { LinearElement, Pt } from "../scene/types";
import { finishDrawing } from "../state/operations";
import type { Store } from "../state/store";

/**
 * Line and arrow. Drag to draw a two-point line; or click (without dragging) to start a multi-point line,
 * click to add points, and finish with Enter / Escape / a click on the last point.
 * While drawing, the last point is a "preview" point that follows the pointer.
 *
 * Arrow ends attach to the shapes they are dropped on (Ctrl/Cmd while dragging prevents it). An elbow arrow is only
 * ever drawn by dragging: its route is worked out from its two ends.
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

  private bypass = (e: PointerInfo) => e.ctrlKey || e.metaKey;

  /** The shape an arrow end at the pointer would attach to (also updates the highlight shown on it). */
  private target(e: PointerInfo, exclude?: string): BindingTarget | null {
    const s = this.store.state;
    let t: BindingTarget | null = null;
    if (this.type === "arrow" && s.arrowBinding && !this.bypass(e)) {
      t = findBindingTarget(this.store.scene.visible(), e.scene, s.zoom, new Set(exclude ? [exclude] : []), s.midpointSnapping);
    }
    const id = t?.shape.id ?? null;
    if (s.bindingHighlight !== id) this.store.setState({ bindingHighlight: id });
    return t;
  }

  /** A free pointer position: Shift locks the segment to 15-degree steps, otherwise snapping applies. */
  private free(e: PointerInfo, el: LinearElement | undefined): Point {
    if (e.shiftKey && el && el.arrowType !== "elbow") {
      const prev = this.abs(el, el.points.length - 2);
      const dx = e.scene[0] - prev[0];
      const dy = e.scene[1] - prev[1];
      const len = Math.hypot(dx, dy);
      const a = snapAngle(Math.atan2(dy, dx));
      return [prev[0] + len * Math.cos(a), prev[1] + len * Math.sin(a)];
    }
    return snapPointer(this.store, e.scene, new Set(this.id ? [this.id] : []), this.bypass(e));
  }

  private abs(el: LinearElement, i: number): Point {
    return [el.x + el.points[i][0], el.y + el.points[i][1]];
  }

  /** Moves the last point to the pointer, attaching it to a shape when it is over one. */
  private place(e: PointerInfo, el: LinearElement) {
    const t = this.target(e, el.startBinding?.elementId);
    const p = t ? e.scene : this.free(e, el);
    const pts = el.points.slice();
    pts[pts.length - 1] = [p[0] - el.x, p[1] - el.y];
    this.store.scene.update(el.id, { ...linearPatch(pts), ...(el.type === "arrow" ? { endBinding: t?.binding ?? null } : {}) });
  }

  down(e: PointerInfo) {
    this.downScreen = e.screen;
    const el = this.el;
    if (this.multi && el) {
      const fixedLast = this.abs(el, el.points.length - 2);
      const zoom = this.store.state.zoom;
      // Clicking while the end is over a shape finishes the arrow there.
      if (el.endBinding) {
        this.finalize(false);
        return;
      }
      // Clicking back on the first point of a line closes it into a polygon.
      if (this.type === "line" && el.points.length >= 4 && distance(e.scene, this.abs(el, 0)) * zoom < 8) {
        const pts = el.points.slice();
        pts[pts.length - 1] = [0, 0];
        this.store.scene.update(el.id, { ...linearPatch(pts), polygon: true });
        this.finalize(false);
        return;
      }
      // Clicking on the last placed point (or double-clicking) finishes the line.
      if (el.points.length >= 3 && distance(e.scene, fixedLast) * zoom < 8) {
        this.finalize();
        return;
      }
      const p = this.free(e, el);
      const pts = el.points.slice();
      pts[pts.length - 1] = [p[0] - el.x, p[1] - el.y];
      pts.push([p[0] - el.x, p[1] - el.y]);
      this.store.scene.update(el.id, { ...linearPatch(pts), ...(el.type === "arrow" ? { endBinding: null } : {}) });
      return;
    }
    const t = this.target(e);
    const start = t ? e.scene : snapPointer(this.store, e.scene, new Set(), this.bypass(e));
    const created = newLinear(this.type, start[0], start[1], this.store.state.currentItem);
    if (t) created.startBinding = t.binding;
    this.store.scene.add(created);
    this.id = created.id;
    this.multi = false;
    this.store.select([]);
  }

  move(e: PointerInfo) {
    const el = this.el;
    if (el) this.place(e, el);
  }

  hover(e: PointerInfo) {
    const el = this.el;
    if (el && this.multi) this.place(e, el);
  }

  up(e: PointerInfo) {
    const el = this.el;
    if (!el || this.multi) return;
    if (distance(this.downScreen, e.screen) >= 4) this.finalize(false);
    else if (el.arrowType === "elbow") this.cancel(); // an elbow arrow needs a drag
    else this.multi = true; // a click: keep going, adding points
  }

  /** `dropPreview`: in multi-point mode the last point is only a preview and is removed. */
  private finalize(dropPreview = true) {
    const el = this.el;
    const zoom = this.store.state.zoom;
    this.id = null;
    this.multi = false;
    this.store.setState({ bindingHighlight: null });
    clearGuides(this.store);
    if (!el) return;
    const pts: Pt[] = el.points.slice();
    if (dropPreview) pts.pop();
    while (pts.length >= 2 && distance(pts[pts.length - 1], pts[pts.length - 2]) * zoom < 2) pts.pop();
    if (pts.length < 2) {
      this.store.scene.remove(el.id);
      return;
    }
    // A curved two-point line or arrow has nothing to bend yet: give it a gentle bow.
    if (el.arrowType === "round" && pts.length === 2) {
      const mid = bowPoint([el.x + pts[0][0], el.y + pts[0][1]], [el.x + pts[1][0], el.y + pts[1][1]], 0.2);
      pts.splice(1, 0, [mid[0] - el.x, mid[1] - el.y]);
    }
    // The dropped preview point carried the end attachment, so it goes with it.
    this.store.scene.update(el.id, { ...linearPatch(pts), ...(dropPreview && el.type === "arrow" ? { endBinding: null } : {}) });
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
    this.store.setState({ bindingHighlight: null });
    clearGuides(this.store);
  }
}
