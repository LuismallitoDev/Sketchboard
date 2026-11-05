import { boxCenter, getCommonBounds, getLocalBox } from "../geometry/bounds";
import { bowPoint } from "../geometry/curve";
import { rotatePoint, type Point } from "../geometry/math";
import { layoutPatchForText } from "../geometry/text";
import type { ElementPatches } from "../geometry/transform";
import { linearAbsPoints, removePointsPatch } from "../geometry/linearEdit";
import { alignPatches, distributePatches, type AlignKind } from "../scene/align";
import { boundTextsOf } from "../scene/boundText";
import { MAX_ZOOM, MIN_ZOOM } from "../scene/constants";
import { cloneElements, newShape, newText } from "../scene/factory";
import { flipPatches } from "../scene/flip";
import { canGroup, canUngroup, groupPatches, ungroupPatches } from "../scene/groups";
import { linearPatch, linearPatchFromAbs } from "../scene/linear";
import { isBoundText, resolveSelection, withBoundTexts } from "../scene/selection";
import type { ItemStyle, LinearElement, Pt, SketchElement, TextElement } from "../scene/types";
import { reorderZ, type ZMove } from "../scene/zindex";
import type { Theme, ToolType } from "./appState";
import type { Store } from "./store";
import { stylePatchFor } from "./style";
import { fitBoundsView, zoomAt } from "./viewport";

// ---------------------------------------------------------------- selection

/** The selected elements (labels are never selected on their own: their container stands for them). */
export function selectedElements(store: Store): SketchElement[] {
  const ids = new Set(store.state.selectedIds);
  return store.scene.visible().filter((e) => ids.has(e.id));
}

/** Selects ids, widening to whole groups unless `deep` (Ctrl/Cmd-click selects one member of a group). */
export function selectIds(store: Store, ids: readonly string[], deep = false) {
  store.select(resolveSelection(store.scene.visible(), ids, { groups: !deep }));
}

export function selectAll(store: Store) {
  const visible = store.scene.visible();
  store.select(resolveSelection(visible, visible.filter((e) => !e.locked && !isBoundText(e)).map((e) => e.id), { groups: false }));
}

/** `boundElements` without the links matching `drop`; null when none are left. */
function withoutLinks(el: SketchElement, drop: (link: { id: string; type: "arrow" | "text" }) => boolean) {
  const rest = (el.boundElements ?? []).filter((b) => !drop(b));
  return rest.length > 0 ? rest : null;
}

function applyPatches(store: Store, patches: ElementPatches) {
  if (patches.length === 0) return false;
  store.scene.batch(() => patches.forEach(([id, p]) => store.scene.update(id, p)));
  return true;
}

// ---------------------------------------------------------------- tools

export function setTool(store: Store, tool: ToolType) {
  if (store.state.editingTextId) finishTextEdit(store);
  if (store.state.editingLinearId) exitLinearEdit(store);
  // Picking a drawing tool (or the eraser) clears the selection; the hand tool and selection tool keep it.
  const keepSelection = tool === "selection" || tool === "hand";
  store.setState({
    tool,
    selectedIds: keepSelection ? store.state.selectedIds : [],
    selectionBox: null,
    eyedropper: null,
  });
}

/** After drawing one element: go back to the selection tool unless the tool is locked. */
export function finishDrawing(store: Store) {
  if (!store.state.toolLocked) store.setState({ tool: "selection" });
}

// ---------------------------------------------------------------- basic edits

export function deleteSelected(store: Store) {
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  // Labels follow their container (the scene normalizer deletes them), so only containers are listed here.
  store.scene.batch(() => {
    for (const el of sel) store.scene.update(el.id, { isDeleted: true });
  });
  store.select([]);
  store.commit();
}

export function duplicateSelected(store: Store) {
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  const copies = cloneElements(withBoundTexts(store.scene.visible(), sel), 10, 10);
  store.scene.batch(() => copies.forEach((c) => store.scene.add(c)));
  store.select(copies.filter((c) => !isBoundText(c)).map((c) => c.id));
  store.commit();
}

