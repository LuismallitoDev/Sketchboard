import { expect, test, type Page } from "@playwright/test";

// Phase 3: arrows attached to shapes, elbow arrows, flowchart mode, snapping (objects, gaps, grid, midpoints).

type Binding = { elementId: string; gap: number; focus: [number, number] } | null;
type El = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: [number, number][];
  startBinding?: Binding;
  endBinding?: Binding;
  arrowType?: string;
  boundElements?: { id: string; type: string }[] | null;
  isDeleted: boolean;
};

const elements = (page: Page): Promise<El[]> =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as never as { __sketchboard: { elements(): unknown } }).__sketchboard.elements())));
const appState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as { __sketchboard: { state(): unknown } }).__sketchboard.state();
    return JSON.parse(JSON.stringify(s)) as {
      tool: string;
      selectedIds: string[];
      editingLinearId: string | null;
      bindingHighlight: string | null;
      snapGuides: { kind: string }[];
      arrowBinding: boolean;
      objectsSnap: boolean;
      gridMode: boolean;
      midpointSnapping: boolean;
    };
  });

async function drag(page: Page, from: [number, number], to: [number, number], opts: { ctrl?: boolean } = {}) {
  if (opts.ctrl) await page.keyboard.down("Control");
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 10 });
  await page.mouse.up();
  if (opts.ctrl) await page.keyboard.up("Control");
}

async function draw(page: Page, key: string, from: [number, number], to: [number, number], opts: { ctrl?: boolean } = {}): Promise<El> {
  const before = (await elements(page)).length;
  await page.keyboard.press(key);
  await drag(page, from, to, opts);
  const els = await elements(page);
  expect(els.length).toBe(before + 1);
  return els[els.length - 1];
}

/** Absolute (scene) points of a line or arrow. */
const abs = (a: El): [number, number][] => a.points!.map((p) => [a.x + p[0], a.y + p[1]]);
const byId = (els: El[], id: string) => els.find((e) => e.id === id)!;
const orthogonal = (pts: [number, number][]) => pts.every((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) < 0.01 || Math.abs(p[1] - pts[i - 1][1]) < 0.01);

/** Two rectangles, A at the left and B lower right, and an arrow from A's centre to B's centre. */
async function twoShapesAndArrow(page: Page, arrowKey = "a") {
  const A = await draw(page, "r", [420, 200], [540, 300]);
  const B = await draw(page, "r", [760, 340], [880, 440]);
  const arrow = await draw(page, arrowKey, [480, 250], [820, 390]);
  return { A, B, arrow };
}

const clickToggle = (page: Page, name: "grid" | "objects-snap" | "arrow-binding" | "midpoint-snapping") => page.getByTestId(`toggle-${name}`).click();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
});

