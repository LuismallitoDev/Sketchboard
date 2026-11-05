import { t, type StringKey } from "../i18n";
import type { AlignKind } from "../scene/align";
import { canGroup, canUngroup } from "../scene/groups";
import type { ZMove } from "../scene/zindex";
import type { ToolType } from "../state/appState";
import {
  alignSelected,
  bindSelectedText,
  canBindText,
  cancelEyedropper,
  copyStyle,
  deleteSelected,
  distributeSelected,
  duplicateSelected,
  editSelected,
  flipSelected,
  groupSelected,
  hasBoundText,
  lockedCount,
  lockSelected,
  moveSelectedZ,
  pasteStyle,
  requestClearCanvas,
  resetZoom,
  selectAll,
  selectedElements,
  setTool,
  startEyedropper,
  togglePreference,
  toggleTheme,
  togglePolygonSelected,
  ungroupSelected,
  unbindSelectedText,
  unlockAll,
  wrapSelectedTextInContainer,
  zoomBy,
  zoomToFit,
  type Preference,
} from "../state/operations";
import { createFlowchartNode, navigateFlowchart, type FlowDirection } from "../state/flowchart";
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
const selCount = (s: Store) => selectedElements(s).length;

const Z_ACTIONS: { name: string; move: ZMove; label: StringKey; code: string; shift: boolean; shortcut: string }[] = [
  { name: "bringForward", move: "forward", label: "action.bringForward", code: "BracketRight", shift: false, shortcut: `${MOD_LABEL}]` },
  { name: "sendBackward", move: "backward", label: "action.sendBackward", code: "BracketLeft", shift: false, shortcut: `${MOD_LABEL}[` },
  { name: "bringToFront", move: "front", label: "action.bringToFront", code: "BracketRight", shift: true, shortcut: `${MOD_LABEL}Shift+]` },
  { name: "sendToBack", move: "back", label: "action.sendToBack", code: "BracketLeft", shift: true, shortcut: `${MOD_LABEL}Shift+[` },
];

const zActions: Action[] = Z_ACTIONS.map((z) => ({
  name: z.name,
  label: t(z.label),
  shortcut: z.shortcut,
  keyTest: (e) => mod(e) && !e.altKey && e.shiftKey === z.shift && e.code === z.code,
  enabled: hasSelection,
  perform: (s) => moveSelectedZ(s, z.move),
}));

const ALIGN_ACTIONS: { kind: AlignKind; label: StringKey; code?: string; shortcut?: string }[] = [
  { kind: "left", label: "action.alignLeft", code: "ArrowLeft", shortcut: `${MOD_LABEL}Shift+←` },
  { kind: "right", label: "action.alignRight", code: "ArrowRight", shortcut: `${MOD_LABEL}Shift+→` },
  { kind: "top", label: "action.alignTop", code: "ArrowUp", shortcut: `${MOD_LABEL}Shift+↑` },
  { kind: "bottom", label: "action.alignBottom", code: "ArrowDown", shortcut: `${MOD_LABEL}Shift+↓` },
  { kind: "centerH", label: "action.alignCenterH" },
  { kind: "centerV", label: "action.alignCenterV" },
];

const alignActions: Action[] = ALIGN_ACTIONS.map((a) => ({
  name: `align:${a.kind}`,
  label: t(a.label),
  shortcut: a.shortcut,
  keyTest: a.code ? (e) => mod(e) && e.shiftKey && !e.altKey && e.code === a.code : undefined,
  enabled: (s) => selCount(s) >= 2,
  perform: (s) => alignSelected(s, a.kind),
}));

const FLOW_DIRS: { dir: FlowDirection; code: string; label: StringKey; navLabel: StringKey; arrow: string }[] = [
  { dir: "up", code: "ArrowUp", label: "action.flowUp", navLabel: "action.navUp", arrow: "↑" },
  { dir: "down", code: "ArrowDown", label: "action.flowDown", navLabel: "action.navDown", arrow: "↓" },
  { dir: "left", code: "ArrowLeft", label: "action.flowLeft", navLabel: "action.navLeft", arrow: "←" },
  { dir: "right", code: "ArrowRight", label: "action.flowRight", navLabel: "action.navRight", arrow: "→" },
];