/**
 * Before elements are moved by hand: arrows that move without the shapes they are attached to let go of them
 * (arrows that move together with their shapes stay attached).
 */
export function detachUnselectedArrows(store: Store, moving: readonly SketchElement[]) {
  const ids = new Set(moving.map((e) => e.id));
  const loose: Array<[string, Partial<LinearElement>]> = [];
  for (const el of moving) {
    if (el.type !== "arrow") continue;
    const patch: Partial<LinearElement> = {};
    if (el.startBinding && !ids.has(el.startBinding.elementId)) patch.startBinding = null;
    if (el.endBinding && !ids.has(el.endBinding.elementId)) patch.endBinding = null;
    if (Object.keys(patch).length > 0) loose.push([el.id, patch]);
  }
  if (loose.length > 0) store.scene.batch(() => loose.forEach(([id, p]) => store.scene.update(id, p)));
}

export function nudgeSelected(store: Store, dx: number, dy: number) {
  const sel = selectedElements(store).filter((e) => !e.locked);
  if (sel.length === 0) return;
  detachUnselectedArrows(store, sel);
  store.scene.batch(() => {
    for (const el of sel) store.scene.update(el.id, { x: el.x + dx, y: el.y + dy });
  });
  store.commit();
}

// ---------------------------------------------------------------- groups, layers, alignment, flip, lock

export function groupSelected(store: Store) {
  const sel = selectedElements(store);
  if (!canGroup(sel)) return;
  // Labels share their container's group (the normalizer copies it), so only containers are patched.
  applyPatches(store, groupPatches(sel));
  store.commit();
}

export function ungroupSelected(store: Store) {
  const sel = selectedElements(store);
  if (!canUngroup(sel)) return;
  const patches = ungroupPatches(sel, store.scene.visible());
  applyPatches(store, patches);
  store.commit();
}

export function moveSelectedZ(store: Store, move: ZMove) {
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  const order = reorderZ(store.scene.all(), new Set(sel.map((e) => e.id)), move);
  store.scene.reorder(order); // labels are put back above their containers by the normalizer
  store.commit();
}

export function alignSelected(store: Store, kind: AlignKind) {
  const sel = selectedElements(store);
  detachUnselectedArrows(store, sel);
  if (applyPatches(store, alignPatches(sel, kind))) store.commit();
}

export function distributeSelected(store: Store, axis: "h" | "v") {
  const sel = selectedElements(store);
  detachUnselectedArrows(store, sel);
  if (applyPatches(store, distributePatches(sel, axis))) store.commit();
}

export function flipSelected(store: Store, axis: "h" | "v") {
  const sel = selectedElements(store).filter((e) => !e.locked);
  detachUnselectedArrows(store, sel);
  if (applyPatches(store, flipPatches(sel, axis))) store.commit();
}

// ---------------------------------------------------------------- snapping and binding preferences

export type Preference = "arrowBinding" | "midpointSnapping" | "objectsSnap" | "gridMode";

export function togglePreference(store: Store, key: Preference) {
  store.setState({ [key]: !store.state[key] });
}

/** Locks the selection: locked elements cannot be selected, moved or erased until unlocked. */
export function lockSelected(store: Store) {
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  store.scene.batch(() => sel.forEach((e) => store.scene.update(e.id, { locked: true })));
  store.select([]);
  store.commit();
}

export function unlockAll(store: Store) {
  const locked = store.scene.visible().filter((e) => e.locked && !isBoundText(e));
  if (locked.length === 0) return;
  store.scene.batch(() => locked.forEach((e) => store.scene.update(e.id, { locked: false })));
  store.select(locked.map((e) => e.id));
  store.commit();
}

export const lockedCount = (store: Store): number => store.scene.visible().filter((e) => e.locked && !isBoundText(e)).length;

// ---------------------------------------------------------------- style

