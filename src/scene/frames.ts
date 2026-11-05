import { boxCenter, getLocalBox, isPointInBox, type Box } from "../geometry/bounds";
import { isBoundText } from "./selection";
import type { FrameElement, SketchElement } from "./types";

export const isFrame = (el: SketchElement | undefined): el is FrameElement => !!el && el.type === "frame";

/** The next free "Frame N" name. */
export function nextFrameName(elements: readonly SketchElement[]): string {
  let max = 0;
  for (const e of elements) {
    if (e.type !== "frame" || e.isDeleted || !e.name) continue;
    const m = /^Frame (\d+)$/.exec(e.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Frame ${max + 1}`;
}

export const frameBox = (f: SketchElement): Box => getLocalBox(f);

/** The topmost frame that contains the point, or null. */
export function frameAt(frames: readonly FrameElement[], p: readonly [number, number]): FrameElement | null {
  for (let i = frames.length - 1; i >= 0; i--) if (isPointInBox(p, frameBox(frames[i]))) return frames[i];
  return null;
}

/** The elements that live in the frames among `els` (labels follow their containers on their own). */
export function framedChildren(visible: readonly SketchElement[], frameIds: ReadonlySet<string>): SketchElement[] {
  return visible.filter((e) => e.frameId !== null && frameIds.has(e.frameId) && !isBoundText(e) && e.type !== "frame");
}

/** `els` plus everything inside the frames among them (what moves, is copied or is deleted with a frame). */
export function withFrameChildren(visible: readonly SketchElement[], els: readonly SketchElement[]): SketchElement[] {
  const frameIds = new Set(els.filter((e) => e.type === "frame").map((e) => e.id));
  if (frameIds.size === 0) return [...els];
  const have = new Set(els.map((e) => e.id));
  return [...els, ...framedChildren(visible, frameIds).filter((e) => !have.has(e.id))];
}

/** Did the element's position or size change between two versions? (Used to decide when to re-check its frame.) */
export function geometryChanged(prev: SketchElement | undefined, cur: SketchElement): boolean {
  if (!prev) return true;
  if (prev.x !== cur.x || prev.y !== cur.y || prev.width !== cur.width || prev.height !== cur.height || prev.angle !== cur.angle) return true;
  return "points" in prev && "points" in cur && prev.points !== cur.points;
}

/**
 * The frame ids elements should have after an edit. An element belongs to the topmost frame that contains its
 * centre, but only elements that moved or changed size are re-checked (so "remove from frame" sticks until the
 * element is moved again), unless a frame itself moved or was resized, in which case everything is re-checked.
 * Elements whose frame no longer exists lose it. Returns only the elements whose frame changes.
 */
export function frameAssignments(
  visible: readonly SketchElement[],
  previous: (id: string) => SketchElement | undefined,
): Array<[string, string | null]> {
  const frames = visible.filter(isFrame);
  const frameIds = new Set(frames.map((f) => f.id));
  const frameChanged = frames.some((f) => geometryChanged(previous(f.id), f));
  const out: Array<[string, string | null]> = [];
  for (const el of visible) {
    if (el.type === "frame" || isBoundText(el)) continue;
    let want: string | null | undefined;
    if (el.frameId && !frameIds.has(el.frameId)) want = null;
    else if (frameChanged || geometryChanged(previous(el.id), el)) want = frameAt(frames, boxCenter(getLocalBox(el)))?.id ?? null;
    if (want !== undefined && want !== el.frameId) out.push([el.id, want]);
  }
  return out;
}
