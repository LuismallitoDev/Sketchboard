import { expect, test, type Page } from "@playwright/test";

// Phase 4: images (insert, drop, paste, crop, flip, persistence), frames, sticky notes, draw-to-shape, bucket fill,
// laser pointer, lasso, web embeds, pen mode and the "more tools" menu.

type El = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  points?: [number, number][];
  text?: string;
  name?: string | null;
  link?: string | null;
  fileId?: string | null;
  status?: string;
  scale?: [number, number];
  crop?: { x: number; y: number; width: number; height: number; naturalWidth: number; naturalHeight: number } | null;
  frameId: string | null;
  containerId?: string | null;
  backgroundColor: string;
  strokeColor: string;
  fillStyle: string;
  endArrowhead?: string | null;
  polygon?: boolean;
  isDeleted: boolean;
};

type Hook = {
  elements(): unknown;
  state(): unknown;
  store: { scene: { all(): unknown } };
  insertImage(blob: Blob): Promise<unknown>;
  imageEntry(id: string): { width: number; height: number } | null;
};

const elements = (page: Page): Promise<El[]> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __sketchboard: Hook }).__sketchboard.elements())));
const allElements = (page: Page): Promise<El[]> => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __sketchboard: Hook }).__sketchboard.store.scene.all())));
const appState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __sketchboard: Hook }).__sketchboard.state();
    return JSON.parse(JSON.stringify(s)) as {
      tool: string;
      selectedIds: string[];
      croppingId: string | null;
      editingFrameId: string | null;
      activeEmbedId: string | null;
      embedDraftId: string | null;
      dialog: string | null;
      laserTrail: unknown[];
      penMode: boolean;
      frameRendering: boolean;
      notice: string | null;
    };
  });

async function drag(page: Page, from: [number, number], to: [number, number], opts: { alt?: boolean; shift?: boolean } = {}) {
  if (opts.alt) await page.keyboard.down("Alt");
  if (opts.shift) await page.keyboard.down("Shift");
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 10 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up("Shift");
  if (opts.alt) await page.keyboard.up("Alt");
}

async function draw(page: Page, key: string, from: [number, number], to: [number, number]): Promise<El> {
  const before = (await elements(page)).length;
  await page.keyboard.press(key);
  await drag(page, from, to);
  const els = await elements(page);
  expect(els.length).toBe(before + 1);
  return els[els.length - 1];
}

/** A freehand stroke through the points. */
async function stroke(page: Page, pts: [number, number][], steps = 5) {
  await page.mouse.move(...pts[0]);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps });
  await page.mouse.up();
}

/** A PNG made in the page (a gradient, so different sizes/seeds give different bytes) and put on the canvas. */
async function insertPicture(page: Page, width: number, height: number, seed = 0): Promise<El> {
  const id = await page.evaluate(
    async ({ width, height, seed }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const x = c.getContext("2d")!;
      const g = x.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, `hsl(${(20 + seed * 70) % 360} 90% 55%)`);
      g.addColorStop(1, "#3b82f6");
      x.fillStyle = g;
      x.fillRect(0, 0, width, height);
      x.fillStyle = "#ffffff";
      x.fillRect(width * 0.1, height * 0.15, width * 0.3, height * 0.3);
      const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
      const el = (await (window as unknown as { __sketchboard: Hook }).__sketchboard.insertImage(blob)) as { id: string } | null;
      return el?.id ?? null;
    },
    { width, height, seed },
  );
  expect(id).not.toBeNull();
  return (await elements(page)).find((e) => e.id === id)!;
}

const byId = (els: El[], id: string) => els.find((e) => e.id === id)!;
const center = (e: El): [number, number] => [e.x + e.width / 2, e.y + e.height / 2];

test.beforeEach(async ({ page }) => {
  // Embedded sites are never really loaded.
  await page.route(/https:\/\/(www\.youtube\.com|player\.vimeo\.com|codepen\.io)\/.*/, (route) =>
    route.fulfill({ contentType: "text/html", body: "<html><body style='background:#222;color:#fff'>embedded page</body></html>" }),
  );
  await page.goto("/");
  await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
});

