import { topElementAt } from "../geometry/hit";
import { createTextAt } from "../tools/TextTool";
import { EraserTool } from "../tools/EraserTool";
import { FreedrawTool } from "../tools/FreedrawTool";
import { HandTool } from "../tools/HandTool";
import { LinearTool } from "../tools/LinearTool";
import { SelectionTool } from "../tools/SelectionTool";
import { ShapeTool } from "../tools/ShapeTool";
import { TextTool } from "../tools/TextTool";
import type { ToolType } from "../state/appState";
import { finishTextEdit, startTextEdit } from "../state/operations";
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

  /** Double-click with the selection tool edits text under the pointer, or creates new text on empty canvas. */
  doubleClick(e: PointerInfo) {
    if (this.store.state.tool !== "selection") return;
    const hit = topElementAt(this.store.scene.visible(), e.scene, 6 / this.store.state.zoom);
    if (hit?.type === "text") startTextEdit(this.store, hit.id, false);
    else if (!hit) createTextAt(this.store, e.scene[0], e.scene[1]);
  }

  keyDown(e: KeyboardEvent): boolean {
    return this.tools[this.store.state.tool].keyDown?.(e) ?? false;
  }

  private updateCursor(e?: PointerInfo) {
    const tool = this.store.state.tool;
    let cursor: string;
    if (this.spaceDown || tool === "hand") cursor = this.active === this.hand ? "grabbing" : "grab";
    else if (tool === "selection") cursor = e ? this.selection.cursorAt(e) : "default";
    else if (tool === "text") cursor = "text";
    else cursor = "crosshair";
    this.store.setState({ cursor });
  }
}
