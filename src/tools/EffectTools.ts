import { distance } from "../geometry/math";
import type { PointerInfo, ToolHandler } from "../input/types";
import { bucketFillAt, selectInLasso } from "../state/rich";
import type { Store } from "../state/store";

/** Bucket fill: click a closed shape to give it the current background colour. */
export class BucketTool implements ToolHandler {
  constructor(private store: Store) {}

  down(e: PointerInfo) {
    bucketFillAt(this.store, e.scene);
  }
  move() {}
  up() {}
  cancel() {}
}

/** Laser pointer: leaves a bright trail that fades by itself. Nothing is added to the drawing. */
export class LaserTool implements ToolHandler {
  private drawing = false;

  constructor(private store: Store) {}

  private add(e: PointerInfo) {
    const now = performance.now();
    const keep = this.store.state.laserTrail.filter((p) => now - p.t < 1500).slice(-400);
    this.store.setState({ laserTrail: [...keep, { x: e.scene[0], y: e.scene[1], t: now }] });
  }

  down(e: PointerInfo) {
    this.drawing = true;
    this.add(e);
  }
  move(e: PointerInfo) {
    if (this.drawing) this.add(e);
  }
  up() {
    this.drawing = false;
  }
  cancel() {
    this.drawing = false;
  }
}

/** Lasso: draw a loop freehand; releasing selects what it encloses or crosses. */
export class LassoTool implements ToolHandler {
  private path: [number, number][] = [];

  constructor(private store: Store) {}

  down(e: PointerInfo) {
    this.path = [[e.scene[0], e.scene[1]]];
    this.store.select([]);
    this.store.setState({ lassoPath: this.path });
  }

  move(e: PointerInfo) {
    const last = this.path[this.path.length - 1];
    if (!last || distance(last, e.scene) * this.store.state.zoom < 3) return;
    this.path = [...this.path, [e.scene[0], e.scene[1]]];
    this.store.setState({ lassoPath: this.path });
  }

  up() {
    const path = this.path;
    this.path = [];
    this.store.setState({ lassoPath: [] });
    selectInLasso(this.store, path);
  }

  cancel() {
    this.path = [];
    this.store.setState({ lassoPath: [] });
  }
}
