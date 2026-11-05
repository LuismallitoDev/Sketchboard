import { addImageBlob, fitWithin, getImageEntry } from "../data/files";
import { getCommonBounds, getElementBounds, type Box } from "../geometry/bounds";
import { hitElement, isInsideShape, linearPath } from "../geometry/hit";
import { pointInPolygon, type Point } from "../geometry/math";
import { recognizeShape } from "../geometry/recognize";
import { parseEmbedUrl } from "../embed/embed";
import { newFrame, newImage, newLinear, newShape } from "../scene/factory";
import { framedChildren, nextFrameName } from "../scene/frames";
import { linearPatch } from "../scene/linear";
import { isBoundText } from "../scene/selection";
import type { FrameElement, FreedrawElement, ImageElement, ItemStyle, Pt, SketchElement } from "../scene/types";
import { editSelected, finishDrawing, selectedElements, selectIds, startBoundTextEdit } from "./operations";
import type { Store } from "./store";
import { screenToScene } from "./viewport";

// ---------------------------------------------------------------------------------------------- notices

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short message at the bottom of the screen for a few seconds. */
export function showNotice(store: Store, message: string) {
  store.setState({ notice: message });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => store.setState({ notice: null }), 4500);
}

// ---------------------------------------------------------------------------------------------- images

/** The longest side a newly inserted picture gets on the canvas. */
const INSERT_MAX_SIDE = 560;

/**
 * Stores a picture file and puts it on the canvas, centred on `centre` (the middle of the view by default), and
 * selects it. Unsupported or oversized files give a message instead.
 */
export async function insertImageFile(store: Store, file: Blob, centre?: Point): Promise<ImageElement | null> {
  try {
    const entry = await addImageBlob(file);
    const size = fitWithin(entry.width, entry.height, INSERT_MAX_SIDE);
    const s = store.state;
    const c = centre ?? screenToScene(s, s.width / 2, s.height / 2);
    const el = newImage(c[0] - size.width / 2, c[1] - size.height / 2, size.width, size.height, entry.id);
    store.scene.add(el);
    store.select([el.id]);
    store.commit();
    finishDrawing(store);
    return el;
  } catch (e) {
    showNotice(store, e instanceof Error ? e.message : "The image could not be added.");
    return null;
  }
}

/** Crop mode: drag the handles to cut the picture down (or widen the crop again). */
export function startCrop(store: Store, id: string) {
  const el = store.scene.get(id);
  if (!el || el.type !== "image" || el.locked || !getImageEntry(el.fileId)) return;
  store.setState({ croppingId: id, selectedIds: [id] });
}

export function exitCrop(store: Store) {
  if (!store.state.croppingId) return;
  store.setState({ croppingId: null });
  store.commit();
}

// ---------------------------------------------------------------------------------------------- frames

/** Adds a frame with the next free name and returns it. */
export function addFrame(store: Store, box: Box): FrameElement {
  const frame = newFrame(box.x, box.y, box.width, box.height, nextFrameName(store.scene.all()));
  store.scene.add(frame);
  return frame;
}

/** Draws a frame around the selected elements (everything inside it becomes part of the frame). */
export function wrapSelectionInFrame(store: Store) {
  const sel = selectedElements(store).filter((e) => e.type !== "frame");
  const b = getCommonBounds(sel);
  if (!b) return;
  const pad = 24;
  const frame = addFrame(store, { x: b[0] - pad, y: b[1] - pad, width: b[2] - b[0] + pad * 2, height: b[3] - b[1] + pad * 2 });
  store.select([frame.id]);
  store.commit(); // puts the elements inside it into the frame
}

const selectedFrameIds = (store: Store) => new Set(selectedElements(store).filter((e) => e.type === "frame").map((e) => e.id));

export function selectAllInFrame(store: Store) {
  const kids = framedChildren(store.scene.visible(), selectedFrameIds(store));
  if (kids.length > 0) selectIds(store, kids.map((k) => k.id), true);
}

/** Takes the selected elements, or everything in the selected frames, out of their frames. */
export function removeFromFrame(store: Store) {
  const sel = selectedElements(store);
  const targets = new Map<string, SketchElement>();
  for (const k of framedChildren(store.scene.visible(), selectedFrameIds(store))) targets.set(k.id, k);
  for (const e of sel) if (e.type !== "frame" && e.frameId) targets.set(e.id, e);
  if (targets.size === 0) return;
  store.scene.batch(() => targets.forEach((_, id) => store.scene.update(id, { frameId: null })));
  store.commit();
}

export function startFrameRename(store: Store, id: string) {
  const el = store.scene.get(id);
  if (el?.type === "frame" && !el.locked) store.setState({ editingFrameId: id, selectedIds: [id] });
}

export function finishFrameRename(store: Store, name?: string) {
  const id = store.state.editingFrameId;
  if (!id) return;
  store.setState({ editingFrameId: null });
  if (name === undefined) return;
  const el = store.scene.get(id);
  const next = name.trim() === "" ? null : name.trim();
  if (el?.type === "frame" && el.name !== next) {
    store.scene.update(id, { name: next });
    store.commit();
  }
}

/** Renames the selected frame (used by the properties panel). */
export function renameFrame(store: Store, id: string, name: string) {
  const el = store.scene.get(id);
  if (el?.type !== "frame") return;
  store.scene.update(id, { name: name === "" ? null : name });
}

// ---------------------------------------------------------------------------------------------- embeds

export const EMBED_ERROR = "That address cannot be embedded. Use a YouTube, Vimeo, Figma, CodePen, Google Maps, Docs or Slides link.";