/** The drawing style an element currently has (for "copy style"). */
export function styleOfElement(el: SketchElement): Partial<ItemStyle> {
  const s: Partial<ItemStyle> = { strokeColor: el.strokeColor, opacity: el.opacity };
  if (el.type !== "text") s.strokeWidth = el.strokeWidth;
  if (el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse") {
    Object.assign(s, { backgroundColor: el.backgroundColor, fillStyle: el.fillStyle, roundness: el.roundness });
  }
  if (el.type !== "text" && el.type !== "freedraw") Object.assign(s, { strokeStyle: el.strokeStyle, roughness: el.roughness });
  if (el.type === "arrow") Object.assign(s, { startArrowhead: el.startArrowhead, endArrowhead: el.endArrowhead, arrowType: el.arrowType });
  if (el.type === "line") s.lineCurved = el.arrowType === "round";
  if (el.type === "freedraw") s.simulatePressure = el.simulatePressure;
  if (el.type === "text") Object.assign(s, { fontFamily: el.fontFamily, fontSize: el.fontSize, textAlign: el.textAlign });
  return s;
}

/**
 * Points a line or arrow needs after a style change: a curved one needs a middle point to bend (two-point ones get a
 * gentle bow), and an arrow leaving elbow mode keeps just its two ends (an elbow route is derived from them).
 */
function pointsAfterStyle(el: LinearElement, patch: Partial<ItemStyle>): Partial<LinearElement> | null {
  let abs: Point[] = linearAbsPoints(el);
  const before = abs.length;
  if (el.type === "arrow" && patch.arrowType !== undefined) {
    if (el.arrowType === "elbow" && patch.arrowType !== "elbow") abs = [abs[0], abs[abs.length - 1]];
    if (patch.arrowType === "round" && abs.length === 2) abs = [abs[0], bowPoint(abs[0], abs[1], 0.2), abs[1]];
  }
  if (el.type === "line" && patch.lineCurved === true && abs.length === 2) abs = [abs[0], bowPoint(abs[0], abs[1], 0.2), abs[1]];
  return abs.length === before ? null : linearPatchFromAbs(abs);
}

function styleElements(store: Store, els: readonly SketchElement[], patch: Partial<ItemStyle>) {
  store.scene.batch(() => {
    for (const el of els) {
      const p: Partial<SketchElement> = stylePatchFor(el, patch);
      if (el.type === "text" && !el.containerId && (patch.fontSize || patch.fontFamily)) {
        Object.assign(p, layoutPatchForText(el, { fontSize: patch.fontSize ?? el.fontSize, fontFamily: patch.fontFamily ?? el.fontFamily }));
      }
      if (el.type === "arrow" || el.type === "line") Object.assign(p, pointsAfterStyle(el, patch) ?? {});
      if (Object.keys(p).length > 0) store.scene.update(el.id, p);
    }
  });
}

/** Changes the style of the selection and of the "next element" defaults. */
export function applyItemStyle(store: Store, patch: Partial<ItemStyle>) {
  store.setState({ currentItem: { ...store.state.currentItem, ...patch } });
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  styleElements(store, sel, patch);
  store.commit();
}

export function copyStyle(store: Store) {
  const first = selectedElements(store)[0];
  if (first) store.setState({ copiedStyle: styleOfElement(first) });
}

export function pasteStyle(store: Store) {
  const style = store.state.copiedStyle;
  const sel = selectedElements(store);
  if (!style || sel.length === 0) return;
  styleElements(store, sel, style);
  store.commit();
}

export function setViewBackground(store: Store, color: string) {
  store.setState({ viewBackgroundColor: color });
}

export function setTheme(store: Store, theme: Theme) {
  store.setState({ theme });
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
}

export function toggleTheme(store: Store) {
  setTheme(store, resolveTheme(store.state.theme) === "dark" ? "light" : "dark");
}

// ---------------------------------------------------------------- shape conversion

const SHAPES = ["rectangle", "diamond", "ellipse"] as const;

