import { History } from "../history/history";
import { syncBoundTexts } from "../scene/boundText";
import { Scene } from "../scene/scene";
import { resolveSelection } from "../scene/selection";
import { defaultAppState, type AppState } from "./appState";

/** Scene + app state + history in one observable object. React reads it through useSyncExternalStore. */
export class Store {
  readonly scene = new Scene();
  readonly history: History;
  private current: AppState;
  private listeners = new Set<() => void>();
  private ver = 0;

  constructor(initial?: Partial<AppState>) {
    this.current = { ...defaultAppState(), ...initial };
    this.scene.addNormalizer(syncBoundTexts);
    // After undo/redo, select what changed (a label stands for its container).
    this.history = new History(this.scene, (ids) => this.select(resolveSelection(this.scene.visible(), ids, { groups: false })));
    this.scene.subscribe(() => this.notify());
  }

  get state(): AppState {
    return this.current;
  }

  setState = (patch: Partial<AppState>) => {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof AppState)[]) {
      if (!Object.is(this.current[k], patch[k])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.current = { ...this.current, ...patch };
    this.notify();
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** Increases on every scene or state change. */
  getVersion = (): number => this.ver;

  private notify() {
    this.ver++;
    for (const l of [...this.listeners]) l();
  }

  select(ids: readonly string[]) {
    const cur = this.current.selectedIds;
    if (cur.length === ids.length && cur.every((id, i) => id === ids[i])) return;
    this.setState({ selectedIds: [...ids] });
  }

  /** Records the changes since the last commit as one undo step. */
  commit(): boolean {
    return this.history.commit();
  }

  undo() {
    return this.history.undo();
  }

  redo() {
    return this.history.redo();
  }
}