test.describe("arrow binding", () => {
  test("an arrow dropped on two shapes attaches to both and follows them", async ({ page }) => {
    const { A, B, arrow } = await twoShapesAndArrow(page);
    expect(arrow.startBinding?.elementId).toBe(A.id);
    expect(arrow.endBinding?.elementId).toBe(B.id);

    const [start, end] = [abs(arrow)[0], abs(arrow).at(-1)!];
    // The tip stops just outside each outline (a gap of 6).
    expect(start[0]).toBeGreaterThan(538);
    expect(start[0]).toBeLessThan(560);
    expect(start[1]).toBeGreaterThan(200);
    expect(start[1]).toBeLessThan(300);
    expect(end[0]).toBeGreaterThan(745);
    expect(end[0]).toBeLessThan(762);

    // The shapes list the arrow.
    const els = await elements(page);
    expect(byId(els, A.id).boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);

    // Dragging B drags the arrow's end along with it.
    await drag(page, [800, 340], [900, 390]);
    const after = await elements(page);
    expect(byId(after, B.id).x).toBeCloseTo(860, 0);
    const end2 = abs(byId(after, arrow.id)).at(-1)!;
    expect(end2[0]).toBeGreaterThan(end[0] + 80);
    expect(byId(after, arrow.id).endBinding?.elementId).toBe(B.id);

    // And undo takes it back.
    await page.keyboard.press("Control+z");
    const undone = await elements(page);
    expect(byId(undone, B.id).x).toBeCloseTo(760, 0);
    expect(abs(byId(undone, arrow.id)).at(-1)![0]).toBeCloseTo(end[0], 0);
  });

  test("the shape under the arrow end is highlighted while dragging", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    const B = await draw(page, "r", [760, 340], [880, 440]);
    await page.keyboard.press("a");
    await page.mouse.move(480, 250);
    await page.mouse.down();
    await page.mouse.move(820, 390, { steps: 8 });
    expect((await appState(page)).bindingHighlight).toBe(B.id);
    await page.mouse.move(1000, 600, { steps: 5 });
    expect((await appState(page)).bindingHighlight).toBeNull();
    await page.mouse.move(820, 390, { steps: 5 });
    await page.mouse.up();
    expect((await appState(page)).bindingHighlight).toBeNull();
  });

  test("holding Ctrl while drawing keeps the arrow free", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    await draw(page, "r", [760, 340], [880, 440]);
    const arrow = await draw(page, "a", [480, 250], [820, 390], { ctrl: true });
    expect(arrow.startBinding ?? null).toBeNull();
    expect(arrow.endBinding ?? null).toBeNull();
    expect(abs(arrow)[0]).toEqual([480, 250]);
  });

  test("attaching can be switched off for good and back on", async ({ page }) => {
    await expect(page.getByTestId("toggle-arrow-binding")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Alt+b");
    expect((await appState(page)).arrowBinding).toBe(false);
    await draw(page, "r", [420, 200], [540, 300]);
    const free = await draw(page, "a", [480, 250], [700, 250]);
    expect(free.startBinding ?? null).toBeNull();

    await clickToggle(page, "arrow-binding");
    expect((await appState(page)).arrowBinding).toBe(true);
    const bound = await draw(page, "a", [480, 280], [700, 330]);
    expect(bound.startBinding).not.toBeNull();
  });

  test("moving only the arrow lets go of the shapes", async ({ page }) => {
    const { arrow } = await twoShapesAndArrow(page);
    await page.mouse.click(1000, 700);
    const pts = abs(arrow);
    const mid: [number, number] = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    await drag(page, mid, [mid[0], mid[1] + 120]);
    const moved = byId(await elements(page), arrow.id);
    expect(moved.startBinding ?? null).toBeNull();
    expect(moved.endBinding ?? null).toBeNull();
    expect(abs(moved)[0][1]).toBeCloseTo(pts[0][1] + 120, 0);
  });

  test("moving the arrow with its shapes keeps it attached", async ({ page }) => {
    const { A, B, arrow } = await twoShapesAndArrow(page);
    await page.keyboard.press("Control+a");
    await drag(page, [420, 215], [420, 315]); // grab A's left edge, away from its handles
    const moved = await elements(page);
    expect(byId(moved, A.id).y).toBeCloseTo(300, 0);
    expect(byId(moved, B.id).y).toBeCloseTo(440, 0);
    const a = byId(moved, arrow.id);
    expect(a.startBinding?.elementId).toBe(A.id);
    expect(a.endBinding?.elementId).toBe(B.id);
  });

  test("deleting a shape frees the arrow, and undo attaches it again", async ({ page }) => {
    const { A, B, arrow } = await twoShapesAndArrow(page);
    await page.mouse.click(1000, 700);
    await page.mouse.click(770, 340); // B's top edge
    await page.keyboard.press("Delete");
    let els = await elements(page);
    expect(els.find((e) => e.id === B.id)).toBeUndefined();
    expect(byId(els, arrow.id).endBinding ?? null).toBeNull();
    expect(byId(els, arrow.id).startBinding?.elementId).toBe(A.id);
    await page.keyboard.press("Control+z");
    els = await elements(page);
    expect(byId(els, arrow.id).endBinding?.elementId).toBe(B.id);
  });

  test("dragging an arrow's end in point editing attaches it to the shape it is dropped on", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    const B = await draw(page, "r", [760, 340], [880, 440]);
    const free = await draw(page, "a", [480, 250], [650, 250]);
    expect(free.endBinding ?? null).toBeNull();
    await page.keyboard.press("Control+Enter"); // Enter would edit the arrow's label; Ctrl+Enter its points
    expect((await appState(page)).editingLinearId).toBe(free.id);
    await page.mouse.move(650, 250);
    await page.mouse.down();
    await page.mouse.move(820, 390, { steps: 8 });
    expect((await appState(page)).bindingHighlight).toBe(B.id);
    await page.mouse.up();
    expect(byId(await elements(page), free.id).endBinding?.elementId).toBe(B.id);

    // Dragging it back out lets go.
    await page.mouse.move(abs(byId(await elements(page), free.id)).at(-1)![0], abs(byId(await elements(page), free.id)).at(-1)![1]);
    await page.mouse.down();
    await page.mouse.move(1000, 600, { steps: 8 });
    await page.mouse.up();
    expect(byId(await elements(page), free.id).endBinding ?? null).toBeNull();
  });

  test("midpoint snapping aims the arrow at the middle of the nearest side", async ({ page }) => {
    await clickToggle(page, "midpoint-snapping");
    expect((await appState(page)).midpointSnapping).toBe(true);
    const B = await draw(page, "r", [760, 340], [880, 440]);
    const arrow = await draw(page, "a", [300, 300], [780, 345]); // near B's top-left corner
    expect(arrow.endBinding?.elementId).toBe(B.id);
    // Nearest side midpoint to (780, 345): the left side (760, 390) is 44px away, the top (820, 340) 40px.
    expect(arrow.endBinding!.focus).toEqual([0.5, 0]);
  });

  test("attachments survive a reload", async ({ page }) => {
    const { A, B, arrow } = await twoShapesAndArrow(page);
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    let els = await elements(page);
    expect(byId(els, arrow.id).startBinding?.elementId).toBe(A.id);
    await page.mouse.click(1000, 700);
    await drag(page, [800, 340], [800, 400]);
    els = await elements(page);
    expect(byId(els, B.id).y).toBeCloseTo(400, 0);
    expect(abs(byId(els, arrow.id)).at(-1)![1]).toBeGreaterThan(abs(arrow).at(-1)![1] + 40);
  });
});

