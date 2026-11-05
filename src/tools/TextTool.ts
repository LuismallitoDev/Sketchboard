import { topElementAt } from "../geometry/hit";
import type { PointerInfo, ToolHandler } from "../input/types";
import { LINE_HEIGHT } from "../scene/constants";
import { newText } from "../scene/factory";
import { startTextEdit } from "../state/operations";
import type { Store } from "../state/store";

/**
 * Click to type. The editor opens on pointer *up*: opening it on pointer down would lose focus again when the
 * browser finishes the mouse-down.
 */
export class TextTool implements ToolHandler {
  constructor(private store: Store) {}

  down() {}
  move() {}

  up(e: PointerInfo) {
    const s = this.store.state;
    const hit = topElementAt(this.store.scene.visible(), e.scene, 6 / s.zoom);
    if (hit?.type === "text") {
      startTextEdit(this.store, hit.id, false);
      return;
    }
    createTextAt(this.store, e.scene[0], e.scene[1]);
  }

  cancel() {}
}

/** New empty text with its editor open; its vertical centre sits on the click point. */
export function createTextAt(store: Store, x: number, y: number) {
  const style = store.state.currentItem;
  const el = newText(x, y - (style.fontSize * LINE_HEIGHT) / 2, style, "");
  store.scene.add(el);
  startTextEdit(store, el.id, true);
}
