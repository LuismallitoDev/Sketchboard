import { newNonce } from "../scene/ids";
import type { Scene } from "../scene/scene";
import type { SketchElement } from "../scene/types";

interface Change {
  id: string;
  before: SketchElement | null;
  after: SketchElement | null;
}

interface Entry {
  changes: Change[];
  /** Full z-order before/after, only when the relative order of surviving elements changed. */
  orderBefore: string[] | null;
  orderAfter: string[] | null;
}

const MAX_ENTRIES = 200;

/**
 * Undo/redo as diffs: `commit()` compares the scene to the previous commit and stores only the elements that
 * changed (before/after). Undo applies the `before` side of those elements, so it never touches anything else
 * (important once other tabs edit the same scene).
 */
export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private snapshot = new Map<string, SketchElement>();
  private snapshotOrder: string[] = [];

  /** `onApplied` receives the ids that were changed by an undo/redo (so the UI can select them). */
  constructor(
    private scene: Scene,
    private onApplied: (ids: string[]) => void,
  ) {}

  /** Treat the current scene as the baseline and forget all history. */
  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this.takeSnapshot();
  }

  private takeSnapshot() {
    const all = this.scene.all();
    this.snapshot = new Map(all.map((e) => [e.id, e]));
    this.snapshotOrder = all.map((e) => e.id);
  }

  canUndo = () => this.undoStack.length > 0;
  canRedo = () => this.redoStack.length > 0;

  /** Records everything that changed since the last commit as one undo step. Returns false when nothing changed. */
  commit(): boolean {
    const all = this.scene.all();
    const changes: Change[] = [];
    const seen = new Set<string>();
    for (const el of all) {
      seen.add(el.id);
      const prev = this.snapshot.get(el.id);
      if (prev !== el) changes.push({ id: el.id, before: prev ?? null, after: el });
    }
    for (const [id, prev] of this.snapshot) if (!seen.has(id)) changes.push({ id, before: prev, after: null });

    const order = all.map((e) => e.id);
    const common = (ids: string[], other: Set<string>) => ids.filter((id) => other.has(id));
    const before = common(this.snapshotOrder, seen);
    const after = common(
      order,
      new Set(this.snapshotOrder),
    );
    const orderChanged = before.length !== after.length || before.some((id, i) => id !== after[i]);

    if (changes.length === 0 && !orderChanged) return false;
    this.undoStack.push({
      changes,
      orderBefore: orderChanged ? this.snapshotOrder : null,
      orderAfter: orderChanged ? order : null,
    });
    if (this.undoStack.length > MAX_ENTRIES) this.undoStack.shift();
    this.redoStack = [];
    this.takeSnapshot();
    return true;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.apply(entry, "undo");
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.apply(entry, "redo");
    this.undoStack.push(entry);
    return true;
  }

  private apply(entry: Entry, dir: "undo" | "redo") {
    const touched: string[] = [];
    this.scene.batch(() => {
      for (const c of entry.changes) {
        const target = dir === "undo" ? c.before : c.after;
        const current = this.scene.get(c.id);
        if (!target) {
          if (current) this.scene.remove(c.id);
          continue;
        }
        // Fresh version so renderer caches and sync never mistake restored content for a stale one.
        const next = { ...target, version: (current?.version ?? target.version) + 1, versionNonce: newNonce() } as SketchElement;
        this.scene.replace(next);
        if (!next.isDeleted) touched.push(next.id);
      }
      const order = dir === "undo" ? entry.orderBefore : entry.orderAfter;
      if (order) this.scene.reorder(order);
    });
    this.takeSnapshot();
    this.onApplied(touched);
  }
}
