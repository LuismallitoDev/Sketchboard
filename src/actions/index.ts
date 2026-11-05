import { t, type StringKey } from "../i18n";
import type { ToolType } from "../state/appState";
import {
  deleteSelected,
  duplicateSelected,
  resetZoom,
  selectAll,
  selectedElements,
  setTool,
  toggleTheme,
  zoomBy,
  zoomToFit,
} from "../state/operations";
import type { Store } from "../state/store";

/**
 * One registry for everything the user can trigger. Toolbar buttons, keyboard shortcuts and (later) the context
 * menu, command palette and help dialog all read from here, so a feature is defined once.
 */
export interface Action {
  name: string;
  label: string;
  /** Human-readable shortcut, shown in tooltips. */
  shortcut?: string;
  keyTest?: (e: KeyboardEvent) => boolean;
  enabled?: (store: Store) => boolean;
  perform: (store: Store) => void;
}

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;
const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_LABEL = isMac ? "⌘" : "Ctrl+";

export const TOOL_DEFS: { tool: ToolType; letter: string; digit?: string; label: StringKey }[] = [
  { tool: "hand", letter: "h", label: "tool.hand" },
  { tool: "selection", letter: "v", digit: "1", label: "tool.selection" },
  { tool: "rectangle", letter: "r", digit: "2", label: "tool.rectangle" },
  { tool: "diamond", letter: "d", digit: "3", label: "tool.diamond" },
  { tool: "ellipse", letter: "o", digit: "4", label: "tool.ellipse" },
  { tool: "arrow", letter: "a", digit: "5", label: "tool.arrow" },
  { tool: "line", letter: "l", digit: "6", label: "tool.line" },
  { tool: "freedraw", letter: "p", digit: "7", label: "tool.freedraw" },
  { tool: "text", letter: "t", digit: "8", label: "tool.text" },
  { tool: "eraser", letter: "e", digit: "0", label: "tool.eraser" },
];

const toolActions: Action[] = TOOL_DEFS.map((d) => ({
  name: `tool:${d.tool}`,
  label: t(d.label),
  shortcut: d.digit ? `${d.letter.toUpperCase()} or ${d.digit}` : d.letter.toUpperCase(),
  keyTest: (e) => plain(e) && (e.key.toLowerCase() === d.letter || e.key === d.digit),
  perform: (s) => setTool(s, d.tool),
}));

const hasSelection = (s: Store) => s.state.selectedIds.length > 0;

export const actions: Action[] = [
  ...toolActions,
  {
    name: "toolLock",
    label: t("tool.lock"),
    shortcut: "Q",
    keyTest: (e) => plain(e) && e.key.toLowerCase() === "q",
    perform: (s) => s.setState({ toolLocked: !s.state.toolLocked }),
  },
  {
    name: "undo",
    label: t("action.undo"),
    shortcut: `${MOD_LABEL}Z`,
    keyTest: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "z",
    enabled: (s) => s.history.canUndo(),
    perform: (s) => void s.undo(),
  },
  {
    name: "redo",
    label: t("action.redo"),
    shortcut: `${MOD_LABEL}Shift+Z`,
    keyTest: (e) => mod(e) && ((e.shiftKey && e.key.toLowerCase() === "z") || e.key.toLowerCase() === "y"),
    enabled: (s) => s.history.canRedo(),
    perform: (s) => void s.redo(),
  },
  {
    name: "delete",
    label: t("action.delete"),
    shortcut: "Delete",
    keyTest: (e) => (e.key === "Delete" || e.key === "Backspace") && !mod(e),
    enabled: hasSelection,
    perform: deleteSelected,
  },
  {
    name: "duplicate",
    label: t("action.duplicate"),
    shortcut: `${MOD_LABEL}D`,
    keyTest: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "d",
    enabled: hasSelection,
    perform: duplicateSelected,
  },
  {
    name: "selectAll",
    label: t("action.selectAll"),
    shortcut: `${MOD_LABEL}A`,
    keyTest: (e) => mod(e) && e.key.toLowerCase() === "a",
    perform: selectAll,
  },
  {
    name: "deselect",
    label: t("action.deselect"),
    shortcut: "Esc",
    keyTest: (e) => e.key === "Escape",
    perform: (s) => {
      if (hasSelection(s)) s.select([]);
      else if (s.state.tool !== "selection") setTool(s, "selection");
    },
  },
  {
    name: "zoomIn",
    label: t("action.zoomIn"),
    shortcut: `${MOD_LABEL}+`,
    keyTest: (e) => mod(e) && (e.key === "+" || e.key === "="),
    perform: (s) => zoomBy(s, 1.2),
  },
  {
    name: "zoomOut",
    label: t("action.zoomOut"),
    shortcut: `${MOD_LABEL}-`,
    keyTest: (e) => mod(e) && (e.key === "-" || e.key === "_"),
    perform: (s) => zoomBy(s, 1 / 1.2),
  },
  {
    name: "resetZoom",
    label: t("action.resetZoom"),
    shortcut: `${MOD_LABEL}0`,
    keyTest: (e) => mod(e) && e.key === "0",
    perform: resetZoom,
  },
  {
    name: "zoomFit",
    label: t("action.zoomFit"),
    shortcut: "Shift+1",
    keyTest: (e) => e.shiftKey && !mod(e) && e.code === "Digit1",
    perform: (s) => zoomToFit(s, false),
  },
  {
    name: "zoomSelection",
    label: t("action.zoomSelection"),
    shortcut: "Shift+2",
    keyTest: (e) => e.shiftKey && !mod(e) && e.code === "Digit2",
    enabled: (s) => selectedElements(s).length > 0,
    perform: (s) => zoomToFit(s, true),
  },
  {
    name: "toggleTheme",
    label: t("action.toggleTheme"),
    shortcut: "Alt+Shift+D",
    keyTest: (e) => e.altKey && e.shiftKey && e.code === "KeyD",
    perform: toggleTheme,
  },
];

export const actionByName = (name: string): Action | undefined => actions.find((a) => a.name === name);
