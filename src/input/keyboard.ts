import { actions } from "../actions";
import { nudgeSelected } from "../state/operations";
import type { Store } from "../state/store";
import type { InteractionController } from "./controller";

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

/** Window-level keyboard shortcuts. Returns a cleanup function. */
export function installKeyboard(store: Store, controller: InteractionController): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    if (e.key === " " && !e.ctrlKey && !e.metaKey) {
      controller.setSpace(true);
      e.preventDefault();
      return;
    }
    if (controller.keyDown(e)) {
      e.preventDefault();
      return;
    }
    const arrow = ARROWS[e.key];
    if (arrow && !e.ctrlKey && !e.metaKey && !e.altKey && store.state.selectedIds.length > 0) {
      const step = e.shiftKey ? 5 : 1;
      nudgeSelected(store, arrow[0] * step, arrow[1] * step);
      e.preventDefault();
      return;
    }
    for (const a of actions) {
      if (a.keyTest?.(e) && (a.enabled?.(store) ?? true)) {
        e.preventDefault();
        a.perform(store);
        return;
      }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") controller.setSpace(false);
  };
  const onBlur = () => controller.setSpace(false);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}