const isConnectable = (s: Store) => {
  const sel = selectedElements(s);
  return sel.length === 1 && ["rectangle", "diamond", "ellipse"].includes(sel[0].type) && !sel[0].locked;
};

/** Ctrl/Cmd + arrow creates a connected shape; Alt + arrow moves along the connections. */
const flowActions: Action[] = FLOW_DIRS.flatMap((d) => [
  {
    name: `flowchart:${d.dir}`,
    label: t(d.label),
    shortcut: `${MOD_LABEL}${d.arrow}`,
    keyTest: (e: KeyboardEvent) => mod(e) && !e.shiftKey && !e.altKey && e.code === d.code,
    enabled: isConnectable,
    perform: (s: Store) => void createFlowchartNode(s, d.dir),
  },
  {
    name: `navigate:${d.dir}`,
    label: t(d.navLabel),
    shortcut: `Alt+${d.arrow}`,
    keyTest: (e: KeyboardEvent) => e.altKey && !mod(e) && !e.shiftKey && e.code === d.code,
    enabled: isConnectable,
    perform: (s: Store) => void navigateFlowchart(s, d.dir),
  },
]);

const PREFERENCES: { key: Preference; label: StringKey; shortcut: string; test: (e: KeyboardEvent) => boolean }[] = [
  { key: "gridMode", label: "action.toggleGrid", shortcut: `${MOD_LABEL}'`, test: (e) => mod(e) && !e.shiftKey && !e.altKey && e.code === "Quote" },
  { key: "objectsSnap", label: "action.toggleObjectsSnap", shortcut: "Alt+S", test: (e) => e.altKey && !mod(e) && !e.shiftKey && e.code === "KeyS" },
  { key: "arrowBinding", label: "action.toggleArrowBinding", shortcut: "Alt+B", test: (e) => e.altKey && !mod(e) && !e.shiftKey && e.code === "KeyB" },
  { key: "midpointSnapping", label: "action.toggleMidpointSnapping", shortcut: "Alt+M", test: (e) => e.altKey && !mod(e) && !e.shiftKey && e.code === "KeyM" },
];

const preferenceActions: Action[] = PREFERENCES.map((p) => ({
  name: `toggle:${p.key}`,
  label: t(p.label),
  shortcut: p.shortcut,
  keyTest: p.test,
  perform: (s) => togglePreference(s, p.key),
}));