test.describe("elbow arrows", () => {
  test("route at right angles from side to side and re-route when a shape moves", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    await draw(page, "r", [760, 340], [880, 440]);
    await page.keyboard.press("a");
    await page.getByTestId("arrow-type-elbow").click();
    await drag(page, [480, 250], [820, 390]);
    let [, , arrow] = await elements(page);
    expect(arrow.arrowType).toBe("elbow");
    let pts = abs(arrow);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(orthogonal(pts)).toBe(true);
    // Leaves A's right side at the height of its centre and meets B's left side at the height of its centre.
    expect(pts[0][0]).toBeCloseTo(546, 0);
    expect(pts[0][1]).toBeCloseTo(250, 0);
    expect(pts.at(-1)![0]).toBeCloseTo(754, 0);
    expect(pts.at(-1)![1]).toBeCloseTo(390, 0);

    await page.mouse.click(1000, 700);
    await drag(page, [800, 340], [800, 140]); // B moves up above A's row
    [, , arrow] = await elements(page);
    pts = abs(arrow);
    expect(orthogonal(pts)).toBe(true);
    expect(pts.at(-1)![1]).toBeCloseTo(190, 0);
  });

  test("needs a drag: a plain click draws nothing", async ({ page }) => {
    await page.keyboard.press("a");
    await page.getByTestId("arrow-type-elbow").click();
    await page.mouse.click(500, 300);
    await page.mouse.move(600, 300, { steps: 4 });
    expect(await elements(page)).toHaveLength(0);
  });

  test("an existing arrow can be switched to elbow and back", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    await draw(page, "r", [760, 340], [880, 440]);
    const arrow = await draw(page, "a", [480, 250], [820, 390]);
    expect(arrow.points).toHaveLength(2);
    await page.getByTestId("arrow-type-elbow").click();
    expect(abs((await elements(page)).at(-1)!).length).toBeGreaterThanOrEqual(3);
    await page.getByTestId("arrow-type-sharp").click();
    const back = (await elements(page)).at(-1)!;
    expect(back.points).toHaveLength(2);
    expect(back.startBinding).not.toBeNull();
  });

  test("point editing offers only the two ends: there are no midpoint handles", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    await draw(page, "r", [760, 340], [880, 440]);
    await page.keyboard.press("a");
    await page.getByTestId("arrow-type-elbow").click();
    await drag(page, [480, 250], [820, 390]);
    await page.keyboard.press("Control+Enter");
    expect((await appState(page)).editingLinearId).not.toBeNull();

    // The middle of the route is not a handle (on a plain arrow a midpoint would be): pressing there leaves editing.
    const p = abs((await elements(page)).at(-1)!);
    expect(p.length).toBeGreaterThanOrEqual(4);
    const mid: [number, number] = [(p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2];
    await page.mouse.move(...mid);
    await page.mouse.down();
    await page.mouse.up();
    expect((await appState(page)).editingLinearId).toBeNull();
  });

  test("an elbow arrow's end can be dragged free in point editing", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    const B = await draw(page, "r", [760, 340], [880, 440]);
    await page.keyboard.press("a");
    await page.getByTestId("arrow-type-elbow").click();
    await drag(page, [480, 250], [820, 390]);
    await page.keyboard.press("Control+Enter");
    const end = abs((await elements(page)).at(-1)!).at(-1)!;
    await drag(page, end, [900, 600]);
    const arrow = (await elements(page)).at(-1)!;
    expect(arrow.endBinding ?? null).toBeNull();
    expect(arrow.startBinding).not.toBeNull();
    expect(orthogonal(abs(arrow))).toBe(true);
    expect(abs(arrow).at(-1)).toEqual([900, 600]);
    // Dragged back onto B it attaches again.
    await drag(page, [900, 600], [820, 390]);
    expect((await elements(page)).at(-1)!.endBinding?.elementId).toBe(B.id);
  });
});

