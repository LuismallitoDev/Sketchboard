import type { ItemStyle, SketchElement } from "../scene/types";

/** Which of the changed style properties apply to this kind of element (and how). Returns an element patch. */
export function stylePatchFor(el: SketchElement, p: Partial<ItemStyle>): Partial<SketchElement> {
  const out: Record<string, unknown> = {};
  const isShape = el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse";
  const hasStrokeLook = isShape || el.type === "line" || el.type === "arrow";

  if (p.strokeColor !== undefined) out.strokeColor = p.strokeColor;
  if (p.opacity !== undefined) out.opacity = p.opacity;
  if (isShape) {
    if (p.backgroundColor !== undefined) out.backgroundColor = p.backgroundColor;
    if (p.fillStyle !== undefined) out.fillStyle = p.fillStyle;
  }
  if (el.type !== "text") {
    if (p.strokeWidth !== undefined) out.strokeWidth = p.strokeWidth;
  }
  if (hasStrokeLook) {
    if (p.strokeStyle !== undefined) out.strokeStyle = p.strokeStyle;
    if (p.roughness !== undefined) out.roughness = p.roughness;
  }
  if (el.type === "rectangle" || el.type === "diamond") {
    if (p.roundness !== undefined) out.roundness = p.roundness;
  }
  if (el.type === "arrow") {
    if (p.startArrowhead !== undefined) out.startArrowhead = p.startArrowhead;
    if (p.endArrowhead !== undefined) out.endArrowhead = p.endArrowhead;
    if (p.arrowType !== undefined) out.arrowType = p.arrowType;
  }
  if (el.type === "freedraw" && p.simulatePressure !== undefined) out.simulatePressure = p.simulatePressure;
  if (el.type === "text") {
    if (p.fontFamily !== undefined) out.fontFamily = p.fontFamily;
    if (p.fontSize !== undefined) out.fontSize = p.fontSize;
    if (p.textAlign !== undefined) out.textAlign = p.textAlign;
  }
  return out as Partial<SketchElement>;
}
