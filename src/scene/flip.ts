import { boxCenter, getCommonBounds, getLocalBox } from "../geometry/bounds";
import { normalizeAngle, type Point } from "../geometry/math";
import type { ElementPatches } from "../geometry/transform";
import { linearPatchFromAbs } from "./linear";
import { isPointsElement, type Pt, type SketchElement } from "./types";

/**
 * Mirrors the elements across the vertical (`h`) or horizontal (`v`) centre line of their common bounds.
 * Shapes and text change position and rotation direction (text glyphs are not mirrored); lines and pen strokes
 * have their points mirrored.
 */
export function flipPatches(els: readonly SketchElement[], axis: "h" | "v"): ElementPatches {
  const b = getCommonBounds(els);
  if (!b) return [];
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  return els.map((el): [string, Partial<SketchElement>] => {
    const box = getLocalBox(el);
    const ec = boxCenter(box);
    const nc: Point = axis === "h" ? [2 * cx - ec[0], ec[1]] : [ec[0], 2 * cy - ec[1]];
    const angle = normalizeAngle(-el.angle);
    if (isPointsElement(el)) {
      // Mirror each point about its own box centre, then move the box centre to the new place.
      const abs = el.points.map((p): Pt => {
        const x = el.x + p[0];
        const y = el.y + p[1];
        return axis === "h" ? [ec[0] + nc[0] - x, y + (nc[1] - ec[1])] : [x + (nc[0] - ec[0]), ec[1] + nc[1] - y];
      });
      return [el.id, { ...linearPatchFromAbs(abs), angle }];
    }
    // A mirrored picture is drawn mirrored (its own flip flags), on top of moving and turning like any element.
    const mirrored: Partial<SketchElement> =
      el.type === "image" ? { scale: axis === "h" ? [-el.scale[0], el.scale[1]] : [el.scale[0], -el.scale[1]] } : {};
    return [el.id, { x: nc[0] - box.width / 2, y: nc[1] - box.height / 2, angle, ...mirrored }];
  });
}
