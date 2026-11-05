/** A point as stored in element data (JSON-safe tuple). */
export type Pt = [number, number];

export type ElementType = "rectangle" | "diamond" | "ellipse" | "line" | "arrow" | "freedraw" | "text";
export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type Arrowhead =
  | "arrow"
  | "bar"
  | "circle"
  | "circle_outline"
  | "triangle"
  | "triangle_outline"
  | "diamond"
  | "diamond_outline"
  // Entity-relationship notation: crow's foot and cardinality markers.
  | "crowfoot_many"
  | "crowfoot_one"
  | "crowfoot_one_or_many"
  | "cardinality_exactly_one"
  | "cardinality_zero_or_one"
  | "cardinality_zero_or_many";
export type ArrowType = "sharp" | "round" | "elbow";
export type FontFamily = "hand" | "normal" | "code";
export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

export interface BoundElementRef {
  id: string;
  type: "arrow" | "text";
}

/** Arrow-to-shape binding (phase 3). */
export interface Binding {
  elementId: string;
  focus: number;
  gap: number;
}

interface ElementBase {
  id: string;
  /** For shapes and text: top-left corner. For line/arrow/freedraw: the first point (points[0] is always [0, 0]). */
  x: number;
  y: number;
  /** For line/arrow/freedraw these are the size of the points' bounding box. */
  width: number;
  height: number;
  /** Radians, applied around the centre of the element's local box. */
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  /** 0 architect, 1 artist, 2 cartoonist. */
  roughness: number;
  /** 0-100. */
  opacity: number;
  /** Round edges (rectangle, diamond). */
  roundness: boolean;
  /** Stable randomness for the hand-drawn look. */
  seed: number;
  version: number;
  versionNonce: number;
  groupIds: string[];
  frameId: string | null;
  boundElements: BoundElementRef[] | null;
  link: string | null;
  locked: boolean;
  isDeleted: boolean;
}

export interface ShapeElement extends ElementBase {
  type: "rectangle" | "diamond" | "ellipse";
}

export interface LinearElement extends ElementBase {
  type: "line" | "arrow";
  points: Pt[];
  startArrowhead: Arrowhead | null;
  endArrowhead: Arrowhead | null;
  /** "round" draws a smooth curve through the points (for lines as well as arrows). */
  arrowType: ArrowType;
  /** A closed line (last point equals the first); it can be filled. */
  polygon: boolean;
  startBinding: Binding | null;
  endBinding: Binding | null;
}

export interface FreedrawElement extends ElementBase {
  type: "freedraw";
  points: Pt[];
  pressures: number[];
  simulatePressure: boolean;
}

export interface TextElement extends ElementBase {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  /** The shape or arrow this text is a label of. Its position and size follow the container. */
  containerId: string | null;
  lineHeight: number;
  /** True: the box fits the text. False: the text wraps at `wrapWidth`. */
  autoResize: boolean;
  /** Width the text wraps at (null = no wrapping). */
  wrapWidth: number | null;
}

export type SketchElement = ShapeElement | LinearElement | FreedrawElement | TextElement;
export type PointsElement = LinearElement | FreedrawElement;

/** Drawing defaults ("current item style"): what the next element will look like. */
export interface ItemStyle {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  roundness: boolean;
  fontFamily: FontFamily;
  fontSize: number;
  textAlign: TextAlign;
  startArrowhead: Arrowhead | null;
  endArrowhead: Arrowhead | null;
  arrowType: ArrowType;
  /** New lines are drawn as smooth curves. */
  lineCurved: boolean;
  /** Freedraw: true = variable pressure (simulated for a mouse), false = constant width. */
  simulatePressure: boolean;
}

export const isPointsElement = (el: SketchElement): el is PointsElement =>
  el.type === "line" || el.type === "arrow" || el.type === "freedraw";