test.describe("flowchart mode", () => {
  test("Ctrl+arrow creates a connected shape and selects it", async ({ page }) => {
    const root = await draw(page, "r", [420, 200], [540, 260]);
    await page.keyboard.press("Control+ArrowRight");
    let els = await elements(page);
    const nodes = els.filter((e) => e.type === "rectangle");
    const arrows = els.filter((e) => e.type === "arrow");
    expect(nodes).toHaveLength(2);
    expect(arrows).toHaveLength(1);
    const node = nodes.find((n) => n.id !== root.id)!;
    expect(node.x).toBeCloseTo(root.x + root.width + 100, 0);
    expect(node.y).toBeCloseTo(root.y, 0);
    expect(node.width).toBeCloseTo(root.width, 0);
    expect(arrows[0].startBinding?.elementId).toBe(root.id);
    expect(arrows[0].endBinding?.elementId).toBe(node.id);
    expect((await appState(page)).selectedIds).toEqual([node.id]);

    // Chains onwards from the new shape in another direction.
    await page.keyboard.press("Control+ArrowDown");
    els = await elements(page);
    const third = els.filter((e) => e.type === "rectangle").at(-1)!;
    expect(third.x).toBeCloseTo(node.x, 0);
    expect(third.y).toBeCloseTo(node.y + node.height + 100, 0);
    await page.keyboard.press("Control+z");
    expect((await elements(page)).filter((e) => e.type === "rectangle")).toHaveLength(2);
  });

  test("holding Ctrl and repeating the key adds siblings in a column", async ({ page }) => {
    const root = await draw(page, "r", [420, 300], [540, 360]);
    await page.keyboard.down("Control");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Control");
    const els = await elements(page);
    const kids = els.filter((e) => e.type === "rectangle" && e.id !== root.id).sort((a, b) => a.y - b.y);
    expect(kids).toHaveLength(3);
    expect(new Set(kids.map((k) => Math.round(k.x))).size).toBe(1);
    expect(kids[1].y - kids[0].y).toBeCloseTo(100, 0);
    // Centred on the root's row.
    expect(kids[1].y + kids[1].height / 2).toBeCloseTo(root.y + root.height / 2, 0);
    expect(els.filter((e) => e.type === "arrow" && e.startBinding?.elementId === root.id)).toHaveLength(3);
  });

  test("Alt+arrow moves between connected shapes", async ({ page }) => {
    const root = await draw(page, "r", [420, 300], [540, 360]);
    await page.keyboard.press("Control+ArrowRight");
    const child = (await appState(page)).selectedIds[0];
    await page.keyboard.press("Alt+ArrowLeft");
    expect((await appState(page)).selectedIds).toEqual([root.id]);
    await page.keyboard.press("Alt+ArrowRight");
    expect((await appState(page)).selectedIds).toEqual([child]);
  });

  test("labels and other shapes work as the source", async ({ page }) => {
    await draw(page, "o", [420, 300], [540, 360]);
    await page.keyboard.press("Control+ArrowUp");
    const els = await elements(page);
    expect(els.filter((e) => e.type === "ellipse")).toHaveLength(2);
    expect(els.filter((e) => e.type === "arrow")).toHaveLength(1);
  });
});

