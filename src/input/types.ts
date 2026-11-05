import type { Point } from "../geometry/math";

/** A pointer event translated to scene and screen coordinates. */
export interface PointerInfo {
  scene: Point;
  /** CSS pixels relative to the canvas. */
  screen: Point;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  button: number;
  pressure: number;
  pointerType: string;
  timeStamp: number;
}

/** One handler per tool. `down/move/up` run for a pointer drag; `hover` runs while no button is pressed. */
export interface ToolHandler {
  down(e: PointerInfo): void;
  move(e: PointerInfo): void;
  up(e: PointerInfo): void;
  cancel(): void;
  hover?(e: PointerInfo): void;
  /** The tool was switched away (finish any in-progress element). */
  deactivate?(): void;
  /** Return true when the key was handled. */
  keyDown?(e: KeyboardEvent): boolean;
}
