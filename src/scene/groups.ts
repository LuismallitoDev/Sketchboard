import type { ElementPatches } from "../geometry/transform";
import { newId } from "./ids";
import { outerGroupId } from "./selection";
import type { SketchElement } from "./types";

/** Grouping needs two or more elements that are not already one and the same group. */
export function canGroup(selected: readonly SketchElement[]): boolean {
  if (selected.length < 2) return false;
  const outers = new Set(selected.map((e) => outerGroupId(e) ?? e.id));
  return outers.size > 1 || selected.some((e) => outerGroupId(e) === null);
}

/** Puts every selected element into one new group (the new id is the outermost, so existing groups nest inside). */
export function groupPatches(selected: readonly SketchElement[], groupId: string = newId()): ElementPatches {
  return selected.map((el) => [el.id, { groupIds: [...el.groupIds, groupId] }]);
}

export const canUngroup = (selected: readonly SketchElement[]): boolean => selected.some((e) => e.groupIds.length > 0);

/** Dissolves the outermost group of the selection (inner groups stay). `all` supplies labels that share the ids. */
export function ungroupPatches(selected: readonly SketchElement[], all: readonly SketchElement[]): ElementPatches {
  const outers = new Set(selected.map(outerGroupId).filter((g): g is string => g !== null));
  if (outers.size === 0) return [];
  return all
    .filter((e) => e.groupIds.some((g) => outers.has(g)))
    .map((e) => [e.id, { groupIds: e.groupIds.filter((g) => !outers.has(g)) }]);
}