test.describe("grid mode", () => {
  test("new shapes and moved shapes land on the grid; Ctrl bypasses it", async ({ page }) => {
    await clickToggle(page, "grid");
    expect((await appState(page)).gridMode).toBe(true);
    const rect = await draw(page, "r", [423, 217], [581, 333]);
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([420, 220, 160, 120]);

    await drag(page, [430, 220], [507, 251]); // by (77, 31): the corner ends up on the grid again
    const moved = (await elements(page))[0];
    expect(moved.x % 20).toBeCloseTo(0, 5);
    expect(moved.y % 20).toBeCloseTo(0, 5);
    expect(moved.x).toBe(500);
    expect(moved.y).toBe(260);

    await page.keyboard.press("Escape");
    const free = await draw(page, "r", [723, 417], [781, 473], { ctrl: true });
    expect([free.x, free.y]).toEqual([723, 417]);
  });

  test("resizing snaps the dragged edge", async ({ page }) => {
    await clickToggle(page, "grid");
    await draw(page, "r", [420, 220], [580, 340]);
    await drag(page, [586, 346], [633, 391]); // se handle, +47 / +45
    const r = (await elements(page))[0];
    expect(r.x + r.width).toBe(620);
    expect(r.y + r.height).toBe(380);
  });

  test("the setting is remembered across a reload", async ({ page }) => {
    await clickToggle(page, "grid");
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    expect((await appState(page)).gridMode).toBe(true);
    await expect(page.getByTestId("toggle-grid")).toHaveAttribute("aria-pressed", "true");
  });

  test("Ctrl+' toggles the grid", async ({ page }) => {
    await page.keyboard.press("Control+'");
    expect((await appState(page)).gridMode).toBe(true);
    await page.keyboard.press("Control+'");
    expect((await appState(page)).gridMode).toBe(false);
  });
});