export function openEmbedDialog(store: Store, id: string) {
  store.setState({ dialog: "embed", embedDraftId: id, selectedIds: [id] });
}

/** Gives the embed its address. Returns an error message when the address is not allowed. */
export function confirmEmbed(store: Store, input: string): string | null {
  const id = store.state.embedDraftId;
  if (!id) return null;
  if (!parseEmbedUrl(input)) return EMBED_ERROR;
  store.scene.update(id, { link: input.trim() });
  store.setState({ dialog: null, embedDraftId: null, activeEmbedId: null });
  store.select([id]);
  store.commit();
  finishDrawing(store);
  return null;
}

/** Closes the address dialog. A new embed that never got an address is removed again. */
export function cancelEmbed(store: Store) {
  const id = store.state.embedDraftId;
  const el = id ? store.scene.get(id) : undefined;
  store.setState({ dialog: null, embedDraftId: null });
  if (el && !el.link) {
    store.scene.remove(el.id);
    store.select([]);
  }
}

export function activateEmbed(store: Store, id: string | null) {
  if (store.state.activeEmbedId !== id) store.setState({ activeEmbedId: id });
}

/** What Enter does with one selected element: pictures are cropped, frames renamed, embeds given a new address. */
export function editSelectedAny(store: Store, pointsMode: boolean): boolean {
  const sel = selectedElements(store);
  if (sel.length === 1 && !sel[0].locked) {
    const el = sel[0];
    if (el.type === "image") startCrop(store, el.id);
    else if (el.type === "frame") startFrameRename(store, el.id);
    else if (el.type === "embeddable") openEmbedDialog(store, el.id);
    else return editSelected(store, pointsMode);
    return true;
  }
  return editSelected(store, pointsMode);
}

// ---------------------------------------------------------------------------------------------- bucket fill

/** Fills the closed shape under the point with the current background colour. Returns false when there is none. */
export function bucketFillAt(store: Store, p: Point): boolean {
  const els = store.scene.visible();
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (el.locked) continue;
    const closed = el.type === "line" && el.polygon ? pointInPolygon(p, linearPath(el)) : isInsideShape(el, p);
    if (!closed) continue;
    store.scene.update(el.id, { backgroundColor: store.state.currentItem.backgroundColor });
    store.commit();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------- lasso

/** Selects what the lasso loop encloses or crosses. */
export function selectInLasso(store: Store, path: readonly (readonly [number, number])[]) {
  if (path.length < 3) return;
  const poly = path as readonly Point[];
  const reach = 6 / store.state.zoom;
  const picked: string[] = [];
  for (const el of store.scene.visible()) {
    if (el.locked || isBoundText(el)) continue;
    const [x1, y1, x2, y2] = getElementBounds(el);
    const keys: Point[] = [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [(x1 + x2) / 2, (y1 + y2) / 2],
    ];
    // Enclosed (a corner or the middle is inside the loop) or crossed (the loop's outline touches the element).
    if (keys.some((k) => pointInPolygon(k, poly)) || poly.some((v) => hitElement(el, v, reach))) picked.push(el.id);
  }
  selectIds(store, picked);
}

// ---------------------------------------------------------------------------------------------- draw to shape

/**
 * Replaces a freehand stroke with the clean shape it was meant to be (rectangle, ellipse, diamond, line, arrow or
 * polygon), drawn in the stroke's colour and width. Returns false (and leaves the stroke) when it is not recognised.
 */
export function convertStrokeToShape(store: Store, id: string): boolean {
  const stroke = store.scene.get(id) as FreedrawElement | undefined;
  if (!stroke || stroke.type !== "freedraw") return false;
  const abs: Point[] = stroke.points.map((p): Point => [stroke.x + p[0], stroke.y + p[1]]);
  const rec = recognizeShape(abs);
  if (!rec) return false;

  const style: ItemStyle = {
    ...store.state.currentItem,
    strokeColor: stroke.strokeColor,
    strokeWidth: stroke.strokeWidth,
    roughness: stroke.roughness,
    opacity: stroke.opacity,
    backgroundColor: "transparent",
    lineCurved: false,
    arrowType: "sharp",
  };
  let created: SketchElement;
  if ("box" in rec) {
    created = { ...newShape(rec.kind, rec.box.x, rec.box.y, style), width: rec.box.width, height: rec.box.height };
  } else if (rec.kind === "polygon") {
    const [first] = rec.points;
    const rel = [...rec.points, first].map((p): Pt => [p[0] - first[0], p[1] - first[1]]);
    created = { ...newLinear("line", first[0], first[1], style, rel), ...linearPatch(rel), polygon: true };
  } else {
    const [a, b] = rec.points;
    created = newLinear(rec.kind, a[0], a[1], style, [
      [0, 0],
      [b[0] - a[0], b[1] - a[1]],
    ]);
  }
  store.scene.batch(() => {
    store.scene.remove(id);
    store.scene.add(created);
  });
  store.select([created.id]);
  return true;
}

// ---------------------------------------------------------------------------------------------- sticky notes

export const STICKY_COLOR = "#fef08a";
export const STICKY_SIZE = 180;

/** A square note in the sticky colour with its text editor open. */
export function createStickyNote(store: Store, box: Box) {
  const style: ItemStyle = { ...store.state.currentItem, backgroundColor: STICKY_COLOR, fillStyle: "solid", roundness: false };
  const note = { ...newShape("rectangle", box.x, box.y, style), width: box.width, height: box.height };
  store.scene.add(note);
  store.select([note.id]);
  store.setState({ tool: "selection" });
  startBoundTextEdit(store, note);
}
