import { topElementAt, topShapeContaining } from "../geometry/hit";
import { createTextAt } from "../tools/TextTool";
import { EraserTool } from "../tools/EraserTool";
import { FreedrawTool } from "../tools/FreedrawTool";
import { HandTool } from "../tools/HandTool";
import { LinearTool } from "../tools/LinearTool";
import { BucketTool, LaserTool, LassoTool } from "../tools/EffectTools";
import { SelectionTool } from "../tools/SelectionTool";
import { ShapeTool } from "../tools/ShapeTool";
import { StickyTool } from "../tools/StickyTool";
import { TextTool } from "../tools/TextTool";
import type { ToolType } from "../state/appState";
import { finishTextEdit, startBoundTextEdit, startLinearEdit, startTextEdit } from "../state/operations";
import { activateEmbed, finishFrameRename, openEmbedDialog, startCrop, startFrameRename } from "../state/rich";
import type { Store } from "../state/store";
import type { PointerInfo, ToolHandler } from "./types";

/** Routes pointer and key input to the handler of the active tool. */
export class InteractionController {
  private tools: Record<ToolType, ToolHandler>;
  private selection: SelectionTool;
  private hand: HandTool;
  private active: ToolHandler | null = null;
  private spaceDown = false;
  private lastTool: ToolType;

  constructor(private store: Store) {
    this.selection = new SelectionTool(store);
    this.hand = new HandTool(store);
    this.tools = {
      selection: this.selection,
      hand: this.hand,
      rectangle: new ShapeTool(store, "rectangle"),
      diamond: new ShapeTool(store, "diamond"),
      ellipse: new ShapeTool(store, "ellipse"),
      arrow: new LinearTool(store, "arrow"),
      line: new LinearTool(store, "line"),
      freedraw: new FreedrawTool(store),
      text: new TextTool(store),
      eraser: new EraserTool(store),
      frame: new ShapeTool(store, "frame"),
      sticky: new StickyTool(store),
      embed: new ShapeTool(store, "embeddable"),
      laser: new LaserTool(store),
      lasso: new LassoTool(store),
      autoshape: new FreedrawTool(store, true),
      bucket: new BucketTool(store),
    };
    this.lastTool = store.state.tool;
    this.updateCursor();
    store.subscribe(() => {
      const t = store.state.tool;
      if (t !== this.lastTool) {
        this.tools[this.lastTool].deactivate?.();
        this.lastTool = t;
        this.updateCursor();
      }
    });
  }

  setSpace(down: boolean) {
    if (this.spaceDown === down) return;
    this.spaceDown = down;
    this.updateCursor();
  }

  pointerDown(e: PointerInfo) {
    if (e.button !== 0 && e.button !== 1) return;
    if (this.store.state.editingTextId) finishTextEdit(this.store);
    // A press on the canvas takes the mouse back from an interactive embed and ends renaming a frame.
    if (this.store.state.activeEmbedId) activateEmbed(this.store, null);
    if (this.store.state.editingFrameId) finishFrameRename(this.store);
    const panning = e.button === 1 || this.spaceDown;
    this.active = panning ? this.hand : this.tools[this.store.state.tool];
    this.active.down(e);
  }

  pointerMove(e: PointerInfo) {
    if (this.active) {
      this.active.move(e);
      return;
    }
    this.tools[this.store.state.tool].hover?.(e);
    this.updateCursor(e);
  }

  pointerUp(e: PointerInfo) {
    const a = this.active;
    this.active = null;
    a?.up(e);
    this.updateCursor(e);
  }

  pointerCancel() {
    this.active?.cancel();
    this.active = null;
  }

  /**
   * Double-click with the selection tool: on text edits it; on a shape (outline or inside) edits its label; on an
   * arrow edits its label (Ctrl/Cmd: its points); on a line edits its points; on empty canvas creates new text.
   */
  doubleClick(e: PointerInfo) {
    const store = this.store;
    if (store.state.tool !== "selection" || store.state.editingLinearId) return;
    const visible = store.scene.visible();
    const hit = topElementAt(visible, e.scene, 6 / store.state.zoom, store.state.frameRendering);
    if (hit) {
      if (hit.type === "text") startTextEdit(store, hit.id, false);
      else if (hit.type === "line") startLinearEdit(store, hit.id);
      else if (hit.type === "arrow") {
        if (e.ctrlKey || e.metaKey) startLinearEdit(store, hit.id);
        else startBoundTextEdit(store, hit);
      } else if (hit.type === "frame") startFrameRename(store, hit.id);
      else if (hit.type === "image") startCrop(store, hit.id);
      else if (hit.type === "embeddable") openEmbedDialog(store, hit.id);
      else if (hit.type !== "freedraw") startBoundTextEdit(store, hit);
      return;
    }
    const inside = topShapeContaining(visible, e.scene);
    if (inside) startBoundTextEdit(store, inside);
    else createTextAt(store, e.scene[0], e.scene[1]);
  }

  keyDown(e: KeyboardEvent): boolean {
    return this.tools[this.store.state.tool].keyDown?.(e) ?? false;
  }

  private updateCursor(e?: PointerInfo) {
    const tool = this.store.state.tool;
    let cursor: string;
    if (this.store.state.eyedropper) cursor = "crosshair";
    else if (this.spaceDown || tool === "hand") cursor = this.active === this.hand ? "grabbing" : "grab";
    else if (tool === "selection") cursor = e ? this.selection.cursorAt(e) : "default";
    else if (tool === "text") cursor = "text";
    else cursor = "crosshair";
    this.store.setState({ cursor });
  }
}
