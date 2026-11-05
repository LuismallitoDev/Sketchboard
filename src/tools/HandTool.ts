import type { Point } from "../geometry/math";
import type { PointerInfo, ToolHandler } from "../input/types";
import type { Store } from "../state/store";

/** Drag to pan the canvas (also used for Space+drag and the middle mouse button). */
export class HandTool implements ToolHandler {
  private start: Point | null = null;
  private origin: Point = [0, 0];

  constructor(private store: Store) {}

  down(e: PointerInfo) {
    this.start = e.screen;
    this.origin = [this.store.state.offsetX, this.store.state.offsetY];
    this.store.setState({ cursor: "grabbing" });
  }

  move(e: PointerInfo) {
    if (!this.start) return;
    this.store.setState({
      offsetX: this.origin[0] + e.screen[0] - this.start[0],
      offsetY: this.origin[1] + e.screen[1] - this.start[1],
    });
  }

  up() {
    this.start = null;
    this.store.setState({ cursor: "grab" });
  }

  cancel() {
    this.start = null;
  }
}
