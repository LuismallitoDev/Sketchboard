import type { SketchElement } from "../scene/types";
import { PERSISTED_KEYS, type AppState, type PersistedState } from "../state/appState";
import { restoreAppState, restoreElements } from "./restore";

export const FILE_TYPE = "sketchboard";
export const FILE_VERSION = 1;

export interface ParsedScene {
  elements: SketchElement[];
  appState: Partial<PersistedState>;
}

export function pickPersisted(state: AppState): PersistedState {
  const out = {} as Record<string, unknown>;
  for (const k of PERSISTED_KEYS) out[k] = state[k];
  return out as unknown as PersistedState;
}

/** Elements worth saving: not deleted, and no empty text left over from an unfinished edit. */
export function savableElements(elements: readonly SketchElement[]): SketchElement[] {
  return elements.filter((e) => !e.isDeleted && !(e.type === "text" && e.text.trim() === ""));
}

export function serializeScene(elements: readonly SketchElement[], appState: AppState): string {
  return JSON.stringify({
    type: FILE_TYPE,
    version: FILE_VERSION,
    elements: savableElements(elements),
    appState: pickPersisted(appState),
  });
}

/** Parses and validates a saved scene. Returns null when the text is not a Sketchboard scene. */
export function parseScene(text: string): ParsedScene | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type !== FILE_TYPE) return null;
  return { elements: restoreElements(d.elements), appState: restoreAppState(d.appState) };
}
