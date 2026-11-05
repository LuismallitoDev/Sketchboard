import type { Box } from "../geometry/bounds";
import type { Point } from "../geometry/math";
import { clearGuides, snapPointer } from "../input/snapping";
import type { PointerInfo, ToolHandler } from "../input/types";
import { createStickyNote, STICKY_SIZE } from "../state/rich";
import type { Store } from "../state/store";

/** Click to place a sticky note (or drag to size one); its text editor opens straight away. */
export class StickyTool implements ToolHandler {
  private origin: Point | null = null;

  constructor(private store: Store) {}

  private box(a: Point, b: Point): Box {
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
  }

  down(e: PointerInfo) {
    this.origin = snapPointer(this.store, e.scene, new Set(), e.ctrlKey || e.metaKey);
    this.store.select([]);
  }

  move(e: PointerInfo) {
    if (!this.origin) return;
    // The rubber band shows the size the note will get.
    this.store.setState({ selectionBox: this.box(this.origin, snapPointer(this.store, e.scene, new Set(), e.ctrlKey || e.metaKey)) });
  }

  up(e: PointerInfo) {
    const origin = this.origin;
    this.origin = null;
    this.store.setState({ selectionBox: null });
    clearGuides(this.store);
    if (!origin) return;
    let box = this.box(origin, snapPointer(this.store, e.scene, new Set(), e.ctrlKey || e.metaKey));
    if (Math.max(box.width, box.height) * this.store.state.zoom < 12) {
      // A click: a square note centred on it.
      box = { x: origin[0] - STICKY_SIZE / 2, y: origin[1] - STICKY_SIZE / 2, width: STICKY_SIZE, height: STICKY_SIZE };
    }
    clearGuides(this.store);
    createStickyNote(this.store, box);
  }

  cancel() {
    this.origin = null;
    this.store.setState({ selectionBox: null });
  }
}