test.describe("images", () => {
  test("inserting a picture centres it in the view, selects it, and stores it under its SHA-1", async ({ page }) => {
    const img = await insertPicture(page, 200, 100);
    expect(img.type).toBe("image");
    expect(img.fileId).toMatch(/^[0-9a-f]{40}$/);
    expect(img.status).toBe("saved");
    expect([img.width, img.height]).toEqual([200, 100]);
    const [cx, cy] = center(img);
    expect(cx).toBeCloseTo(640, 0);
    expect(cy).toBeCloseTo(400, 0);
    const s = await appState(page);
    expect(s.selectedIds).toEqual([img.id]);
    expect(s.tool).toBe("selection");
    // Undo takes it away again.
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(0);
  });

  test("the same picture is stored once; different pictures are not confused", async ({ page }) => {
    const a = await insertPicture(page, 160, 80, 0);
    const b = await insertPicture(page, 160, 80, 0);
    const c = await insertPicture(page, 160, 80, 1);
    expect(b.fileId).toBe(a.fileId);
    expect(c.fileId).not.toBe(a.fileId);
  });

  test("large pictures are scaled down for storage and fit the canvas", async ({ page }) => {
    const img = await insertPicture(page, 3000, 1000);
    const stored = await page.evaluate((id) => (window as unknown as { __sketchboard: Hook }).__sketchboard.imageEntry(id), img.fileId!);
    expect(stored).toMatchObject({ width: 2000, height: 667 });
    expect(img.width).toBeCloseTo(560, 0); // fitted to the insert size, keeping 3:1
    expect(img.height).toBeCloseTo(187, 0);
  });

  test("the file picker adds pictures and refuses other files with a message", async ({ page }) => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    await page.getByTestId("image-input").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: png });
    await expect.poll(async () => (await elements(page)).length).toBe(1);
    expect((await elements(page))[0].type).toBe("image");

    await page.getByTestId("image-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    // A non-image file is filtered out before it is read: nothing is added.
    await page.waitForTimeout(300);
    expect(await elements(page)).toHaveLength(1);

    // An image type that cannot be decoded is reported.
    await page.getByTestId("image-input").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
    await expect(page.getByTestId("notice")).toBeVisible();
    expect(await elements(page)).toHaveLength(1);
  });

  test("dropping a picture puts it where it was dropped", async ({ page }) => {
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 120;
      c.height = 60;
      c.getContext("2d")!.fillRect(0, 0, 120, 60);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "dropped.png", { type: "image/png" }));
      document.querySelector(".canvas-wrap")!.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, clientX: 700, clientY: 300, bubbles: true, cancelable: true }));
    });
    await expect.poll(async () => (await elements(page)).length).toBe(1);
    const [img] = await elements(page);
    expect(center(img)[0]).toBeCloseTo(700, 0);
    expect(center(img)[1]).toBeCloseTo(300, 0);
  });

  test("pasting a picture adds it", async ({ page }) => {
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 90;
      c.height = 90;
      c.getContext("2d")!.fillRect(0, 0, 90, 90);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "pasted.png", { type: "image/png" }));
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect.poll(async () => (await elements(page)).length).toBe(1);
  });

  test("pictures survive a reload and load back from the browser's file store", async ({ page }) => {
    const img = await insertPicture(page, 160, 90);
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    const [after] = await elements(page);
    expect(after.fileId).toBe(img.fileId);
    await page.waitForFunction((id) => (window as unknown as { __sketchboard: Hook }).__sketchboard.imageEntry(id) !== null, img.fileId!);
  });

  test("a corner keeps the proportions (Shift frees them), a side stretches", async ({ page }) => {
    const img = await insertPicture(page, 400, 200); // 440..840 x 300..500
    await drag(page, [846, 506], [946, 516]); // se corner, +100 / +10
    let [now] = await elements(page);
    expect(now.width / now.height).toBeCloseTo(2, 1);
    expect(now.width).toBeCloseTo(500, 0);

    await page.keyboard.press("Control+z");
    await drag(page, [846, 506], [946, 516], { shift: true });
    [now] = await elements(page);
    expect(now.width).toBeCloseTo(500, 0);
    expect(now.height).toBeCloseTo(210, 0);
    expect(byId([now], img.id)).toBeTruthy();
  });

  test("cropping: double-click, drag a handle in, Escape; the picture does not move, undo restores the full picture", async ({ page }) => {
    const img = await insertPicture(page, 400, 200); // 440..840 x 300..500
    await page.keyboard.press("Escape");
    await page.mouse.dblclick(640, 400);
    expect((await appState(page)).croppingId).toBe(img.id);

    await drag(page, [846, 400], [746, 400]); // east handle 100 to the left
    let [now] = await elements(page);
    expect(now.crop).toMatchObject({ x: 0, y: 0, width: 300, height: 200, naturalWidth: 400, naturalHeight: 200 });
    expect(now.width).toBeCloseTo(300, 0);
    expect(now.x).toBeCloseTo(440, 0);

    await drag(page, [434, 300], [484, 300]); // north-west handle: 50 right, 0 down (only x changes visibly)
    [now] = await elements(page);
    expect(now.crop!.x).toBeCloseTo(50, 0);
    expect(now.x).toBeCloseTo(490, 0); // the picture stays put: its visible part now starts further right

    await page.keyboard.press("Escape");
    expect((await appState(page)).croppingId).toBeNull();
    await page.keyboard.press("Control+z");
    [now] = await elements(page);
    expect(now.crop).toMatchObject({ x: 0, width: 300 }); // one step back: before the second drag... then the first
    await page.keyboard.press("Control+z");
    [now] = await elements(page);
    expect(now.crop ?? null).toBeNull();
    expect(now.width).toBeCloseTo(400, 0);
  });

  test("Enter and the panel button also start cropping; clicking elsewhere ends it", async ({ page }) => {
    const img = await insertPicture(page, 300, 150);
    await page.keyboard.press("Enter");
    expect((await appState(page)).croppingId).toBe(img.id);
    await page.mouse.click(1100, 700);
    expect((await appState(page)).croppingId).toBeNull();
    await page.mouse.click(640, 400);
    await page.getByTestId("action-cropImage").click();
    expect((await appState(page)).croppingId).toBe(img.id);
  });

  test("flip mirrors a picture, also a cropped one", async ({ page }) => {
    await insertPicture(page, 200, 100);
    await page.keyboard.press("Shift+h");
    expect((await elements(page))[0].scale).toEqual([-1, 1]);
    await page.keyboard.press("Shift+v");
    expect((await elements(page))[0].scale).toEqual([-1, -1]);
    await page.keyboard.press("Control+z");
    expect((await elements(page))[0].scale).toEqual([-1, 1]);
  });

  test("the panel offers opacity but no stroke or fill for a picture", async ({ page }) => {
    await insertPicture(page, 200, 100);
    await expect(page.getByTestId("opacity")).toBeVisible();
    await expect(page.getByTestId("stroke-color")).toHaveCount(0);
    await expect(page.getByTestId("fill-style")).toHaveCount(0);
    await page.getByTestId("opacity").fill("40");
    expect((await elements(page))[0]).toMatchObject({});
  });
});

