import type { SketchElement } from "./types";

export const isBoundText = (el: SketchElement): boolean => el.type === "text" && el.containerId !== null;

export const outerGroupId = (el: SketchElement): string | null => el.groupIds[el.groupIds.length - 1] ?? null;

/**
 * Turns clicked/listed ids into the ids that are actually selected:
 * - a label (bound text) selects its container instead,
 * - with `groups`, an element selects every member of its outermost group.
 * Returns ids in z-order.
 */
export function resolveSelection(visible: readonly SketchElement[], ids: readonly string[], opts: { groups: boolean }): string[] {
  const byId = new Map(visible.map((e) => [e.id, e]));
  const out = new Set<string>();
  for (const id of ids) {
    let el = byId.get(id);
    if (!el) continue;
    if (el.type === "text" && el.containerId) {
      const container = byId.get(el.containerId);
      if (container) el = container;
    }
    const outer = outerGroupId(el);
    if (opts.groups && outer) {
      for (const m of visible) if (m.groupIds.includes(outer) && !isBoundText(m)) out.add(m.id);
    } else {
      out.add(el.id);
    }
  }
  return visible.filter((e) => out.has(e.id)).map((e) => e.id);
}

/** The given elements plus the labels bound to them (needed when copying or duplicating containers). */
export function withBoundTexts(visible: readonly SketchElement[], els: readonly SketchElement[]): SketchElement[] {
  const ids = new Set(els.map((e) => e.id));
  const extra = visible.filter((e) => e.type === "text" && e.containerId !== null && ids.has(e.containerId) && !ids.has(e.id));
  return [...els, ...extra];
}

/** Elements from the box that count as selected: whole groups only when every member is inside the box. */
export function groupAwareBoxSelection(visible: readonly SketchElement[], insideIds: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const el of visible) {
    if (isBoundText(el) || !insideIds.has(el.id)) continue;
    const outer = outerGroupId(el);
    if (outer) {
      const members = visible.filter((m) => m.groupIds.includes(outer) && !isBoundText(m));
      if (!members.every((m) => insideIds.has(m.id))) continue;
    }
    out.push(el.id);
  }
  return out;
}