/** Turns selected shapes into another shape, or selected lines into arrows (and back). */
export function convertSelectedType(store: Store, type: SketchElement["type"]) {
  const sel = selectedElements(store);
  const patches: ElementPatches = [];
  for (const el of sel) {
    if (el.type === type) continue;
    const isShape = (SHAPES as readonly string[]).includes(el.type);
    if (isShape && (SHAPES as readonly string[]).includes(type)) patches.push([el.id, { type } as Partial<SketchElement>]);
    else if ((el.type === "line" || el.type === "arrow") && (type === "line" || type === "arrow")) {
      patches.push([
        el.id,
        type === "arrow"
          ? { type, endArrowhead: store.state.currentItem.endArrowhead ?? "arrow", startArrowhead: null }
          : { type, startArrowhead: null, endArrowhead: null, polygon: el.polygon },
      ] as [string, Partial<SketchElement>]);
    }
  }
  if (applyPatches(store, patches)) store.commit();
}

// ---------------------------------------------------------------- text

/** Starts the in-place editor. A label is edited through its container, which stays the selection. */
export function startTextEdit(store: Store, id: string, isNew: boolean) {
  const el = store.scene.get(id);
  const selected = el?.type === "text" && el.containerId ? el.containerId : id;
  store.setState({ editingTextId: id, editingIsNew: isNew, selectedIds: [selected] });
}

// The container as it was before a new label was added to it, so cancelling leaves no trace in the history.
let containerBeforeLabel: SketchElement | null = null;

/** Edits the label of a shape or arrow, creating it first when there is none. */
export function startBoundTextEdit(store: Store, container: SketchElement) {
  const existing = boundTextsOf(store.scene.visible(), container.id)[0];
  if (existing) {
    startTextEdit(store, existing.id, false);
    return;
  }
  const style = { ...store.state.currentItem, strokeColor: container.strokeColor, textAlign: "center" as const };
  const label: TextElement = {
    ...newText(0, 0, style, ""),
    containerId: container.id,
    verticalAlign: "middle",
    autoResize: false,
    groupIds: [...container.groupIds],
  };
  containerBeforeLabel = container;
  store.scene.batch(() => {
    store.scene.add(label);
    store.scene.update(container.id, { boundElements: [...(container.boundElements ?? []), { id: label.id, type: "text" }] });
  });
  startTextEdit(store, label.id, true);
}

/** Ends the text editor: empty text is dropped, otherwise the change is committed. */
export function finishTextEdit(store: Store) {
  const id = store.state.editingTextId;
  if (!id) return;
  const isNew = store.state.editingIsNew;
  const el = store.scene.get(id) as TextElement | undefined;
  store.setState({ editingTextId: null, editingIsNew: false });
  if (!el) return;
  const container = el.containerId ? store.scene.get(el.containerId) : undefined;

  if (el.text.trim() === "") {
    if (isNew) store.scene.remove(id);
    else store.scene.update(id, { isDeleted: true });
    if (container) {
      if (isNew && containerBeforeLabel?.id === container.id) store.scene.replace(containerBeforeLabel);
      else store.scene.update(container.id, { boundElements: withoutLinks(container, (b) => b.id === id) });
    }
    store.select(container ? [container.id] : []);
  } else {
    store.select([container ? container.id : id]);
    if (isNew && !container) finishDrawing(store);
  }
  containerBeforeLabel = null;
  store.commit();
}

/** What Enter does with one selected element: edit its text, or its points (Ctrl/Cmd+Enter for arrows). */
export function editSelected(store: Store, pointsMode: boolean): boolean {
  const sel = selectedElements(store);
  if (sel.length !== 1) return false;
  const el = sel[0];
  if (el.locked) return false;
  if (el.type === "text") startTextEdit(store, el.id, false);
  else if (el.type === "line" || (el.type === "arrow" && pointsMode)) startLinearEdit(store, el.id);
  else if (el.type === "freedraw") return false;
  else startBoundTextEdit(store, el);
  return true;
}

