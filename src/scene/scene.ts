import { newNonce } from "./ids";
import type { SketchElement } from "./types";

/**
 * The element list. Elements are treated as immutable: every change replaces the object (and bumps `version`),
 * which lets the renderer cache per object and history diff by reference. Deleted elements stay in the list
 * (`isDeleted`) so undo can restore them at the same z-position.
 */
export class Scene {
  private list: SketchElement[] = [];
  private index = new Map<string, SketchElement>();
  private snap: readonly SketchElement[] | null = null;
  private vis: readonly SketchElement[] | null = null;
  private listeners = new Set<() => void>();
  private depth = 0;
  private dirty = false;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private touch() {
    this.snap = null;
    this.vis = null;
    if (this.depth > 0) this.dirty = true;
    else this.emit();
  }

  private emit() {
    this.dirty = false;
    for (const l of [...this.listeners]) l();
  }

  /** Group several changes into one notification. */
  batch(fn: () => void) {
    this.depth++;
    try {
      fn();
    } finally {
      this.depth--;
      if (this.depth === 0 && this.dirty) this.emit();
    }
  }

  /** Every element including deleted ones, in z-order (back to front). The array identity changes on every change. */
  all(): readonly SketchElement[] {
    return (this.snap ??= this.list.slice());
  }

  visible(): readonly SketchElement[] {
    return (this.vis ??= this.list.filter((e) => !e.isDeleted));
  }

  get(id: string): SketchElement | undefined {
    return this.index.get(id);
  }

  add(el: SketchElement) {
    this.list.push(el);
    this.index.set(el.id, el);
    this.touch();
  }

  /** Replaces the element with an updated copy (version bumped). Returns the new element. */
  update(id: string, patch: Partial<SketchElement>): SketchElement | undefined {
    const old = this.index.get(id);
    if (!old) return undefined;
    const next = { ...old, ...patch, version: old.version + 1, versionNonce: newNonce() } as SketchElement;
    this.list[this.list.indexOf(old)] = next;
    this.index.set(id, next);
    this.touch();
    return next;
  }

  /** Swaps in an element object as-is (used by history). Appends when the id is new. */
  replace(el: SketchElement) {
    const old = this.index.get(el.id);
    if (!old) return this.add(el);
    this.list[this.list.indexOf(old)] = el;
    this.index.set(el.id, el);
    this.touch();
  }

  /** Hard removal (never-committed elements). Committed elements are soft-deleted with `isDeleted`. */
  remove(id: string) {
    const old = this.index.get(id);
    if (!old) return;
    this.list.splice(this.list.indexOf(old), 1);
    this.index.delete(id);
    this.touch();
  }

  setAll(els: readonly SketchElement[]) {
    this.list = [...els];
    this.index = new Map(els.map((e) => [e.id, e]));
    this.touch();
  }

  /** Puts the listed ids first-to-last in that order; any other elements keep their relative order after them. */
  reorder(ids: readonly string[]) {
    const seen = new Set<string>();
    const next: SketchElement[] = [];
    for (const id of ids) {
      const el = this.index.get(id);
      if (el && !seen.has(id)) {
        seen.add(id);
        next.push(el);
      }
    }
    for (const el of this.list) if (!seen.has(el.id)) next.push(el);
    this.list = next;
    this.touch();
  }
}
