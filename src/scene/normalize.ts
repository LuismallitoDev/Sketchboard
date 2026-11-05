import { syncArrowBindings } from "./binding";
import { syncBoundTexts } from "./boundText";
import type { Scene } from "./scene";

/**
 * Everything that is derived from other elements and must be re-derived after every change. Arrows follow their
 * shapes, labels follow their containers and arrows; a label that makes its container grow moves the arrows
 * attached to it, hence the second round.
 */
export function normalizeScene(scene: Scene): void {
  syncArrowBindings(scene);
  syncBoundTexts(scene);
  syncArrowBindings(scene);
  syncBoundTexts(scene);
}
