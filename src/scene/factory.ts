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
    arrowType: style.arrowType,
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
  };
}

/** Deep-ish copies with fresh ids, offset by (dx, dy). Group ids are remapped so copies stay grouped together. */
export function cloneElements(els: readonly SketchElement[], dx: number, dy: number): SketchElement[] {
  const groupMap = new Map<string, string>();
  const mapGroup = (g: string) => {
    let n = groupMap.get(g);
    if (!n) groupMap.set(g, (n = newId()));
    return n;
  };
  return els.map((el) => {
    const copy = {
      ...el,
      id: newId(),
      x: el.x + dx,
      y: el.y + dy,
      version: 1,
      versionNonce: newNonce(),
      groupIds: el.groupIds.map(mapGroup),
      boundElements: null,
      ...("points" in el ? { points: el.points.map((p): Pt => [p[0], p[1]]) } : {}),
      ...("pressures" in el ? { pressures: [...el.pressures] } : {}),
    } as SketchElement;
    if (copy.type === "arrow") {
      copy.startBinding = null;
      copy.endBinding = null;
    }
    return copy;
  });
}
