import { describe, expect, it } from "vitest";
import { cropAfterDrag, cropOf, MIN_CROP } from "../geometry/crop";
import { topElementAt } from "../geometry/hit";
import { rotatePoint, type Point } from "../geometry/math";
import { recognizeShape, simplifyPolyline } from "../geometry/recognize";
import { fitWithin, sha1Hex } from "../data/files";
import { restoreElement } from "../data/restore";
import { parseEmbedUrl } from "../embed/embed";
import { Store } from "../state/store";
import { DEFAULT_STYLE } from "./constants";
import { cloneElements, newEmbeddable, newFrame, newImage, newShape, newText } from "./factory";
import { frameAssignments, nextFrameName, withFrameChildren } from "./frames";
import type { ImageElement, ShapeElement, SketchElement } from "./types";

// ------------------------------------------------------------------------------------------------ test strokes

/** A deterministic pseudo-random generator, so the "hand-drawn" jitter is the same every run. */
function rng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Points along a polyline every `step` pixels, each wobbled by up to +-`jitter`. */
function trace(corners: Point[], step = 6, jitter = 2, seed = 7): Point[] {
  const r = rng(seed);
  const out: Point[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [a, b] = [corners[i], corners[i + 1]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * 2 * jitter, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * 2 * jitter]);
    }
  }
  const last = corners[corners.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

const rectStroke = (x: number, y: number, w: number, h: number, jitter = 2): Point[] =>
  // Starts mid-way along the top edge and stops a little short of where it began, like a real loop.
  trace(
    [
      [x + w / 2, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
      [x + w / 2 - 12, y + 3],
    ],
    6,
    jitter,
  );

function ellipseStroke(cx: number, cy: number, a: number, b: number, jitter = 2): Point[] {
  const r = rng(11);
  const out: Point[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2 * 0.97; // stops a little short of closing
    out.push([cx + Math.cos(t) * a + (r() - 0.5) * 2 * jitter, cy + Math.sin(t) * b + (r() - 0.5) * 2 * jitter]);
  }
  return out;
}

describe("shape recognition", () => {
  it("recognises a rectangle, from a loop that starts mid-edge and does not quite close", () => {
    const r = recognizeShape(rectStroke(100, 100, 220, 140))!;
    expect(r.kind).toBe("rectangle");
    if (r.kind === "rectangle") {
      expect(r.box.x).toBeCloseTo(100, -1);
      expect(r.box.y).toBeCloseTo(100, -1);
      expect(r.box.width).toBeCloseTo(220, -1);
      expect(r.box.height).toBeCloseTo(140, -1);
    }
  });

  it("recognises a circle and an ellipse", () => {
    expect(recognizeShape(ellipseStroke(300, 300, 80, 80))!.kind).toBe("ellipse");
    const e = recognizeShape(ellipseStroke(300, 300, 140, 70))!;
    expect(e.kind).toBe("ellipse");
    if (e.kind === "ellipse") expect(e.box.width).toBeGreaterThan(e.box.height * 1.7);
  });

  it("recognises a diamond (corners at the middle of the sides)", () => {
    const [cx, cy, a, b] = [300, 300, 90, 70];
    const pts = trace([
      [cx, cy - b],
      [cx + a, cy],
      [cx, cy + b],
      [cx - a, cy],
      [cx + 8, cy - b + 6],
    ]);
    expect(recognizeShape(pts)!.kind).toBe("diamond");
  });

  it("recognises a triangle as a polygon with three corners", () => {
    const pts = trace([
      [300, 100],
      [400, 260],
      [200, 260],
      [310, 112],
    ]);
    const r = recognizeShape(pts)!;
    expect(r.kind).toBe("polygon");
    if (r.kind === "polygon") expect(r.points).toHaveLength(3);
  });

  it("recognises a tilted four-sided shape as a polygon, not a rectangle", () => {
    const pts = trace([
      [100, 150],
      [220, 100],
      [260, 200],
      [140, 250],
      [108, 160],
    ]);
    expect(recognizeShape(pts)!.kind).toBe("polygon");
  });

  it("recognises a straight line, even a wobbly one", () => {
    const r = recognizeShape(trace([[100, 100], [420, 220]], 8, 3))!;
    expect(r.kind).toBe("line");
    if (r.kind === "line") {
      expect(r.points[0][0]).toBeCloseTo(100, -1);
      expect(r.points[1][0]).toBeCloseTo(420, -1);
    }
  });

  it("recognises a line ending in a hook as an arrow pointing at the end of the shaft", () => {
    const tip: Point = [400, 200];
    // Back along the shaft's direction (towards the start), swung 30 degrees either side.
    const barb = (deg: number): Point => {
      const back: Point = [-1, 0];
      const p = rotatePoint([tip[0] + back[0] * 40, tip[1] + back[1] * 40], tip, (deg * Math.PI) / 180);
      return [p[0], p[1]];
    };
    const pts = trace([[100, 200], tip, barb(30), tip, barb(-30)], 6, 1);
    const r = recognizeShape(pts)!;
    expect(r.kind).toBe("arrow");
    if (r.kind === "arrow") {
      expect(r.points[0][0]).toBeCloseTo(100, -1);
      expect(r.points[1][0]).toBeCloseTo(400, -1);
      expect(r.points[1][1]).toBeCloseTo(200, -1);
    }
  });

  it("leaves scribbles, short strokes and out-and-back lines alone", () => {
    const r = rng(3);
    const scribble: Point[] = Array.from({ length: 40 }, (_, i): Point => [100 + i * 6, 200 + (r() - 0.5) * 140]);
    expect(recognizeShape(scribble)).toBeNull();
    expect(recognizeShape([[0, 0], [4, 2], [8, 1], [10, 3]])).toBeNull();
    expect(recognizeShape(trace([[100, 100], [300, 100], [110, 105]], 6, 1))).toBeNull(); // goes out and comes back
    // A sharp "L".
    expect(recognizeShape(trace([[100, 100], [100, 300], [300, 300]], 8, 1))).toBeNull();
  });

  it("simplifies a polyline to its corners", () => {
    const pts = trace([[0, 0], [100, 0], [100, 100]], 5, 0);
    expect(simplifyPolyline(pts, 3)).toEqual([[0, 0], [100, 0], [100, 100]]);
  });
});

// ------------------------------------------------------------------------------------------------ crop

function image(extra: Partial<ImageElement> = {}): ImageElement {
  return { ...newImage(100, 100, 200, 100, "file"), id: "img", ...extra };
}
const natural = { width: 400, height: 200 };

/** Where a picture pixel is on the canvas. */
function worldOf(el: ImageElement, px: number, py: number): Point {
  const crop = cropOf(el, natural);
  const kx = el.width / crop.width;
  const ky = el.height / crop.height;
  const ux = el.scale[0] === 1 ? el.x + (px - crop.x) * kx : el.x + el.width - (px - crop.x) * kx;
  const uy = el.scale[1] === 1 ? el.y + (py - crop.y) * ky : el.y + el.height - (py - crop.y) * ky;
  return rotatePoint([ux, uy], [el.x + el.width / 2, el.y + el.height / 2], el.angle);
}

describe("cropping", () => {
  it("narrows the visible part from the east and west edges", () => {
    const el = image();
    // The right edge (x = 300) is dragged 40 left: 40 / 0.5 = 80 picture pixels are cropped away.
    const a = cropAfterDrag(el, "e", [260, 150], natural);
    expect(a.crop).toMatchObject({ x: 0, width: 320 });
    expect([a.x, a.width]).toEqual([100, 160]);
    // The left edge dragged 50 right.
    const b = cropAfterDrag({ ...el, ...a } as ImageElement, "w", [150, 150], natural);
    expect(b.crop).toMatchObject({ x: 100, width: 220 });
    expect([b.x, b.width]).toEqual([150, 110]);
  });

  it("works on both axes at a corner and never leaves the picture", () => {
    const el = image();
    const c = cropAfterDrag(el, "se", [250, 130], natural);
    expect(c.crop).toMatchObject({ x: 0, y: 0, width: 300, height: 60 });
    // Dragging outward stays within the whole picture.
    const out = cropAfterDrag(el, "e", [1000, 150], natural);
    expect(out.crop).toMatchObject({ width: 400 });
    expect(out.width).toBe(200);
  });

  it("keeps a minimum size", () => {
    const el = image();
    const c = cropAfterDrag(el, "e", [-500, 150], natural);
    expect(c.crop!.width).toBe(MIN_CROP);
    expect(c.width).toBeCloseTo(MIN_CROP * 0.5, 9);
  });

  it("reads the picture right to left when it is mirrored", () => {
    const el = image({ scale: [-1, 1] });
    // The right edge of a mirrored image shows the picture's left side: cropping it removes pixels from x = 0.
    const c = cropAfterDrag(el, "e", [260, 150], natural);
    expect(c.crop).toMatchObject({ x: 80, width: 320 });
  });

  it("never moves the picture on the canvas, also when rotated or mirrored", () => {
    const cases: Partial<ImageElement>[] = [{}, { angle: Math.PI / 2 }, { angle: 0.6 }, { scale: [-1, 1] }, { scale: [-1, -1], angle: 1.2 }];
    for (const extra of cases) {
      const el = image(extra);
      const centre: Point = [el.x + el.width / 2, el.y + el.height / 2];
      for (const handle of ["e", "w", "n", "s", "se", "nw"] as const) {
        // Drag the handle's edge about 30 units inwards, measured in the image's own frame.
        const local: Record<string, Point> = {
          e: [el.x + el.width - 30, centre[1]],
          w: [el.x + 30, centre[1]],
          n: [centre[0], el.y + 30],
          s: [centre[0], el.y + el.height - 30],
          se: [el.x + el.width - 30, el.y + el.height - 20],
          nw: [el.x + 30, el.y + 20],
        };
        const pointer = rotatePoint(local[handle], centre, el.angle);
        const patch = cropAfterDrag(el, handle, [pointer[0], pointer[1]], natural);
        const after = { ...el, ...patch } as ImageElement;
        for (const probe of [[200, 100], [150, 80]] as const) {
          const [bx, by] = worldOf(el, probe[0], probe[1]);
          const [ax, ay] = worldOf(after, probe[0], probe[1]);
          expect(ax).toBeCloseTo(bx, 6);
          expect(ay).toBeCloseTo(by, 6);
        }
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------ embeds

describe("embed addresses", () => {
  const src = (u: string) => parseEmbedUrl(u)?.src ?? null;

  it("rewrites YouTube links in every common form", () => {
    expect(src("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(src("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(src("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(src("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(src("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?start=90");
    expect(src("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?start=42");
    expect(src("https://www.youtube.com/playlist?list=PLabc_123")).toBe("https://www.youtube.com/embed/videoseries?list=PLabc_123");
    expect(parseEmbedUrl("https://youtu.be/dQw4w9WgXcQ")!.service).toBe("youtube");
    expect(src("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(src("https://www.youtube.com/")).toBeNull();
  });

  it("rewrites Vimeo, Figma and CodePen", () => {
    expect(src("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
    expect(src("https://player.vimeo.com/video/76979871?h=abc")).toBe("https://player.vimeo.com/video/76979871");
    expect(src("https://www.figma.com/design/AbC123/My-file?node-id=1-2")).toBe(
      `https://www.figma.com/embed?embed_host=sketchboard&url=${encodeURIComponent("https://www.figma.com/design/AbC123/My-file?node-id=1-2")}`,
    );
    expect(src("https://www.figma.com/")).toBeNull();
    expect(src("https://codepen.io/someone/pen/AbCdEf")).toBe("https://codepen.io/someone/embed/AbCdEf?default-tab=result");
  });

  it("rewrites Google Maps, Docs, Slides and Sheets", () => {
    expect(src("https://www.google.com/maps/embed?pb=!1m18")).toBe("https://www.google.com/maps/embed?pb=!1m18");
    expect(src("https://www.google.com/maps/place/Eiffel+Tower")).toBe("https://maps.google.com/maps?q=Eiffel%20Tower&output=embed");
    expect(src("https://maps.google.com/maps?q=paris")).toBe("https://maps.google.com/maps?q=paris&output=embed");
    expect(src("https://docs.google.com/document/d/abc123/edit")).toBe("https://docs.google.com/document/d/abc123/preview");
    expect(src("https://docs.google.com/presentation/d/abc123/edit#slide=id.p")).toBe(
      "https://docs.google.com/presentation/d/abc123/embed?start=false&loop=false&delayms=3000",
    );
    expect(src("https://docs.google.com/spreadsheets/d/abc123/edit")).toBe("https://docs.google.com/spreadsheets/d/abc123/preview");
    expect(src("https://docs.google.com/document/d/e/2PACX-xyz/pub")).toBe("https://docs.google.com/document/d/e/2PACX-xyz/pub?embedded=true");
    expect(parseEmbedUrl("https://docs.google.com/presentation/d/abc123/edit")!.service).toBe("google-slides");
    expect(src("https://docs.google.com/forms/d/abc/edit")).toBeNull();
  });

  it("refuses everything else: other sites, other schemes, credentials, junk", () => {
    expect(src("https://example.com/video")).toBeNull();
    expect(src("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(src("javascript:alert(1)")).toBeNull();
    expect(src("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(src("https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(src("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(src("https://evil.example/?u=https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(src("not a url")).toBeNull();
    expect(src("")).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ files

describe("image files", () => {
  it("scales large pictures down to the limit, keeping the aspect ratio, and never scales up", () => {
    expect(fitWithin(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 });
    expect(fitWithin(1000, 3000, 2000)).toEqual({ width: 667, height: 2000 });
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it("identifies a picture by the SHA-1 of its bytes", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha1Hex(bytes.buffer as ArrayBuffer)).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});

// ------------------------------------------------------------------------------------------------ frames

const box = (id: string, x: number, y: number, w = 40, h = 40, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  ...newShape("rectangle", x, y, DEFAULT_STYLE),
  id,
  width: w,
  height: h,
  ...extra,
});

function framed() {
  const store = new Store();
  store.scene.add({ ...newFrame(100, 100, 300, 200, "Frame 1"), id: "frame" });
  store.scene.add(box("in", 150, 150));
  store.scene.add(box("out", 600, 150));
  store.commit(); // the new frame puts "in" inside it
  store.history.reset();
  return store;
}

describe("frames", () => {
  it("names new frames in sequence", () => {
    expect(nextFrameName([])).toBe("Frame 1");
    expect(nextFrameName([newFrame(0, 0, 10, 10, "Frame 1"), newFrame(0, 0, 10, 10, "Frame 4"), newFrame(0, 0, 10, 10, "Mine")])).toBe("Frame 5");
    expect(nextFrameName([{ ...newFrame(0, 0, 10, 10, "Frame 9"), isDeleted: true }])).toBe("Frame 1");
  });

  it("puts a new element into the frame that holds its centre, on commit", () => {
    const store = new Store();
    store.scene.add({ ...newFrame(100, 100, 300, 200, "Frame 1"), id: "frame" });
    store.history.reset();
    store.scene.add(box("a", 150, 150));
    store.scene.add(box("b", 450, 150)); // outside
    store.scene.add(box("c", 380, 150, 100, 40)); // centre (430) is outside though it overlaps
    store.commit();
    expect(store.scene.get("a")!.frameId).toBe("frame");
    expect(store.scene.get("b")!.frameId).toBeNull();
    expect(store.scene.get("c")!.frameId).toBeNull();
  });

  it("moves elements in and out of frames when they are dragged there", () => {
    const store = framed();
    store.commit();
    expect(store.scene.get("in")!.frameId).toBe("frame");
    store.scene.update("in", { x: 700 });
    store.scene.update("out", { x: 200 });
    store.commit();
    expect(store.scene.get("in")!.frameId).toBeNull();
    expect(store.scene.get("out")!.frameId).toBe("frame");
  });

  it("keeps an element out of a frame after 'remove from frame' until it moves again", () => {
    const store = framed();
    store.commit();
    store.scene.update("in", { frameId: null });
    store.commit();
    expect(store.scene.get("in")!.frameId).toBeNull();
    store.scene.update("in", { x: 160 });
    store.commit();
    expect(store.scene.get("in")!.frameId).toBe("frame");
  });

  it("re-checks everything when a frame is resized", () => {
    const store = framed();
    store.commit();
    store.scene.update("frame", { width: 600 }); // now it also covers "out"
    store.commit();
    expect(store.scene.get("out")!.frameId).toBe("frame");
    store.scene.update("frame", { width: 50 }); // and shrinks past "in" (its centre, x = 170, is now outside 100..150)
    store.commit();
    expect(store.scene.get("in")!.frameId).toBeNull();
  });

  it("lets go of elements whose frame is deleted", () => {
    const store = framed();
    store.commit();
    store.scene.update("frame", { isDeleted: true });
    store.commit();
    expect(store.scene.get("in")!.frameId).toBeNull();
  });

  it("undo restores the membership together with the move", () => {
    const store = framed();
    store.commit();
    store.scene.update("in", { x: 700 });
    store.commit();
    expect(store.scene.get("in")!.frameId).toBeNull();
    store.undo();
    expect(store.scene.get("in")!.frameId).toBe("frame");
    expect(store.scene.get("in")!.x).toBe(150);
  });

  it("lists what moves with a frame and what a copy of the frame takes along", () => {
    const store = framed();
    store.commit();
    const visible = store.scene.visible();
    const frame = store.scene.get("frame")!;
    expect(withFrameChildren(visible, [frame]).map((e) => e.id)).toEqual(["frame", "in"]);
    expect(withFrameChildren(visible, [frame, store.scene.get("in")!]).map((e) => e.id)).toEqual(["frame", "in"]);

    const copies = cloneElements(withFrameChildren(visible, [frame]), 20, 20);
    const copyFrame = copies.find((c) => c.type === "frame")!;
    expect(copies.find((c) => c.type === "rectangle")!.frameId).toBe(copyFrame.id);
    // A copy of just the element stays in the same frame.
    expect(cloneElements([store.scene.get("in")!], 5, 5)[0].frameId).toBe("frame");
  });

  it("does not make a label or a frame a member of a frame", () => {
    const store = framed();
    const label = { ...newText(150, 150, DEFAULT_STYLE, "x"), id: "label", containerId: "in" };
    store.scene.add(label);
    store.scene.add({ ...newFrame(120, 120, 50, 50, "Frame 2"), id: "inner" });
    store.commit();
    expect(store.scene.get("inner")!.frameId).toBeNull();
    // The label follows its container (the normalizer copies the frame over).
    expect(store.scene.get("label")!.frameId).toBe(store.scene.get("in")!.frameId);
  });

  it("clicks do not reach what a frame clips away", () => {
    const store = new Store();
    store.scene.add({ ...newFrame(100, 100, 200, 200, "Frame 1"), id: "frame" });
    store.scene.add(box("kid", 250, 150, 200, 40, { backgroundColor: "#f00", frameId: "frame" })); // sticks out to x = 450
    const els = store.scene.visible();
    expect(topElementAt(els, [270, 170], 3)?.id).toBe("kid");
    expect(topElementAt(els, [400, 170], 3)).toBeNull(); // the part outside the frame is clipped
    expect(topElementAt(els, [400, 170], 3, false)?.id).toBe("kid"); // unless frame clipping is off
  });

  it("selects a frame by its outline or name, not by its inside", () => {
    const frame = { ...newFrame(100, 100, 200, 200, "Frame 1"), id: "frame" };
    expect(topElementAt([frame], [200, 200], 3)).toBeNull();
    expect(topElementAt([frame], [100, 200], 3)?.id).toBe("frame"); // left edge
    expect(topElementAt([frame], [110, 90], 8)?.id).toBe("frame"); // the name, just above the top-left corner
    expect(topElementAt([frame], [280, 90], 8)).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ restoring

describe("restoring the new elements", () => {
  it("round-trips images, frames and embeds", () => {
    const img = { ...newImage(10, 20, 100, 50, "abc123", { x: 4, y: 2, width: 40, height: 20, naturalWidth: 100, naturalHeight: 50 }), scale: [-1, 1] as [number, number] };
    const frame = newFrame(0, 0, 300, 200, "Plan");
    const embed = newEmbeddable(5, 5, 320, 180, "https://youtu.be/dQw4w9WgXcQ");
    for (const el of [img, frame, embed] as SketchElement[]) {
      expect(restoreElement(JSON.parse(JSON.stringify(el)))).toEqual(el);
    }
  });

  it("repairs bad image data", () => {
    const base = { type: "image", id: "i", width: 10, height: 10 };
    expect(restoreElement({ ...base, fileId: "x", scale: [0, "no"], crop: { x: -5, y: 0, width: 999, height: 5, naturalWidth: 100, naturalHeight: 50 } })).toMatchObject({
      fileId: "x",
      scale: [1, 1],
      crop: { x: 0, y: 0, width: 100, height: 5 },
    });
    // An image that was never stored cannot come back.
    expect(restoreElement({ ...base, fileId: null, status: "saved" })).toMatchObject({ fileId: null, status: "error" });
    expect(restoreElement({ ...base, fileId: "x", crop: { x: 0, y: 0, width: 0, height: 5, naturalWidth: 10, naturalHeight: 10 } })).toMatchObject({ crop: null });
  });
});