test.describe("frames", () => {
  test("a frame drawn around elements takes them in, is named, and moves them with it", async ({ page }) => {
    const inner = await draw(page, "r", [400, 250], [480, 320]);
    const frame = await draw(page, "f", [330, 170], [700, 450]);
    expect(frame.type).toBe("frame");
    expect(frame.name).toBe("Frame 1");
    expect((await appState(page)).tool).toBe("selection");
    expect(byId(await elements(page), inner.id).frameId).toBe(frame.id);

    // Drag the frame by its left edge (away from the middle, where the west handle is).
    await page.mouse.click(1100, 700);
    await drag(page, [330, 200], [430, 250]);
    const els = await elements(page);
    expect(byId(els, frame.id).x).toBeCloseTo(430, 0);
    expect(byId(els, inner.id).x).toBeCloseTo(500, 0);
    expect(byId(els, inner.id).y).toBeCloseTo(300, 0);
    // One undo step puts both back.
    await page.keyboard.press("Control+z");
    const back = await elements(page);
    expect(byId(back, frame.id).x).toBeCloseTo(330, 0);
    expect(byId(back, inner.id).x).toBeCloseTo(400, 0);
  });

  test("elements dragged into a frame join it and leave it again when dragged out", async ({ page }) => {
    const frame = await draw(page, "f", [330, 170], [700, 450]);
    const rect = await draw(page, "r", [800, 200], [860, 260]);
    expect(rect.frameId).toBeNull();
    await page.mouse.click(1100, 700);
    await drag(page, [800, 215], [500, 215]); // centre ends up inside the frame
    expect(byId(await elements(page), rect.id).frameId).toBe(frame.id);
    await drag(page, [500, 215], [900, 215]);
    expect(byId(await elements(page), rect.id).frameId).toBeNull();
  });

  test("the name can be edited by double-clicking it or in the panel", async ({ page }) => {
    const frame = await draw(page, "f", [330, 170], [700, 450]);
    await page.mouse.click(1100, 700);
    await page.mouse.dblclick(345, 162); // the name sits just above the top-left corner
    await expect(page.getByTestId("frame-name-editor")).toBeFocused();
    await page.keyboard.type("Plan");
    await page.keyboard.press("Enter");
    expect(byId(await elements(page), frame.id).name).toBe("Plan");

    await page.mouse.click(330, 230); // select it again by its edge
    await page.getByTestId("frame-name").fill("Final plan");
    await page.getByTestId("frame-name").press("Enter");
    expect(byId(await elements(page), frame.id).name).toBe("Final plan");
    await page.keyboard.press("Control+z");
    expect(byId(await elements(page), frame.id).name).toBe("Plan");
  });

  test("Escape cancels a rename", async ({ page }) => {
    const frame = await draw(page, "f", [330, 170], [700, 450]);
    await page.mouse.dblclick(345, 162);
    await page.keyboard.type("Nope");
    await page.keyboard.press("Escape");
    expect(byId(await elements(page), frame.id).name).toBe("Frame 1");
  });

  test("new frames get the next name", async ({ page }) => {
    await draw(page, "f", [330, 170], [500, 300]);
    const second = await draw(page, "f", [600, 170], [800, 300]);
    expect(second.name).toBe("Frame 2");
  });

  test("deleting a frame deletes what is inside it; undo brings it all back", async ({ page }) => {
    const inner = await draw(page, "r", [400, 250], [480, 320]);
    const frame = await draw(page, "f", [330, 170], [700, 450]);
    await page.keyboard.press("Delete");
    expect(await elements(page)).toHaveLength(0);
    await page.keyboard.press("Control+z");
    const els = await elements(page);
    expect(els.map((e) => e.id).sort()).toEqual([inner.id, frame.id].sort());
    expect(byId(els, inner.id).frameId).toBe(frame.id);
  });

  test("Alt-drag copies a frame together with its contents", async ({ page }) => {
    await draw(page, "r", [400, 250], [480, 320]);
    await draw(page, "f", [330, 170], [700, 450]);
    await page.mouse.click(1100, 700);
    await drag(page, [330, 200], [330, 330], { alt: true });
    const els = await elements(page);
    const frames = els.filter((e) => e.type === "frame");
    const rects = els.filter((e) => e.type === "rectangle");
    expect(frames).toHaveLength(2);
    expect(rects).toHaveLength(2);
    expect(new Set(rects.map((r) => r.frameId)).size).toBe(2); // each rectangle in its own frame
    expect(frames.map((f) => f.name).sort()).toEqual(["Frame 1", "Frame 1"]); // copies keep the name
  });

  test("Ctrl+Shift+F wraps the selection in a frame", async ({ page }) => {
    const a = await draw(page, "r", [400, 250], [480, 320]);
    const b = await draw(page, "o", [560, 260], [640, 330]);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+Shift+f");
    const els = await elements(page);
    const frame = els.find((e) => e.type === "frame")!;
    expect(frame).toBeTruthy();
    expect(byId(els, a.id).frameId).toBe(frame.id);
    expect(byId(els, b.id).frameId).toBe(frame.id);
    expect(frame.x).toBeLessThan(400);
    expect(frame.x + frame.width).toBeGreaterThan(640);
    expect((await appState(page)).selectedIds).toEqual([frame.id]);
  });

  test("select everything in a frame, and remove things from it", async ({ page }) => {
    const a = await draw(page, "r", [400, 250], [480, 320]);
    const b = await draw(page, "r", [520, 250], [600, 320]);
    await draw(page, "f", [330, 170], [700, 450]);
    await page.getByTestId("action-selectAllInFrame").click();
    expect((await appState(page)).selectedIds.sort()).toEqual([a.id, b.id].sort());

    await page.mouse.click(1100, 700);
    await page.mouse.click(400, 270); // the first rectangle's left edge
    await page.getByTestId("action-removeFromFrame").click();
    const els = await elements(page);
    expect(byId(els, a.id).frameId).toBeNull();
    expect(byId(els, b.id).frameId).not.toBeNull();
    // It stays out until it is moved again.
    await page.keyboard.press("ArrowRight");
    expect(byId(await elements(page), a.id).frameId).not.toBeNull();
  });

  test("frames can be hidden; the setting is remembered", async ({ page }) => {
    await expect(page.getByTestId("toggle-frame-rendering")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("toggle-frame-rendering").click();
    expect((await appState(page)).frameRendering).toBe(false);
    await page.keyboard.press("Alt+f");
    expect((await appState(page)).frameRendering).toBe(true);
  });

  test("a frame with contents survives a reload", async ({ page }) => {
    const inner = await draw(page, "r", [400, 250], [480, 320]);
    const frame = await draw(page, "f", [330, 170], [700, 450]);
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    const els = await elements(page);
    expect(byId(els, frame.id).name).toBe("Frame 1");
    expect(byId(els, inner.id).frameId).toBe(frame.id);
  });
});

test.describe("sticky notes", () => {
  test("a click places a note with its text editor open", async ({ page }) => {
    await page.keyboard.press("n");
    await page.mouse.click(600, 350);
    await expect(page.getByTestId("text-editor")).toBeFocused();
    await page.keyboard.type("Idea");
    await page.keyboard.press("Escape");
    const els = await elements(page);
    const note = els.find((e) => e.type === "rectangle")!;
    const label = els.find((e) => e.type === "text")!;
    expect([note.width, note.height]).toEqual([180, 180]);
    expect(center(note)[0]).toBeCloseTo(600, 0);
    expect(note.backgroundColor).toBe("#fef08a");
    expect(note.fillStyle).toBe("solid");
    expect(label.text).toBe("Idea");
    expect(label.containerId).toBe(note.id);
    expect((await appState(page)).tool).toBe("selection");
  });

  test("dragging sizes the note", async ({ page }) => {
    await page.keyboard.press("n");
    await drag(page, [400, 200], [560, 320]);
    await page.keyboard.type("Wide");
    await page.keyboard.press("Escape");
    const note = (await elements(page)).find((e) => e.type === "rectangle")!;
    expect([note.x, note.y, note.width, note.height]).toEqual([400, 200, 160, 120]);
  });

  test("an empty note stays; the whole thing is one undo step", async ({ page }) => {
    await page.keyboard.press("n");
    await page.mouse.click(600, 350);
    await page.keyboard.press("Escape");
    expect((await elements(page)).map((e) => e.type)).toEqual(["rectangle"]);
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(0);
  });
});

test.describe("draw to shape", () => {
  const circle = (cx: number, cy: number, r: number): [number, number][] =>
    Array.from({ length: 41 }, (_, i): [number, number] => {
      const t = (i / 40) * Math.PI * 2 * 0.97;
      return [cx + Math.cos(t) * r + (i % 3) - 1, cy + Math.sin(t) * r + (i % 2) - 0.5];
    });

  test("a rough rectangle becomes a rectangle, and the tool stays on", async ({ page }) => {
    await page.keyboard.press("w");
    await stroke(page, [
      [520, 300],
      [700, 303],
      [703, 420],
      [498, 417],
      [502, 308],
      [540, 301],
    ]);
    const els = await elements(page);
    expect(els).toHaveLength(1);
    expect(els[0].type).toBe("rectangle");
    expect(els[0].x).toBeCloseTo(500, -1);
    expect(els[0].width).toBeGreaterThan(195);
    expect(els[0].width).toBeLessThan(215);
    expect((await appState(page)).tool).toBe("autoshape");
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(0); // one step, not a stroke and a shape
  });

  test("circles, lines and arrows are recognised too", async ({ page }) => {
    await page.keyboard.press("w");
    await stroke(page, circle(600, 300, 90));
    await stroke(page, [
      [300, 560],
      [420, 566],
      [560, 570],
      [700, 574],
    ]);
    // A shaft with a short hook at its tip.
    await stroke(page, [
      [800, 600],
      [940, 600],
      [920, 585],
      [940, 600],
      [920, 615],
    ]);
    const types = (await elements(page)).map((e) => e.type);
    expect(types).toEqual(["ellipse", "line", "arrow"]);
    const arrow = (await elements(page))[2];
    expect(arrow.points![1][0]).toBeCloseTo(140, -1);
  });

  test("a triangle becomes a closed polygon", async ({ page }) => {
    await page.keyboard.press("w");
    await stroke(page, [
      [600, 300],
      [700, 460],
      [500, 460],
      [606, 312],
    ]);
    const [shape] = await elements(page);
    expect(shape.type).toBe("line");
    expect(shape.polygon).toBe(true);
    expect(shape.points).toHaveLength(4);
  });

  test("a scribble stays a freehand stroke", async ({ page }) => {
    await page.keyboard.press("w");
    await stroke(page, [
      [500, 300],
      [540, 380],
      [580, 290],
      [620, 400],
      [660, 280],
      [700, 410],
    ]);
    expect((await elements(page)).map((e) => e.type)).toEqual(["freedraw"]);
  });

  test("the new shape uses the stroke's colour", async ({ page }) => {
    await page.keyboard.press("w");
    await page.getByTestId("stroke-color").locator('button[title="#dc2626"]').click();
    await stroke(page, circle(600, 300, 90));
    expect((await elements(page))[0]).toMatchObject({ type: "ellipse", strokeColor: "#dc2626" });
  });
});

test.describe("bucket fill", () => {
  test("fills the closed shape under the click with the chosen colour", async ({ page }) => {
    const rect = await draw(page, "r", [450, 250], [650, 380]);
    await page.keyboard.press("g");
    await page.getByTestId("background-color-open").click();
    await page.getByTestId("background-color-blue-2").click();
    await page.keyboard.press("Escape");
    await page.mouse.click(550, 315); // inside the (unfilled) rectangle
    expect(byId(await elements(page), rect.id).backgroundColor).toBe("#93c5fd");

    await page.mouse.click(900, 600); // nothing there
    expect((await elements(page)).filter((e) => e.backgroundColor !== "transparent")).toHaveLength(1);

    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z");
    expect(byId(await elements(page), rect.id).backgroundColor).toBe("transparent");
  });

  test("works on ellipses, diamonds and closed lines, topmost shape first", async ({ page }) => {
    const back = await draw(page, "r", [450, 250], [750, 450]);
    const front = await draw(page, "o", [520, 290], [680, 410]);
    await page.keyboard.press("g");
    await page.getByTestId("background-color").locator('button[title="#bbf7d0"]').click();
    await page.mouse.click(600, 350); // inside both: the ellipse is on top
    let els = await elements(page);
    expect(byId(els, front.id).backgroundColor).toBe("#bbf7d0");
    expect(byId(els, back.id).backgroundColor).toBe("transparent");
    await page.mouse.click(470, 270); // only inside the rectangle
    els = await elements(page);
    expect(byId(els, back.id).backgroundColor).toBe("#bbf7d0");
  });
});

test.describe("laser pointer and lasso", () => {
  test("the laser leaves a trail that fades away and adds nothing to the drawing", async ({ page }) => {
    await page.keyboard.press("k");
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(700, 450, { steps: 12 });
    expect((await appState(page)).laserTrail.length).toBeGreaterThan(5);
    await page.mouse.up();
    await expect.poll(async () => (await appState(page)).laserTrail.length, { timeout: 5000 }).toBe(0);
    expect(await elements(page)).toHaveLength(0);
    expect((await appState(page)).tool).toBe("laser");
  });

  test("the lasso selects what its loop encloses or crosses", async ({ page }) => {
    const a = await draw(page, "r", [420, 250], [500, 320]);
    const b = await draw(page, "o", [540, 250], [620, 320]);
    const c = await draw(page, "r", [800, 250], [880, 320]);
    await page.keyboard.press("u");
    // A loop round the first two.
    await stroke(page, [
      [400, 220],
      [650, 220],
      [650, 350],
      [400, 350],
      [400, 225],
    ], 3);
    expect((await appState(page)).selectedIds.sort()).toEqual([a.id, b.id].sort());

    // A loop that only crosses the third one's edge.
    await stroke(page, [
      [780, 280],
      [840, 200],
      [900, 280],
      [840, 360],
      [790, 285],
    ], 3);
    expect((await appState(page)).selectedIds).toEqual([c.id]);
    expect((await appState(page)).tool).toBe("lasso"); // stays on
  });

  test("a lasso that catches nothing clears the selection", async ({ page }) => {
    await draw(page, "r", [420, 250], [500, 320]);
    await page.keyboard.press("u");
    await stroke(page, [
      [900, 500],
      [1000, 500],
      [1000, 600],
      [900, 600],
      [905, 505],
    ], 3);
    expect((await appState(page)).selectedIds).toEqual([]);
  });
});

test.describe("web embeds", () => {
  const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  test("an embed asks for an address, rewrites it, and shows the page in a sandboxed iframe", async ({ page }) => {
    await page.keyboard.press("m");
    await drag(page, [420, 200], [800, 420]);
    await expect(page.getByTestId("embed-url")).toBeFocused();
    expect((await appState(page)).dialog).toBe("embed");

    // Sites that are not on the list are refused with a message, and the dialog stays.
    await page.getByTestId("embed-url").fill("https://example.com/video");
    await page.getByTestId("embed-ok").click();
    await expect(page.getByTestId("embed-error")).toContainText("cannot be embedded");
    expect((await appState(page)).dialog).toBe("embed");

    await page.getByTestId("embed-url").fill(YT);
    await page.getByTestId("embed-url").press("Enter");
    expect((await appState(page)).dialog).toBeNull();
    const [embed] = await elements(page);
    expect(embed).toMatchObject({ type: "embeddable", link: YT });
    expect([embed.x, embed.y, embed.width, embed.height]).toEqual([420, 200, 380, 220]);

    const iframe = page.locator(`[data-testid="embed-${embed.id}"] iframe`);
    await expect(iframe).toHaveAttribute("src", "https://www.youtube.com/embed/dQw4w9WgXcQ");
    const sandbox = await iframe.getAttribute("sandbox");
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-top-navigation");
    expect((await appState(page)).tool).toBe("selection");
  });

  test("cancelling the dialog removes a new embed and leaves no history", async ({ page }) => {
    await page.keyboard.press("m");
    await drag(page, [420, 200], [800, 420]);
    await page.getByTestId("embed-cancel").click();
    expect(await elements(page)).toHaveLength(0);
    expect((await appState(page)).dialog).toBeNull();
    await expect(page.getByTestId("undo")).toBeDisabled();

    await page.keyboard.press("m");
    await drag(page, [420, 200], [800, 420]);
    await page.keyboard.press("Escape");
    expect(await elements(page)).toHaveLength(0);
  });

  test("other supported sites are rewritten to their embed addresses", async ({ page }) => {
    await page.keyboard.press("m");
    await drag(page, [420, 200], [800, 420]);
    await page.getByTestId("embed-url").fill("https://vimeo.com/76979871");
    await page.getByTestId("embed-ok").click();
    const [embed] = await elements(page);
    await expect(page.locator(`[data-testid="embed-${embed.id}"] iframe`)).toHaveAttribute("src", "https://player.vimeo.com/video/76979871");
  });

  test("Click to interact hands the mouse to the page; pressing on the canvas takes it back", async ({ page }) => {
    await page.keyboard.press("m");
    await drag(page, [420, 200], [800, 420]);
    await page.getByTestId("embed-url").fill(YT);
    await page.getByTestId("embed-ok").click();
    const [embed] = await elements(page);
    const frame = page.locator(`[data-testid="embed-${embed.id}"]`);

    // Inert until activated: clicking inside it selects/moves the embed like any element.
    await expect(frame).not.toHaveClass(/active/);
    await page.getByTestId("embed-interact").click();
    expect((await appState(page)).activeEmbedId).toBe(embed.id);
    await expect(frame).toHaveClass(/active/);
    await expect(page.getByTestId("embed-interact")).toHaveCount(0);

    await page.mouse.click(1000, 650);
    expect((await appState(page)).activeEmbedId).toBeNull();
    await expect(frame).not.toHaveClass(/active/);
  });

  test("double-click reopens the address; it can be changed, and the embed moves like any element", async ({ page }) => {
    await page.keyboard.press("m");
    await drag(page, [420, 200], [800, 420]);
    await page.getByTestId("embed-url").fill(YT);
    await page.getByTestId("embed-ok").click();
    const [embed] = await elements(page);

    await page.keyboard.press("Escape");
    await page.mouse.dblclick(430, 300); // on its left edge
    await expect(page.getByTestId("embed-url")).toHaveValue(YT);
    await page.getByTestId("embed-url").fill("https://youtu.be/aaaaaaaaaaa");
    await page.getByTestId("embed-ok").click();
    expect(byId(await elements(page), embed.id).link).toBe("https://youtu.be/aaaaaaaaaaa");

    await page.mouse.click(1100, 700);
    await drag(page, [420, 250], [470, 300]);
    expect(byId(await elements(page), embed.id).x).toBeCloseTo(470, 0);
    await expect(page.locator(`[data-testid="embed-${embed.id}"]`)).toHaveCSS("left", "470px");
  });

  test("an embed survives a reload", async ({ page }) => {
    await page.keyboard.press("m");
    await drag(page, [420, 200], [800, 420]);
    await page.getByTestId("embed-url").fill(YT);
    await page.getByTestId("embed-ok").click();
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    await expect(page.locator("iframe")).toHaveAttribute("src", "https://www.youtube.com/embed/dQw4w9WgXcQ");
  });
});

test.describe("pen mode", () => {
  /** A synthetic touch drag on the canvas. */
  const touchDrag = (page: Page) =>
    page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="canvas"]')!;
      const fire = (type: string, x: number, y: number) =>
        canvas.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
      fire("pointerdown", 450, 300);
      fire("pointermove", 550, 350);
      fire("pointermove", 650, 400);
      fire("pointerup", 650, 400);
    });

  test("touch is ignored in pen mode, but the mouse and pen still draw", async ({ page }) => {
    await page.getByTestId("toggle-pen-mode").click();
    expect((await appState(page)).penMode).toBe(true);
    await page.keyboard.press("r");
    await touchDrag(page);
    expect(await elements(page)).toHaveLength(0);
    await drag(page, [450, 300], [650, 400]);
    expect(await elements(page)).toHaveLength(1);
  });

  test("the setting is remembered", async ({ page }) => {
    await page.getByTestId("toggle-pen-mode").click();
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    await expect(page.getByTestId("toggle-pen-mode")).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("the toolbar", () => {
  test("More tools lists the extra tools and picking one selects it", async ({ page }) => {
    await page.getByTestId("tools-more").click();
    for (const tool of ["frame", "sticky", "embed", "laser", "lasso", "autoshape", "bucket"]) {
      await expect(page.getByTestId("tools-more-menu").getByTestId(`tool-${tool}`)).toBeVisible();
    }
    await page.getByTestId("tools-more-menu").getByTestId("tool-lasso").click();
    expect((await appState(page)).tool).toBe("lasso");
    await expect(page.getByTestId("tools-more-menu")).toHaveCount(0);
    await expect(page.getByTestId("tools-more")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("v");
    await expect(page.getByTestId("tools-more")).toHaveAttribute("aria-pressed", "false");
  });

  test("Escape closes the menu without changing the tool", async ({ page }) => {
    await page.keyboard.press("r");
    await page.getByTestId("tools-more").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tools-more-menu")).toHaveCount(0);
    expect((await appState(page)).tool).toBe("rectangle");
  });

  test("the image button and the 9 key open the file picker", async ({ page }) => {
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("9");
    expect(await chooser).toBeTruthy();
    const second = page.waitForEvent("filechooser");
    await page.getByTestId("tool-image").click();
    expect(await second).toBeTruthy();
  });

  test("the extra tools have keyboard shortcuts", async ({ page }) => {
    const keys: Record<string, string> = { f: "frame", n: "sticky", m: "embed", k: "laser", u: "lasso", w: "autoshape", g: "bucket" };
    for (const [key, tool] of Object.entries(keys)) {
      await page.keyboard.press(key);
      expect((await appState(page)).tool).toBe(tool);
    }
  });
});

test("a Phase 4 scene renders in light and dark without console errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  // A frame holding two shapes and a sticky note.
  await draw(page, "r", [330, 140], [450, 200]);
  await draw(page, "o", [490, 140], [600, 200]);
  await draw(page, "f", [300, 100], [640, 330]);
  await page.keyboard.press("n");
  await page.mouse.click(520, 255);
  await page.keyboard.type("Ship it");
  await page.keyboard.press("Escape");

  // A cropped, flipped picture.
  await insertPicture(page, 360, 220);
  await page.keyboard.press("Escape");
  await page.mouse.dblclick(640, 330);
  await drag(page, [826, 330], [776, 330]);
  await page.keyboard.press("Escape");
  await drag(page, [640, 220], [900, 200]);
  await page.keyboard.press("Shift+h");

  // Shapes recognised from rough strokes.
  await page.keyboard.press("w");
  await stroke(page, [[700, 460], [820, 462], [822, 560], [698, 558], [702, 466], [730, 461]]);
  await stroke(
    page,
    Array.from({ length: 41 }, (_, i): [number, number] => {
      const t = (i / 40) * Math.PI * 2 * 0.97;
      return [980 + Math.cos(t) * 60 + (i % 3), 520 + Math.sin(t) * 50 + (i % 2)];
    }),
  );

  // An embed placeholder.
  await page.keyboard.press("m");
  await drag(page, [330, 420], [600, 580]);
  await page.getByTestId("embed-url").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByTestId("embed-ok").click();

  await page.keyboard.press("Escape");
  await page.mouse.click(1150, 700);
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath("phase4-light.png") });
  await page.keyboard.press("Alt+Shift+KeyD");
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath("phase4-dark.png") });

  expect(errors).toEqual([]);
});
