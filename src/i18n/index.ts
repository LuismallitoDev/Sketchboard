/** UI strings. More languages (and right-to-left) arrive in phase 6; keys stay stable. */
export const en = {
  "tool.selection": "Selection",
  "tool.hand": "Hand (pan)",
  "tool.rectangle": "Rectangle",
  "tool.diamond": "Diamond",
  "tool.ellipse": "Ellipse",
  "tool.arrow": "Arrow",
  "tool.line": "Line",
  "tool.freedraw": "Draw",
  "tool.text": "Text",
  "tool.eraser": "Eraser",
  "tool.lock": "Keep selected tool active after drawing",

  "action.undo": "Undo",
  "action.redo": "Redo",
  "action.delete": "Delete",
  "action.duplicate": "Duplicate",
  "action.selectAll": "Select all",
  "action.deselect": "Deselect / back to selection",
  "action.zoomIn": "Zoom in",
  "action.zoomOut": "Zoom out",
  "action.resetZoom": "Reset zoom",
  "action.zoomFit": "Zoom to fit",
  "action.zoomSelection": "Zoom to selection",
  "action.toggleTheme": "Toggle dark mode",

  "prop.stroke": "Stroke",
  "prop.background": "Background",
  "prop.fill": "Fill",
  "prop.strokeWidth": "Stroke width",
  "prop.strokeStyle": "Stroke style",
  "prop.sloppiness": "Sloppiness",
  "prop.edges": "Edges",
  "prop.opacity": "Opacity",
  "prop.fontFamily": "Font",
  "prop.fontSize": "Font size",
  "prop.textAlign": "Text align",
  "prop.pressure": "Pressure",
  "prop.arrowheads": "Arrowheads",

  "color.hex": "Hex code",
  "color.transparent": "Transparent",

  "theme.light": "Light mode",
  "theme.dark": "Dark mode",
} as const;

export type StringKey = keyof typeof en;

export function t(key: StringKey): string {
  return en[key];
}
