import type { Bounds } from "../geometry/bounds";
import { clamp, type Point } from "../geometry/math";
import { MAX_ZOOM, MIN_ZOOM } from "../scene/constants";
import type { AppState } from "./appState";

type View = Pick<AppState, "offsetX" | "offsetY" | "zoom">;

export const screenToScene = (s: View, x: number, y: number): Point => [(x - s.offsetX) / s.zoom, (y - s.offsetY) / s.zoom];
export const sceneToScreen = (s: View, x: number, y: number): Point => [x * s.zoom + s.offsetX, y * s.zoom + s.offsetY];

/** New view after zooming to `newZoom` while keeping the scene point under screen (sx, sy) fixed. */
export function zoomAt(s: View, sx: number, sy: number, newZoom: number): View {
  const zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const k = zoom / s.zoom;
  return { zoom, offsetX: sx - (sx - s.offsetX) * k, offsetY: sy - (sy - s.offsetY) * k };
}

/** View that centres `bounds` in a viewport of the given size, zooming to fit (never beyond 100%). */
export function fitBoundsView(bounds: Bounds, width: number, height: number, padding = 64, maxZoom = 1): View {
  const bw = Math.max(bounds[2] - bounds[0], 1);
  const bh = Math.max(bounds[3] - bounds[1], 1);
  const zoom = clamp(Math.min((width - padding * 2) / bw, (height - padding * 2) / bh, maxZoom), MIN_ZOOM, MAX_ZOOM);
  const cx = (bounds[0] + bounds[2]) / 2;
  const cy = (bounds[1] + bounds[3]) / 2;
  return { zoom, offsetX: width / 2 - cx * zoom, offsetY: height / 2 - cy * zoom };
}
