import { measureText } from "../geometry/text";
import { LINE_HEIGHT } from "./constants";
import { newId, newNonce, newSeed } from "./ids";
import { linearPatch } from "./linear";
import type {
  FreedrawElement,
  ItemStyle,
  LinearElement,
  Pt,
  ShapeElement,
  SketchElement,
  TextElement,
} from "./types";

function base(x: number, y: number, style: ItemStyle) {
  return {
    id: newId(),
    x,
    y,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    opacity: style.opacity,
    roundness: style.roundness,
    seed: newSeed(),
    version: 1,
    versionNonce: newNonce(),
    groupIds: [] as string[],
    frameId: null,
    boundElements: null,
    link: null,
    locked: false,
    isDeleted: false,
  };
}

export function newShape(type: ShapeElement["type"], x: number, y: number, style: ItemStyle): ShapeElement {
  return { ...base(x, y, style), type };
}

export function newLinear(
  type: LinearElement["type"],
  x: number,
  y: number,
  style: ItemStyle,
  points: Pt[] = [
    [0, 0],
    [0, 0],
  ],
): LinearElement {
  return {
    ...base(x, y, style),
    type,
    ...linearPatch(points),
    startArrowhead: type === "arrow" ? style.startArrowhead : null,
    endArrowhead: type === "arrow" ? style.endArrowhead : null,
    // Arrows take the arrow type; lines are either straight or curved.
    arrowType: type === "arrow" ? style.arrowType : style.lineCurved ? "round" : "sharp",
    polygon: false,
    startBinding: null,
    endBinding: null,
  };
}

export function newFreedraw(x: number, y: number, style: ItemStyle, pressure?: number): FreedrawElement {
  return {
    ...base(x, y, style),
    type: "freedraw",
    backgroundColor: "transparent",
    ...linearPatch([[0, 0]]),
    pressures: pressure === undefined ? [] : [pressure],
    simulatePressure: style.simulatePressure,
  };
}

export function newText(x: number, y: number, style: ItemStyle, text = ""): TextElement {
  const m = measureText(text, style.fontSize, style.fontFamily, LINE_HEIGHT);
  return {
    ...base(x, y, style),
    type: "text",
    backgroundColor: "transparent",
    width: m.width,
    height: m.height,
    text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    textAlign: style.textAlign,
    verticalAlign: "top",
    containerId: null,
    lineHeight: LINE_HEIGHT,
    autoResize: true,
    wrapWidth: null,
  };
}

/**
 * Copies with fresh ids, offset by (dx, dy). Group ids are remapped so copies stay grouped together, and
 * links between the copied elements (label to container, arrow to shape) point at the copies. Pass labels along
 * with their containers (see withBoundTexts); a link to an element that is not copied is dropped.
 */
export function cloneElements(els: readonly SketchElement[], dx: number, dy: number): SketchElement[] {
  const idMap = new Map(els.map((e) => [e.id, newId()]));
  const groupMap = new Map<string, string>();
  const mapGroup = (g: string) => {
    let n = groupMap.get(g);
    if (!n) groupMap.set(g, (n = newId()));
    return n;
  };
  const remapBinding = (b: { elementId: string; focus: number; gap: number } | null) =>
    b && idMap.has(b.elementId) ? { ...b, elementId: idMap.get(b.elementId)! } : null;

  return els.map((el) => {
    const links = (el.boundElements ?? []).filter((b) => idMap.has(b.id)).map((b) => ({ ...b, id: idMap.get(b.id)! }));
    const copy = {
      ...el,
      id: idMap.get(el.id)!,
      x: el.x + dx,
      y: el.y + dy,
      version: 1,
      versionNonce: newNonce(),
      groupIds: el.groupIds.map(mapGroup),
      boundElements: links.length ? links : null,
      ...("points" in el ? { points: el.points.map((p): Pt => [p[0], p[1]]) } : {}),
      ...("pressures" in el ? { pressures: [...el.pressures] } : {}),
    } as SketchElement;
    if (copy.type === "arrow" || copy.type === "line") {
      copy.startBinding = remapBinding(copy.startBinding);
      copy.endBinding = remapBinding(copy.endBinding);
    }
    if (copy.type === "text" && copy.containerId) {
      copy.containerId = idMap.get(copy.containerId) ?? null;
      if (!copy.containerId) {
        copy.autoResize = true;
        copy.wrapWidth = null;
      }
    }
    return copy;
  });
}