/** Selected free-standing texts. */
const looseTexts = (sel: readonly SketchElement[]) => sel.filter((e): e is TextElement => e.type === "text" && !e.containerId);

/** Draws a rectangle around each selected free text and binds the text to it. */
export function wrapSelectedTextInContainer(store: Store) {
  const texts = looseTexts(selectedElements(store));
  if (texts.length === 0) return;
  const PAD = 14;
  const created: string[] = [];
  store.scene.batch(() => {
    for (const t of texts) {
      const box = {
        ...newShape("rectangle", t.x - PAD, t.y - PAD, { ...store.state.currentItem, backgroundColor: "transparent", strokeColor: t.strokeColor }),
        width: t.width + PAD * 2,
        height: t.height + PAD * 2,
        groupIds: [...t.groupIds],
        boundElements: [{ id: t.id, type: "text" as const }],
      };
      store.scene.add(box);
      store.scene.update(t.id, { containerId: box.id, autoResize: false, verticalAlign: "middle", textAlign: "center", wrapWidth: t.width });
      created.push(box.id);
    }
  });
  store.select(created);
  store.commit();
}

/** Can the selection be "one loose text + one shape or arrow without a label"? */
export function canBindText(sel: readonly SketchElement[], all: readonly SketchElement[]): boolean {
  if (sel.length !== 2) return false;
  const text = sel.find((e) => e.type === "text" && !e.containerId);
  const container = sel.find((e) => e.type !== "text" && e.type !== "freedraw" && e.type !== "line");
  return !!text && !!container && boundTextsOf(all, container.id).length === 0;
}

export function bindSelectedText(store: Store) {
  const sel = selectedElements(store);
  if (!canBindText(sel, store.scene.visible())) return;
  const text = sel.find((e) => e.type === "text") as TextElement;
  const container = sel.find((e) => e.type !== "text")!;
  store.scene.batch(() => {
    store.scene.update(text.id, { containerId: container.id, autoResize: false, verticalAlign: "middle", textAlign: "center" });
    store.scene.update(container.id, { boundElements: [...(container.boundElements ?? []), { id: text.id, type: "text" }] });
  });
  store.select([container.id]);
  store.commit();
}

export const hasBoundText = (store: Store, sel: readonly SketchElement[]): boolean =>
  sel.some((e) => boundTextsOf(store.scene.visible(), e.id).length > 0);

/** Detaches labels from the selected containers; each becomes free text where it is. */
export function unbindSelectedText(store: Store) {
  const sel = selectedElements(store);
  const labels = sel.flatMap((c) => boundTextsOf(store.scene.visible(), c.id));
  if (labels.length === 0) return;
  store.scene.batch(() => {
    for (const label of labels) {
      store.scene.update(label.id, { containerId: null, autoResize: true, wrapWidth: null, ...layoutPatchForText(label, { wrapWidth: null }) });
    }
    for (const c of sel) store.scene.update(c.id, { boundElements: withoutLinks(c, (b) => b.type === "text") });
  });
  store.select(labels.map((l) => l.id));
  store.commit();
}

/** Free text either fits its content ("auto") or wraps at a fixed width. */
export function setTextMode(store: Store, mode: "auto" | "fixed") {
  const texts = looseTexts(selectedElements(store));
  if (texts.length === 0) return;
  store.scene.batch(() => {
    for (const t of texts) {
      const wrapWidth = mode === "auto" ? null : Math.max(t.width, t.fontSize * 4);
      store.scene.update(t.id, { autoResize: mode === "auto", wrapWidth, ...layoutPatchForText(t, { wrapWidth }) });
    }
  });
  store.commit();
}

// ---------------------------------------------------------------- lines: points and polygons