test.describe("object snapping", () => {
  test("a moved shape lines up with another one, shows a guide, and Ctrl switches it off", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    const B = await draw(page, "r", [600, 350], [700, 420]);
    await page.keyboard.press("Alt+s");
    expect((await appState(page)).objectsSnap).toBe(true);

    // Move B so its left edge ends 4px right of A's left edge: it snaps onto it.
    await page.mouse.move(630, 350);
    await page.mouse.down();
    await page.mouse.move(454, 350, { steps: 12 });
    expect((await appState(page)).snapGuides.length).toBeGreaterThan(0);
    await page.mouse.up();
    expect((await appState(page)).snapGuides).toHaveLength(0);
    expect((await elements(page)).find((e) => e.id === B.id)!.x).toBeCloseTo(420, 0);

    // With Ctrl held there is no snapping.
    await page.keyboard.down("Control");
    await page.mouse.move(450, 350);
    await page.mouse.down();
    await page.mouse.move(456, 350, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Control");
    expect((await elements(page)).find((e) => e.id === B.id)!.x).toBeCloseTo(426, 0);
  });

  test("a shape dropped between two others snaps to equal gaps", async ({ page }) => {
    await draw(page, "r", [400, 200], [460, 260]);
    await draw(page, "r", [700, 200], [760, 260]);
    await page.keyboard.press("Alt+s");
    const M = await draw(page, "r", [545, 200], [605, 260]);
    expect(M.x).toBeCloseTo(545, 0);
    // A nudge of the pointer triggers the snap: gaps are 85 and 95, so it moves 5 to make both 90.
    // (Grab the top edge away from its middle, where the north resize handle is.)
    await page.mouse.move(555, 200);
    await page.mouse.down();
    await page.mouse.move(559, 200, { steps: 4 });
    const guides = (await appState(page)).snapGuides;
    expect(guides.filter((g) => g.kind === "gap").length).toBe(2);
    await page.mouse.up();
    const m = (await elements(page)).find((e) => e.id === M.id)!;
    expect(m.x).toBeCloseTo(550, 0);
  });

  test("resizing snaps the dragged edge to another element", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    await draw(page, "r", [600, 400], [700, 480]);
    await page.keyboard.press("Alt+s");
    // Drag B's west handle (6px outside its left edge at x = 600): the edge follows the pointer.
    await drag(page, [594, 440], [550, 440]);
    expect((await elements(page))[1].x).toBeCloseTo(556, 0); // 16 from A's right edge (540): out of reach, so free
    // 12 further left puts the edge 4px from A's right edge: it snaps onto it.
    await drag(page, [550, 440], [538, 440]);
    expect((await elements(page))[1].x).toBeCloseTo(540, 0);
  });

  test("new shapes snap their corners while drawing", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 300]);
    await page.keyboard.press("Alt+s");
    const r = await draw(page, "r", [424, 400], [537, 480]);
    expect(r.x).toBeCloseTo(420, 0); // left edge snapped to A's left edge
    expect(r.x + r.width).toBeCloseTo(540, 0); // right edge snapped to A's right edge
  });
});

test("a Phase 3 scene renders in light and dark without console errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await clickToggle(page, "grid");
  // A small flowchart: Start -> Decide -> Yes / No.
  await draw(page, "r", [320, 120], [460, 180]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Start");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+ArrowRight");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Decide");
  await page.keyboard.press("Escape");
  await page.keyboard.down("Control");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Control");

  // An elbow arrow between two shapes lower down.
  await page.keyboard.press("o");
  await drag(page, [320, 400], [440, 480]);
  await page.keyboard.press("d");
  await drag(page, [680, 520], [820, 620]);
  await page.keyboard.press("a");
  await page.getByTestId("arrow-type-elbow").click();
  await drag(page, [380, 440], [750, 570]);

  await page.keyboard.press("Escape");
  await page.mouse.click(1100, 720);
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("phase3-light.png") });
  await page.keyboard.press("Alt+Shift+KeyD");
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("phase3-dark.png") });

  expect(errors).toEqual([]);
});
