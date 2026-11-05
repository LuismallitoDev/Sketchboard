import { clamp, rotatePoint, type Point } from "./math";
import { HANDLE_DIRS, type ResizeHandle } from "./transform";
import type { ImageCrop, ImageElement } from "../scene/types";

/** Smallest crop, in the picture's own pixels. */
export const MIN_CROP = 8;

/** The crop of an image: the explicit one, or the whole picture. */
export function cropOf(el: ImageElement, natural: { width: number; height: number }): ImageCrop {
  return (
    el.crop ?? {
      x: 0,
      y: 0,
      width: natural.width,
      height: natural.height,
      naturalWidth: natural.width,
      naturalHeight: natural.height,
    }
  );
}

/** Scene units per picture pixel along each axis for the element as it is cropped now. */
export const cropScale = (el: ImageElement, crop: ImageCrop): [number, number] => [el.width / crop.width, el.height / crop.height];

/**
 * The element after dragging a crop handle to `pointer` (scene coordinates, already corrected for where the
 * handle was grabbed). Only the dragged edges move; the picture stays where it is on the canvas, so the visible part
 * shrinks or grows around it. Works for rotated and mirrored images. Null when nothing can change.
 */
export function cropAfterDrag(
  el: ImageElement,
  handle: ResizeHandle,
  pointer: Point,
  natural: { width: number; height: number },
): Partial<ImageElement> {
  const crop = cropOf(el, natural);
  const [kx, ky] = cropScale(el, crop);
  const [fx, fy] = el.scale;
  const centre: Point = [el.x + el.width / 2, el.y + el.height / 2];
  const q = rotatePoint(pointer, centre, -el.angle); // the pointer in the element's own unrotated frame

  // Display position to picture pixel (a mirrored image reads right to left).
  const toX = (u: number) => (fx === 1 ? crop.x + (u - el.x) / kx : crop.x + (el.x + el.width - u) / kx);
  const toY = (v: number) => (fy === 1 ? crop.y + (v - el.y) / ky : crop.y + (el.y + el.height - v) / ky);

  // Only the dragged edges move. Each is clamped to the picture and kept at least MIN_CROP from the edge that stays.
  const [dx, dy] = HANDLE_DIRS[handle];
  let x1 = crop.x;
  let x2 = crop.x + crop.width;
  let y1 = crop.y;
  let y2 = crop.y + crop.height;
  if (dx !== 0) {
    const n = toX(q[0]);
    if (fx === 1 ? dx === -1 : dx === 1) x1 = clamp(n, 0, x2 - MIN_CROP);
    else x2 = clamp(n, x1 + MIN_CROP, crop.naturalWidth);
  }
  if (dy !== 0) {
    const n = toY(q[1]);
    if (fy === 1 ? dy === -1 : dy === 1) y1 = clamp(n, 0, y2 - MIN_CROP);
    else y2 = clamp(n, y1 + MIN_CROP, crop.naturalHeight);
  }

  const next: ImageCrop = { ...crop, x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  const width = next.width * kx;
  const height = next.height * ky;

  // The picture must not move: put the new visible area's centre where that part of the picture is now.
  const ncx = x1 + next.width / 2;
  const ncy = y1 + next.height / 2;
  const ux = fx === 1 ? el.x + (ncx - crop.x) * kx : el.x + el.width - (ncx - crop.x) * kx;
  const uy = fy === 1 ? el.y + (ncy - crop.y) * ky : el.y + el.height - (ncy - crop.y) * ky;
  const world = rotatePoint([ux, uy], centre, el.angle);
  return { crop: next, width, height, x: world[0] - width / 2, y: world[1] - height / 2 };
}
