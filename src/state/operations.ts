import { getCommonBounds } from "../geometry/bounds";
import { measureText } from "../geometry/text";
import { cloneElements } from "../scene/factory";
import { MAX_ZOOM, MIN_ZOOM } from "../scene/constants";
import type { ItemStyle, SketchElement, TextElement } from "../scene/types";
import type { Theme, ToolType } from "./appState";
import type { Store } from "./store";
import { stylePatchFor } from "./style";
import { fitBoundsView, zoomAt } from "./viewport";

export function selectedElements(store: Store): SketchElement[] {
  const ids = new Set(store.state.selectedIds);
  return store.scene.visible().filter((e) => ids.has(e.id));
}

export function setTool(store: Store, tool: ToolType) {
  if (store.state.editingTextId) finishTextEdit(store);
  // Picking a drawing tool (or the eraser) clears the selection; the hand tool and selection tool keep it.
  const keepSelection = tool === "selection" || tool === "hand";
  store.setState({ tool, selectedIds: keepSelection ? store.state.selectedIds : [], selectionBox: null });
}

/** After drawing one element: go back to the selection tool unless the tool is locked. */
export function finishDrawing(store: Store) {
  if (!store.state.toolLocked) store.setState({ tool: "selection" });
}

export function selectAll(store: Store) {
  store.select(store.scene.visible().filter((e) => !e.locked).map((e) => e.id));
}

export function deleteSelected(store: Store) {
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  store.scene.batch(() => {
    for (const el of sel) store.scene.update(el.id, { isDeleted: true });
  });
  store.select([]);
  store.commit();
}

export function duplicateSelected(store: Store) {
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  const copies = cloneElements(sel, 10, 10);
  store.scene.batch(() => copies.forEach((c) => store.scene.add(c)));
  store.select(copies.map((c) => c.id));
  store.commit();
}

export function nudgeSelected(store: Store, dx: number, dy: number) {
  const sel = selectedElements(store).filter((e) => !e.locked);
  if (sel.length === 0) return;
  store.scene.batch(() => {
    for (const el of sel) store.scene.update(el.id, { x: el.x + dx, y: el.y + dy });
  });
  store.commit();
}

/** Changes the style of the selection and of the "next element" defaults. */
export function applyItemStyle(store: Store, patch: Partial<ItemStyle>) {
  store.setState({ currentItem: { ...store.state.currentItem, ...patch } });
  const sel = selectedElements(store);
  if (sel.length === 0) return;
  store.scene.batch(() => {
    for (const el of sel) {
      const p = stylePatchFor(el, patch);
      if (Object.keys(p).length === 0) continue;
      if (el.type === "text" && (patch.fontSize || patch.fontFamily)) {
        const m = measureText(el.text, patch.fontSize ?? el.fontSize, patch.fontFamily ?? el.fontFamily, el.lineHeight);
        Object.assign(p, { width: m.width, height: m.height });
      }
      store.scene.update(el.id, p);
    }
  });
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

// ---- viewport ----

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

// ---- text editing ----

export function startTextEdit(store: Store, id: string, isNew: boolean) {
  store.setState({ editingTextId: id, editingIsNew: isNew, selectedIds: [id] });
}

/** Ends the text editor: empty text is dropped, otherwise the change is committed. */
export function finishTextEdit(store: Store) {
  const id = store.state.editingTextId;
  if (!id) return;
  const isNew = store.state.editingIsNew;
  const el = store.scene.get(id) as TextElement | undefined;
  store.setState({ editingTextId: null, editingIsNew: false });
  if (!el) return;
  if (el.text.trim() === "") {
    if (isNew) store.scene.remove(id);
    else store.scene.update(id, { isDeleted: true });
    store.select([]);
  } else {
    store.select([id]);
    if (isNew) finishDrawing(store);
  }
  store.commit();
}
