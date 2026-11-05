import { boundsOverlap, getElementBounds } from "../geometry/bounds";
import type { SketchElement } from "./types";

export type ZMove = "front" | "back" | "forward" | "backward";

/**
 * New back-to-front order after moving the selected elements. `forward`/`backward` hop over the nearest
 * element that overlaps the moved one (hopping over unrelated elements would change nothing visible).
 * Selected elements keep their relative order. Returns the full list of ids (deleted ones included).
 */
export function reorderZ(elements: readonly SketchElement[], selected: ReadonlySet<string>, move: ZMove): string[] {
  const arr = [...elements];
  const isSel = (e: SketchElement) => selected.has(e.id);

  if (move === "front") return [...arr.filter((e) => !isSel(e)), ...arr.filter(isSel)].map((e) => e.id);
  if (move === "back") return [...arr.filter(isSel), ...arr.filter((e) => !isSel(e))].map((e) => e.id);

  const hops = (a: SketchElement, b: SketchElement) => !b.isDeleted && !isSel(b) && boundsOverlap(getElementBounds(a), getElementBounds(b));

  if (move === "forward") {
    for (let i = arr.length - 2; i >= 0; i--) {
      if (!isSel(arr[i])) continue;
      for (let j = i + 1; j < arr.length; j++) {
        if (hops(arr[i], arr[j])) {
          const [el] = arr.splice(i, 1);
          arr.splice(j, 0, el); // after removing index i, index j now points just past the element we hopped over
          break;
        }
      }
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (!isSel(arr[i])) continue;
      for (let j = i - 1; j >= 0; j--) {
        if (hops(arr[i], arr[j])) {
          const [el] = arr.splice(i, 1);
          arr.splice(j, 0, el);
          break;
        }
      }
    }
  }
  return arr.map((e) => e.id);
}