export const actions: Action[] = [
  ...toolActions,
  ...preferenceActions,
  ...flowActions,
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
    keyTest: (e) => mod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d",
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
      if (s.state.eyedropper) cancelEyedropper(s);
      else if (hasSelection(s)) s.select([]);
      else if (s.state.tool !== "selection") setTool(s, "selection");
    },
  },

  // groups and layers
  {
    name: "group",
    label: t("action.group"),
    shortcut: `${MOD_LABEL}G`,
    keyTest: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === "g",
    enabled: (s) => canGroup(selectedElements(s)),
    perform: groupSelected,
  },
  {
    name: "ungroup",
    label: t("action.ungroup"),
    shortcut: `${MOD_LABEL}Shift+G`,
    keyTest: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === "g",
    enabled: (s) => canUngroup(selectedElements(s)),
    perform: ungroupSelected,
  },
  ...zActions,

  // arrange
  ...alignActions,
  {
    name: "distribute:h",
    label: t("action.distributeH"),
    shortcut: "Alt+H",
    keyTest: (e) => e.altKey && !mod(e) && !e.shiftKey && e.code === "KeyH",
    enabled: (s) => selCount(s) >= 3,
    perform: (s) => distributeSelected(s, "h"),
  },
  {
    name: "distribute:v",
    label: t("action.distributeV"),
    shortcut: "Alt+V",
    keyTest: (e) => e.altKey && !mod(e) && !e.shiftKey && e.code === "KeyV",
    enabled: (s) => selCount(s) >= 3,
    perform: (s) => distributeSelected(s, "v"),
  },
  {
    name: "flip:h",
    label: t("action.flipH"),
    shortcut: "Shift+H",
    keyTest: (e) => e.shiftKey && !mod(e) && !e.altKey && e.code === "KeyH",
    enabled: hasSelection,
    perform: (s) => flipSelected(s, "h"),
  },
  {
    name: "flip:v",
    label: t("action.flipV"),
    shortcut: "Shift+V",
    keyTest: (e) => e.shiftKey && !mod(e) && !e.altKey && e.code === "KeyV",
    enabled: hasSelection,
    perform: (s) => flipSelected(s, "v"),
  },
  {
    name: "lock",
    label: t("action.lock"),
    shortcut: `${MOD_LABEL}Shift+L`,
    keyTest: (e) => mod(e) && e.shiftKey && !e.altKey && e.code === "KeyL",
    enabled: hasSelection,
    perform: lockSelected,
  },
  {
    name: "unlockAll",
    label: t("action.unlockAll"),
    shortcut: `${MOD_LABEL}Alt+Shift+L`,
    keyTest: (e) => mod(e) && e.shiftKey && e.altKey && e.code === "KeyL",
    enabled: (s) => lockedCount(s) > 0,
    perform: unlockAll,
  },

  // style
  {
    name: "copyStyle",
    label: t("action.copyStyle"),
    shortcut: `${MOD_LABEL}Alt+C`,
    keyTest: (e) => mod(e) && e.altKey && !e.shiftKey && e.code === "KeyC",
    enabled: hasSelection,
    perform: copyStyle,
  },
  {
    name: "pasteStyle",
    label: t("action.pasteStyle"),
    shortcut: `${MOD_LABEL}Alt+V`,
    keyTest: (e) => mod(e) && e.altKey && !e.shiftKey && e.code === "KeyV",
    enabled: (s) => s.state.copiedStyle !== null && hasSelection(s),
    perform: pasteStyle,
  },
  {
    name: "eyedropper",
    label: t("action.eyedropper"),
    shortcut: "I",
    keyTest: (e) => plain(e) && e.key.toLowerCase() === "i",
    perform: (s) => startEyedropper(s, "stroke"),
  },

  // text and lines
  {
    name: "editSelected",
    label: t("action.editSelected"),
    shortcut: "Enter",
    keyTest: (e) => e.key === "Enter" && !mod(e) && !e.shiftKey && !e.altKey,
    enabled: (s) => selCount(s) === 1,
    perform: (s) => void editSelected(s, false),
  },
  {
    name: "editPoints",
    label: t("action.editPoints"),
    shortcut: `${MOD_LABEL}Enter`,
    keyTest: (e) => e.key === "Enter" && mod(e) && !e.shiftKey && !e.altKey,
    enabled: (s) => selectedElements(s).length === 1 && ["line", "arrow"].includes(selectedElements(s)[0].type),
    perform: (s) => void editSelected(s, true),
  },
  {
    name: "wrapTextInContainer",
    label: t("action.wrapText"),
    shortcut: `${MOD_LABEL}Shift+Enter`,
    keyTest: (e) => mod(e) && e.shiftKey && e.key === "Enter",
    enabled: (s) => selectedElements(s).some((e) => e.type === "text" && !e.containerId),
    perform: wrapSelectedTextInContainer,
  },
  {
    name: "bindText",
    label: t("action.bindText"),
    enabled: (s) => canBindText(selectedElements(s), s.scene.visible()),
    perform: bindSelectedText,
  },
  {
    name: "unbindText",
    label: t("action.unbindText"),
    enabled: (s) => hasBoundText(s, selectedElements(s)),
    perform: unbindSelectedText,
  },
  {
    name: "togglePolygon",
    label: t("action.togglePolygon"),
    enabled: (s) => selectedElements(s).some((e) => e.type === "line"),
    perform: togglePolygonSelected,
  },

  // canvas
  {
    name: "clearCanvas",
    label: t("action.clearCanvas"),
    shortcut: `${MOD_LABEL}Delete`,
    keyTest: (e) => mod(e) && e.key === "Delete",
    perform: requestClearCanvas,
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

/** Runs a registered action by name if it is currently enabled. */
export function runAction(store: Store, name: string) {
  const a = actionByName(name);
  if (a && (a.enabled?.(store) ?? true)) a.perform(store);
}
