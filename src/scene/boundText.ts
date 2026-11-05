import { boxCenter, getLocalBox } from "../geometry/bounds";
import { sampleCurve, pointAtHalfLength } from "../geometry/curve";
import { rotatePoint, type Point } from "../geometry/math";
import { layoutText } from "../geometry/text";
import type { Scene } from "./scene";
import type { SketchElement, TextElement } from "./types";

/** Space kept between a label and the edge of its container. */
export const TEXT_PADDING = 6;
const MIN_INNER = 12;

/** The area inside a container that its label may use (an ellipse or diamond is smaller than its box). */
export function containerInnerSize(c: SketchElement): { width: number; height: number } {
  const p = TEXT_PADDING;
  let w = c.width - 2 * p;
  let h = c.height - 2 * p;
  if (c.type === "ellipse") {
    w = c.width / Math.SQRT2 - p;
    h = c.height / Math.SQRT2 - p;
  } else if (c.type === "diamond") {
    w = c.width / 2 - p;
    h = c.height / 2 - p;
  }
  return { width: Math.max(MIN_INNER, w), height: Math.max(MIN_INNER, h) };
}

/** Container height needed so that a label of height `textHeight` fits inside. */
export function containerHeightFor(c: SketchElement, textHeight: number): number {
  const p = TEXT_PADDING;
  if (c.type === "ellipse") return (textHeight + p) * Math.SQRT2;
  if (c.type === "diamond") return (textHeight + p) * 2;
  return textHeight + 2 * p;
}

/** Scene position of the middle of an arrow (halfway along its path), where its label sits. */
export function arrowLabelCenter(arrow: SketchElement): Point {
  if (arrow.type !== "arrow" && arrow.type !== "line") return boxCenter(getLocalBox(arrow));
  const abs: Point[] = arrow.points.map((p): Point => [arrow.x + p[0], arrow.y + p[1]]);
  const path = arrow.arrowType === "round" && abs.length >= 3 ? sampleCurve(abs) : abs;
  const mid = pointAtHalfLength(path);
  return arrow.angle ? rotatePoint(mid, boxCenter(getLocalBox(arrow)), arrow.angle) : mid;
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

// The normalizer runs on every pointer move, so remember layouts of unchanged labels instead of re-measuring them.
const layoutCache = new Map<string, ReturnType<typeof layoutText>>();
function cachedLayout(t: TextElement, maxWidth: number | null) {
  const key = `${t.fontSize}|${t.fontFamily}|${t.lineHeight}|${maxWidth}|${t.text}`;
  let m = layoutCache.get(key);
  if (!m) {
    if (layoutCache.size > 400) layoutCache.clear();
    m = layoutText(t.text, t.fontSize, t.fontFamily, t.lineHeight, maxWidth);
    layoutCache.set(key, m);
  }
  return m;
}

/** Labels (bound text) of a container, in scene order. */
export function boundTextsOf(all: readonly SketchElement[], containerId: string): TextElement[] {
  return all.filter((e): e is TextElement => e.type === "text" && e.containerId === containerId && !e.isDeleted);
}

/**
 * Scene normalizer: lays every label out inside its container (wrapping, growing the container, centring,
 * following its rotation), mirrors the container's group and lock state, drops labels whose container is gone,
 * and keeps each label directly above its container in the z-order.
 */
export function syncBoundTexts(scene: Scene): void {
  const all = scene.all();
  if (!all.some((e) => e.type === "text" && e.containerId)) return;

  for (const snapshot of all) {
    if (snapshot.type !== "text" || !snapshot.containerId) continue;
    const text = scene.get(snapshot.id) as TextElement;
    let container = scene.get(text.containerId!);
    if (!container || container.isDeleted) {
      if (!text.isDeleted && container) scene.update(text.id, { isDeleted: true });
      continue;
    }
    if (text.isDeleted) continue;

    let patch: Partial<TextElement>;
    if (container.type === "arrow") {
      const m = cachedLayout(text, null);
      const c = arrowLabelCenter(container);
      patch = {
        x: c[0] - m.width / 2,
        y: c[1] - m.height / 2,
        width: m.width,
        height: m.height,
        angle: 0,
        wrapWidth: null,
        autoResize: true,
      };
    } else {
      const inner = containerInnerSize(container);
      const m = cachedLayout(text, inner.width);
      const needed = containerHeightFor(container, m.height);
      if (needed > container.height + 0.01) container = scene.update(container.id, { height: needed })!;
      const c = boxCenter(getLocalBox(container));
      patch = {
        x: c[0] - m.width / 2,
        y: c[1] - m.height / 2,
        width: m.width,
        height: m.height,
        angle: container.angle,
        wrapWidth: inner.width,
        autoResize: false,
        verticalAlign: "middle",
      };
    }

    const ww = patch.wrapWidth ?? null;
    const sameGroups = text.groupIds.length === container.groupIds.length && text.groupIds.every((g, i) => g === container!.groupIds[i]);
    const unchanged =
      close(text.x, patch.x!) &&
      close(text.y, patch.y!) &&
      close(text.width, patch.width!) &&
      close(text.height, patch.height!) &&
      close(text.angle, patch.angle!) &&
      (text.wrapWidth === ww || (text.wrapWidth !== null && ww !== null && close(text.wrapWidth, ww))) &&
      text.autoResize === patch.autoResize &&
      sameGroups &&
      text.locked === container.locked &&
      text.frameId === container.frameId;
    if (!unchanged) scene.update(text.id, { ...patch, groupIds: [...container.groupIds], locked: container.locked, frameId: container.frameId });
  }

  enforceLabelOrder(scene);
}

/** Puts every label right after its container so it is always drawn on top of it. */
function enforceLabelOrder(scene: Scene) {
  const list = scene.all();
  const labelsOf = new Map<string, SketchElement[]>();
  for (const e of list) {
    if (e.type === "text" && e.containerId && scene.get(e.containerId)) {
      labelsOf.set(e.containerId, [...(labelsOf.get(e.containerId) ?? []), e]);
    }
  }
  if (labelsOf.size === 0) return;
  const desired: string[] = [];
  for (const e of list) {
    if (e.type === "text" && e.containerId && scene.get(e.containerId)) continue;
    desired.push(e.id);
    for (const t of labelsOf.get(e.id) ?? []) desired.push(t.id);
  }
  if (desired.some((id, i) => id !== list[i].id)) scene.reorder(desired);
}
