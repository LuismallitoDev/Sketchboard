import { hitElement } from "../geometry/hit";
import { distance, type Point } from "../geometry/math";
import type { PointerInfo, ToolHandler } from "../input/types";
import type { Store } from "../state/store";

/** Drag across elements to mark them (faded); they are deleted on release. Hold Alt to un-mark. */
export class EraserTool implements ToolHandler {
  private ids = new Set<string>();
  private last: Point | null = null;

  constructor(private store: Store) {}

  private sample(p: Point, revert: boolean) {
    const tol = 5 / this.store.state.zoom;
    for (const el of this.store.scene.visible()) {
      // Labels are erased with their container; frames are removed by deleting them (which takes their contents).
      if (el.locked || el.type === "frame" || (el.type === "text" && el.containerId)) continue;
      if (hitElement(el, p, tol)) {
        if (revert) this.ids.delete(el.id);
        else this.ids.add(el.id);
      }
    }
  }

  private publish() {
    this.store.setState({ erasingIds: [...this.ids] });
  }

  down(e: PointerInfo) {
    this.ids.clear();
    this.last = e.scene;
    this.sample(e.scene, e.altKey);
    this.publish();
  }

  move(e: PointerInfo) {
    if (!this.last) return;
    const step = 3 / this.store.state.zoom;
    const n = Math.max(1, Math.ceil(distance(this.last, e.scene) / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.sample([this.last[0] + (e.scene[0] - this.last[0]) * t, this.last[1] + (e.scene[1] - this.last[1]) * t], e.altKey);
    }
    this.last = e.scene;
    this.publish();
  }

  up() {
    const ids = [...this.ids];
    this.ids.clear();
    this.last = null;
    this.store.setState({ erasingIds: [] });
    if (ids.length === 0) return;
    this.store.scene.batch(() => {
      for (const id of ids) this.store.scene.update(id, { isDeleted: true });
    });
    this.store.select([]);
    this.store.commit();
  }

  cancel() {
    this.ids.clear();
    this.last = null;
    this.store.setState({ erasingIds: [] });
  }
}