export function startLinearEdit(store: Store, id: string) {
  const el = store.scene.get(id) as LinearElement | undefined;
  if (!el || (el.type !== "line" && el.type !== "arrow") || el.locked) return;
  if (el.angle !== 0) {
    // Editing works on unrotated points, so a rotation is applied to the points first.
    const c = boxCenter(getLocalBox(el));
    const abs = linearAbsPoints(el).map((p): Pt => {
      const r: Point = rotatePoint(p, c, el.angle);
      return [r[0], r[1]];
    });
    store.scene.update(id, { ...linearPatchFromAbs(abs), angle: 0 });
  }
  store.setState({ editingLinearId: id, selectedPoints: [], selectedIds: [id] });
}

export function exitLinearEdit(store: Store) {
  if (!store.state.editingLinearId) return;
  store.setState({ editingLinearId: null, selectedPoints: [] });
  store.commit();
}

/** Removes the selected points while editing a line. */
export function removeSelectedPoints(store: Store): boolean {
  const id = store.state.editingLinearId;
  const el = id ? (store.scene.get(id) as LinearElement | undefined) : undefined;
  if (!el || store.state.selectedPoints.length === 0) return false;
  const patch = removePointsPatch(el, store.state.selectedPoints);
  if (!patch) return true; // too few points would remain: ignore
  store.scene.update(el.id, patch);
  store.setState({ selectedPoints: [] });
  store.commit();
  return true;
}

/** Closes selected open lines into polygons, or opens closed ones again. */
export function togglePolygonSelected(store: Store) {
  const lines = selectedElements(store).filter((e): e is LinearElement => e.type === "line" && !e.locked);
  const patches: ElementPatches = [];
  for (const el of lines) {
    if (el.polygon) {
      patches.push([el.id, { ...linearPatch(el.points.slice(0, -1)), polygon: false }]);
    } else if (el.points.length >= 3) {
      patches.push([el.id, { ...linearPatch([...el.points, [0, 0] as Pt]), polygon: true }]);
    }
  }
  if (applyPatches(store, patches)) store.commit();
}

// ---------------------------------------------------------------- canvas

export function requestClearCanvas(store: Store) {
  store.setState({ dialog: "clear" });
}

export function closeDialog(store: Store) {
  store.setState({ dialog: null });
}

/** Removes every element (as one undoable step). */
export function confirmClearCanvas(store: Store) {
  const all = store.scene.visible();
  store.scene.batch(() => all.forEach((e) => store.scene.update(e.id, { isDeleted: true })));
  store.select([]);
  store.setState({ dialog: null, editingLinearId: null, selectedPoints: [] });
  store.commit();
}

// ---------------------------------------------------------------- eyedropper

export function startEyedropper(store: Store, target: "stroke" | "background") {
  store.setState({ eyedropper: { target, color: null, x: 0, y: 0 } });
}

export function cancelEyedropper(store: Store) {
  store.setState({ eyedropper: null });
}

export function pickEyedropperColor(store: Store, color: string) {
  const target = store.state.eyedropper?.target;
  store.setState({ eyedropper: null });
  if (!target) return;
  applyItemStyle(store, target === "stroke" ? { strokeColor: color } : { backgroundColor: color });
}

// ---------------------------------------------------------------- viewport

export function setZoom(store: Store, zoom: number, sx = store.state.width / 2, sy = store.state.height / 2) {
  const s = store.state;
  store.setState(zoomAt(s, sx, sy, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))));
}

export function zoomBy(store: Store, factor: number) {
  setZoom(store, store.state.zoom * factor);
}

export function resetZoom(store: Store) {
  setZoom(store, 1);
}

export function zoomToFit(store: Store, onlySelection = false) {
  const els = onlySelection && store.state.selectedIds.length ? selectedElements(store) : store.scene.visible();
  const b = getCommonBounds(els);
  if (!b) return resetView(store);
  store.setState(fitBoundsView(b, store.state.width, store.state.height, 64, onlySelection ? MAX_ZOOM : 1));
}

export function resetView(store: Store) {
  store.setState({ zoom: 1, offsetX: 0, offsetY: 0 });
}
