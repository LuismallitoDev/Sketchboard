import { expect, test, type Page } from "@playwright/test";

// Phase 2: groups, layers, alignment, flip, lock, point editing, labels, curves, arrowheads, polygons, style tools.

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
  containerId?: string | null;
  wrapWidth?: number | null;
  autoResize?: boolean;
  boundElements?: { id: string; type: string }[] | null;
  groupIds: string[];
  locked: boolean;
  polygon?: boolean;
  arrowType?: string;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  strokeColor: string;
  backgroundColor: string;
  isDeleted: boolean;
};

const hook = (page: Page) => (window: unknown) => (window as { __sketchboard: { elements(): unknown; state(): unknown; store: { scene: { all(): unknown } } } }).__sketchboard;
void hook;

const elements = (page: Page): Promise<El[]> =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as never as { __sketchboard: { elements(): unknown } }).__sketchboard.elements())));
/** Every element including soft-deleted ones, in z-order. */
const allElements = (page: Page): Promise<El[]> =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as never as { __sketchboard: { store: { scene: { all(): unknown } } } }).__sketchboard.store.scene.all())));
const appState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as { __sketchboard: { state(): unknown } }).__sketchboard.state();
    return JSON.parse(JSON.stringify(s)) as {
      tool: string;
      selectedIds: string[];
      editingLinearId: string | null;
      selectedPoints: number[];
      viewBackgroundColor: string;
      eyedropper: { color: string | null } | null;
      dialog: string | null;
    };
  });

async function drag(page: Page, from: [number, number], to: [number, number], opts: { alt?: boolean } = {}) {
  if (opts.alt) await page.keyboard.down("Alt");
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 10 });
  await page.mouse.up();
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

/** Gives a rectangle a double-click label and returns the label element. */
async function addLabel(page: Page, at: [number, number], text: string): Promise<El> {
  await page.mouse.dblclick(...at);
  await expect(page.getByTestId("text-editor")).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
  const label = (await elements(page)).find((e) => e.type === "text" && e.containerId);
  expect(label).toBeTruthy();
  return label!;
}

const center = (e: El): [number, number] => [e.x + e.width / 2, e.y + e.height / 2];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
});

test.describe("groups", () => {
  test("group, select as one, deep select, move together, ungroup", async ({ page }) => {
    const a = await draw(page, "r", [420, 200], [500, 260]);
    const b = await draw(page, "r", [600, 200], [680, 260]);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+g");
    const grouped = await elements(page);
    expect(grouped[0].groupIds).toHaveLength(1);
    expect(grouped[0].groupIds).toEqual(grouped[1].groupIds);

    await page.mouse.click(1000, 700); // deselect
    await page.mouse.click(420, 230); // edge of the first rectangle
    expect((await appState(page)).selectedIds.sort()).toEqual([a.id, b.id].sort());

    // Ctrl-click picks only one member.
    await page.mouse.click(1000, 700);
    await page.keyboard.down("Control");
    await page.mouse.click(420, 230);
    await page.keyboard.up("Control");
    expect((await appState(page)).selectedIds).toEqual([a.id]);

    // Dragging a group moves every member.
    await page.mouse.click(1000, 700);
    await page.mouse.click(420, 215);
    await drag(page, [420, 215], [420, 315]);
    const moved = await elements(page);
    expect(moved[0].y).toBeCloseTo(300, 0);
    expect(moved[1].y).toBeCloseTo(300, 0);

    await page.keyboard.press("Control+Shift+g");
    expect((await elements(page))[0].groupIds).toEqual([]);
    await page.mouse.click(1000, 700);
    await page.mouse.click(420, 315);
    expect((await appState(page)).selectedIds).toEqual([a.id]);
  });

  test("a box only takes a group when it holds every member", async ({ page }) => {
    await draw(page, "r", [420, 200], [480, 250]);
    await draw(page, "r", [600, 200], [660, 250]);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+g");
    await page.mouse.click(1000, 700);
    await drag(page, [380, 160], [520, 300]); // covers only the first one
    expect((await appState(page)).selectedIds).toEqual([]);
    await drag(page, [380, 160], [720, 300]);
    expect((await appState(page)).selectedIds).toHaveLength(2);
  });
});

test.describe("layers, alignment, flip and lock", () => {
  test("keyboard shortcuts change the z-order", async ({ page }) => {
    const a = await draw(page, "r", [420, 200], [580, 320]);
    const b = await draw(page, "r", [500, 260], [660, 380]);
    await page.mouse.click(1000, 700);
    await page.mouse.click(420, 215); // the first rectangle's left edge, away from the second
    await page.keyboard.press("Control+BracketRight"); // forward, over the overlapping one
    expect((await elements(page)).map((e) => e.id)).toEqual([b.id, a.id]);
    await page.keyboard.press("Control+Shift+BracketLeft"); // to back
    expect((await elements(page)).map((e) => e.id)).toEqual([a.id, b.id]);
    await page.keyboard.press("Control+Shift+BracketRight"); // to front
    expect((await elements(page)).map((e) => e.id)).toEqual([b.id, a.id]);
    await page.keyboard.press("Control+z");
    expect((await elements(page)).map((e) => e.id)).toEqual([a.id, b.id]);
  });

  test("align and distribute from the panel and keyboard", async ({ page }) => {
    await draw(page, "r", [420, 200], [500, 260]);
    await draw(page, "r", [440, 320], [520, 380]);
    await draw(page, "r", [800, 440], [880, 500]);
    await page.keyboard.press("Control+a");
    await page.getByTestId("action-align:left").click();
    let els = await elements(page);
    expect(els.map((e) => Math.round(e.x))).toEqual([420, 420, 420]);

    await page.keyboard.press("Control+Shift+ArrowUp");
    els = await elements(page);
    expect(els.map((e) => Math.round(e.y))).toEqual([200, 200, 200]);

    // Spread them along x first, then distribute.
    await page.keyboard.press("Escape");
    await page.mouse.click(420, 230);
    await page.keyboard.press("ArrowRight"); // nudges only the clicked one, so the three differ
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Alt+h");
    els = await elements(page);
    const xs = els.map((e) => e.x).sort((p, q) => p - q);
    expect(xs.length).toBe(3);
  });

  test("distribute leaves equal gaps", async ({ page }) => {
    await draw(page, "r", [420, 200], [480, 260]);
    await draw(page, "r", [500, 200], [560, 260]);
    await draw(page, "r", [800, 200], [860, 260]);
    await page.keyboard.press("Control+a");
    await page.getByTestId("action-distribute:h").click();
    const xs = (await elements(page)).map((e) => e.x).sort((p, q) => p - q);
    expect(xs[1] - (xs[0] + 60)).toBeCloseTo(xs[2] - (xs[1] + 60), 0);
  });

  test("flip mirrors a line in place and Shift+V flips vertically", async ({ page }) => {
    const arrow = await draw(page, "a", [420, 300], [620, 350]);
    expect(arrow.points![1]).toEqual([200, 50]);
    await page.keyboard.press("Shift+h");
    let [flipped] = await elements(page);
    expect(flipped.x).toBeCloseTo(620, 0);
    expect(flipped.points![1][0]).toBeCloseTo(-200, 0);
    await page.keyboard.press("Shift+v");
    [flipped] = await elements(page);
    expect(flipped.y).toBeCloseTo(350, 0);
    expect(flipped.points![1][1]).toBeCloseTo(-50, 0);
    await page.keyboard.press("Control+z");
    [flipped] = await elements(page);
    expect(flipped.y).toBeCloseTo(300, 0);
  });

  test("lock makes an element unselectable until Unlock", async ({ page }) => {
    const rect = await draw(page, "r", [420, 200], [580, 320]);
    await page.keyboard.press("Control+Shift+l");
    expect((await elements(page))[0].locked).toBe(true);
    expect((await appState(page)).selectedIds).toEqual([]);
    await page.mouse.click(420, 215);
    expect((await appState(page)).selectedIds).toEqual([]);
    await page.mouse.click(420, 215);
    await drag(page, [420, 215], [520, 315]); // a locked element cannot be dragged
    expect((await elements(page))[0].x).toBeCloseTo(420, 0);

    await page.getByTestId("unlock-all").click();
    expect((await elements(page))[0].locked).toBe(false);
    expect((await appState(page)).selectedIds).toEqual([rect.id]);
    await expect(page.getByTestId("unlock-all")).toHaveCount(0);
  });
});

test.describe("point editing", () => {
  test("add a point by dragging a midpoint, remove it, and leave with Escape", async ({ page }) => {
    await draw(page, "l", [420, 300], [620, 300]);
    await page.keyboard.press("Enter");
    expect((await appState(page)).editingLinearId).not.toBeNull();

    await drag(page, [520, 300], [520, 380]); // the midpoint handle becomes a new vertex
    let [line] = await elements(page);
    expect(line.points).toEqual([
      [0, 0],
      [100, 80],
      [200, 0],
    ]);

    await page.mouse.click(520, 380); // select that vertex
    expect((await appState(page)).selectedPoints).toEqual([1]);
    await page.keyboard.press("Delete");
    [line] = await elements(page);
    expect(line.points).toHaveLength(2);
    expect((await elements(page)).length).toBe(1); // the line itself was not deleted

    await page.keyboard.press("Escape");
    expect((await appState(page)).editingLinearId).toBeNull();
    await page.keyboard.press("Control+z");
    [line] = await elements(page);
    expect(line.points).toHaveLength(3);
  });

  test("moving the first point re-anchors the line", async ({ page }) => {
    await draw(page, "l", [420, 300], [620, 300]);
    await page.keyboard.press("Enter");
    await drag(page, [420, 300], [400, 340]);
    const [line] = await elements(page);
    expect(line.x).toBeCloseTo(400, 0);
    expect(line.y).toBeCloseTo(340, 0);
    expect(line.points![0]).toEqual([0, 0]);
    expect(line.points![1][0]).toBeCloseTo(220, 0);
  });

  test("double-click edits a line; Ctrl+double-click edits an arrow's points", async ({ page }) => {
    await draw(page, "l", [420, 300], [620, 300]);
    await page.keyboard.press("Escape");
    await page.mouse.dblclick(520, 300);
    expect((await appState(page)).editingLinearId).not.toBeNull();
    await page.keyboard.press("Escape");

    await draw(page, "a", [420, 450], [620, 450]);
    await page.keyboard.press("Escape");
    await page.keyboard.down("Control");
    await page.mouse.dblclick(520, 450);
    await page.keyboard.up("Control");
    expect((await appState(page)).editingLinearId).not.toBeNull();
  });

  test("clicking elsewhere leaves point editing", async ({ page }) => {
    await draw(page, "l", [420, 300], [620, 300]);
    await page.keyboard.press("Enter");
    await page.mouse.click(900, 600);
    expect((await appState(page)).editingLinearId).toBeNull();
  });
});

test.describe("labels", () => {
  test("double-click inside a shape adds a centred label that follows the shape", async ({ page }) => {
    const rect = await draw(page, "r", [420, 200], [620, 320]);
    const label = await addLabel(page, [520, 260], "Hello");
    expect(label.text).toBe("Hello");
    expect(label.containerId).toBe(rect.id);
    const [cx, cy] = center(label);
    expect(cx).toBeCloseTo(520, 0);
    expect(cy).toBeCloseTo(260, 0);
    expect((await appState(page)).selectedIds).toEqual([rect.id]);

    // Dragging the shape carries its label.
    await drag(page, [420, 215], [470, 295]);
    const els = await elements(page);
    const movedLabel = els.find((e) => e.type === "text")!;
    expect(movedLabel.x).toBeCloseTo(label.x + 50, 0);
    expect(movedLabel.y).toBeCloseTo(label.y + 80, 0);
  });

  test("long text wraps and the shape grows to hold it; undo removes label and growth together", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 300]);
    await page.mouse.dblclick(520, 250);
    await page.keyboard.type("word ".repeat(30));
    await page.keyboard.press("Escape");
    const els = await elements(page);
    const rect = els.find((e) => e.type === "rectangle")!;
    const label = els.find((e) => e.type === "text")!;
    expect(rect.height).toBeGreaterThan(110);
    expect(label.height).toBeGreaterThan(60);
    expect(label.wrapWidth).toBeCloseTo(188, 0);

    await page.keyboard.press("Control+z");
    const after = await elements(page);
    expect(after.find((e) => e.type === "text")).toBeUndefined();
    expect(after[0].height).toBeCloseTo(100, 0);
  });

  test("Enter on a selected shape edits its label", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 300]);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("text-editor")).toBeFocused();
    await page.keyboard.type("via enter");
    await page.keyboard.press("Control+Enter");
    expect((await elements(page)).find((e) => e.type === "text")?.text).toBe("via enter");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("text-editor")).toHaveValue("via enter"); // edits the same label
    await page.keyboard.press("Escape");
    expect((await elements(page)).filter((e) => e.type === "text")).toHaveLength(1);
  });

  test("an empty label leaves nothing behind", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 300]);
    await page.mouse.dblclick(520, 250);
    await page.keyboard.press("Escape");
    const els = await elements(page);
    expect(els).toHaveLength(1);
    expect(els[0].boundElements ?? null).toBeNull();
    // Only the drawing is in the history.
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(0);
  });

  test("an arrow's label sits at the middle of the arrow", async ({ page }) => {
    await draw(page, "a", [420, 400], [620, 400]);
    await page.keyboard.press("Enter");
    await page.keyboard.type("go");
    await page.keyboard.press("Escape");
    const label = (await elements(page)).find((e) => e.type === "text")!;
    const [cx, cy] = center(label);
    expect(cx).toBeCloseTo(520, 0);
    expect(cy).toBeCloseTo(400, 0);
    expect(label.wrapWidth).toBeNull();
  });

  test("deleting the shape deletes its label, and undo brings both back", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 300]);
    await addLabel(page, [520, 250], "bye");
    await page.keyboard.press("Delete");
    expect(await elements(page)).toHaveLength(0);
    await page.keyboard.press("Control+z");
    expect((await elements(page)).map((e) => e.type)).toEqual(["rectangle", "text"]);
  });

  test("Alt-drag duplicates a shape together with its label", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 300]);
    await addLabel(page, [520, 250], "dup");
    await drag(page, [420, 215], [420, 415], { alt: true });
    const els = await elements(page);
    expect(els.filter((e) => e.type === "rectangle")).toHaveLength(2);
    const labels = els.filter((e) => e.type === "text");
    expect(labels).toHaveLength(2);
    const containers = new Set(labels.map((l) => l.containerId));
    expect(containers.size).toBe(2);
    expect(labels[1].y - labels[0].y).toBeCloseTo(200, 0);
  });

  test("Ctrl+Shift+Enter wraps free text in a rectangle", async ({ page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(500, 300);
    await page.keyboard.type("boxed");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+Shift+Enter");
    const els = await elements(page);
    const text = els.find((e) => e.type === "text")!;
    const box = els.find((e) => e.type === "rectangle")!;
    expect(text.containerId).toBe(box.id);
    expect(box.width).toBeGreaterThan(text.width);
    expect(els[1].type).toBe("text"); // the label is stacked right above its box
    expect((await appState(page)).selectedIds).toEqual([box.id]);
  });

  test("unbind turns a label into free text", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 300]);
    await addLabel(page, [520, 250], "free me");
    await page.getByTestId("action-unbindText").click();
    const els = await elements(page);
    expect(els.find((e) => e.type === "text")!.containerId).toBeNull();
    await expect(page.getByTestId("action-unbindText")).toHaveCount(0);
  });
});

test.describe("free text width", () => {
  test("fixed-width text wraps and the side handles change its width", async ({ page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(450, 300);
    await page.keyboard.type("one two three four five six seven eight nine ten");
    await page.keyboard.press("Escape");
    const [t0] = await elements(page);
    expect(t0.autoResize).toBe(true);

    await page.getByTestId("text-mode-fixed").click();
    let [t] = await elements(page);
    expect(t.autoResize).toBe(false);
    expect(t.wrapWidth).toBeCloseTo(t0.width, 0);

    // Drag the east handle 150px to the left: the text re-wraps into more lines.
    await drag(page, [t.x + t.width + 6, t.y + t.height / 2], [t.x + t.width + 6 - 150, t.y + t.height / 2]);
    [t] = await elements(page);
    expect(t.wrapWidth).toBeCloseTo(t0.width - 150, 0);
    expect(t.height).toBeGreaterThan(t0.height * 1.8);

    await page.getByTestId("text-mode-auto").click();
    [t] = await elements(page);
    expect(t.wrapWidth).toBeNull();
    expect(t.width).toBeCloseTo(t0.width, 0);
  });
});

test.describe("curves, arrowheads and polygons", () => {
  test("a curved arrow gets a bow and its arrowheads can be chosen", async ({ page }) => {
    await page.keyboard.press("a");
    await page.getByTestId("arrow-type-round").click();
    await drag(page, [420, 400], [700, 400]);
    let [arrow] = await elements(page);
    expect(arrow.arrowType).toBe("round");
    expect(arrow.points).toHaveLength(3);

    await page.getByTestId("arrowhead-end-open").click();
    await page.getByTestId("arrowhead-end-triangle_outline").click();
    await page.getByTestId("arrowhead-start-open").click();
    await page.getByTestId("arrowhead-start-crowfoot_many").click();
    [arrow] = await elements(page);
    expect(arrow.endArrowhead).toBe("triangle_outline");
    expect(arrow.startArrowhead).toBe("crowfoot_many");

    await page.getByTestId("arrowhead-end-open").click();
    await page.getByTestId("arrowhead-end-none").click();
    expect((await elements(page))[0].endArrowhead).toBeNull();
  });

  test("switching a straight arrow to curved adds the bow point", async ({ page }) => {
    await draw(page, "a", [420, 400], [700, 400]);
    expect((await elements(page))[0].points).toHaveLength(2);
    await page.getByTestId("arrow-type-round").click();
    expect((await elements(page))[0].points).toHaveLength(3);
  });

  test("a curved line is hit along the curve, not along the chord", async ({ page }) => {
    await page.keyboard.press("l");
    await page.getByTestId("line-style-curved").click();
    await drag(page, [420, 400], [700, 400]);
    const [line] = await elements(page);
    expect(line.arrowType).toBe("round");
    await page.mouse.click(1000, 700);
    // The bow is 56px off the chord (20% of 280): the chord itself is empty.
    await page.mouse.click(560, 400);
    expect((await appState(page)).selectedIds).toEqual([]);
  });

  test("clicking back on the first point closes a line into a fillable polygon", async ({ page }) => {
    await page.keyboard.press("l");
    await page.mouse.click(450, 300);
    await page.mouse.move(600, 300, { steps: 4 });
    await page.mouse.click(600, 300);
    await page.mouse.move(525, 420, { steps: 4 });
    await page.mouse.click(525, 420);
    await page.mouse.move(452, 302, { steps: 4 });
    await page.mouse.click(450, 300);
    let [poly] = await elements(page);
    expect(poly.polygon).toBe(true);
    expect(poly.points).toHaveLength(4);
    expect(poly.points![3]).toEqual([0, 0]);

    // Filled polygons are selectable from the inside.
    await page.getByTestId("fill-style-solid").click();
    await page.getByTestId("background-color").locator('button[title="#bbf7d0"]').click();
    await page.mouse.click(1000, 700);
    await page.mouse.click(525, 340);
    expect((await appState(page)).selectedIds).toEqual([poly.id]);

    // And it can be opened again.
    await page.getByTestId("action-togglePolygon").click();
    [poly] = await elements(page);
    expect(poly.polygon).toBe(false);
    expect(poly.points).toHaveLength(3);
  });

  test("an open line is closed from the panel", async ({ page }) => {
    await page.keyboard.press("l");
    await page.mouse.click(450, 300);
    await page.mouse.move(600, 300, { steps: 4 });
    await page.mouse.click(600, 300);
    await page.mouse.move(525, 420, { steps: 4 });
    await page.mouse.click(525, 420); // the third vertex; Enter then drops the trailing preview point
    await page.mouse.move(600, 460, { steps: 4 });
    await page.keyboard.press("Enter");
    expect((await elements(page))[0].points).toHaveLength(3);
    expect((await elements(page))[0].polygon).toBe(false);
    await page.getByTestId("action-togglePolygon").click();
    expect((await elements(page))[0].polygon).toBe(true);
  });

  test("the arrowhead popover closes with Escape and keeps the tool", async ({ page }) => {
    await page.keyboard.press("a");
    await page.getByTestId("arrowhead-end-open").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await appState(page)).tool).toBe("arrow");
  });
});

test.describe("style tools", () => {
  test("convert a shape to another shape and a line to an arrow", async ({ page }) => {
    await draw(page, "r", [420, 200], [560, 300]);
    await page.getByTestId("shape-type-ellipse").click();
    expect((await elements(page))[0].type).toBe("ellipse");
    await page.getByTestId("shape-type-diamond").click();
    expect((await elements(page))[0].type).toBe("diamond");
    await page.keyboard.press("Control+z");
    expect((await elements(page))[0].type).toBe("ellipse");

    await draw(page, "l", [420, 400], [620, 400]);
    await page.getByTestId("linear-type-arrow").click();
    const last = (await elements(page)).at(-1)!;
    expect(last.type).toBe("arrow");
    expect(last.endArrowhead).toBe("arrow");
  });

  test("copy style and paste style between elements", async ({ page }) => {
    await draw(page, "r", [420, 200], [540, 280]);
    await page.getByTestId("stroke-color").locator('button[title="#dc2626"]').click();
    await page.getByTestId("fill-style-solid").click();
    await page.getByTestId("background-color").locator('button[title="#fef08a"]').click();
    await draw(page, "o", [640, 200], [760, 280]);
    await page.mouse.click(1000, 700);
    await page.mouse.click(420, 215); // the red rectangle
    await page.keyboard.press("Control+Alt+c");
    await page.mouse.click(1000, 700);
    await page.mouse.click(640, 225); // the ellipse's left edge area
    await page.keyboard.press("Control+Alt+v");
    const [rect, ellipse] = await elements(page);
    expect(ellipse.strokeColor).toBe(rect.strokeColor);
    expect(ellipse.backgroundColor).toBe("#fef08a");
  });

  test("the canvas background can be changed with nothing selected", async ({ page }) => {
    await expect(page.getByTestId("canvas-background")).toBeVisible();
    await page.getByTestId("canvas-background").locator('button[title="#f8f9fa"]').click();
    expect((await appState(page)).viewBackgroundColor).toBe("#f8f9fa");
    await page.getByTestId("canvas-background-open").click();
    await page.getByTestId("canvas-background-hex").fill("fffce8");
    await page.getByTestId("canvas-background-hex").press("Enter");
    expect((await appState(page)).viewBackgroundColor).toBe("#fffce8");
    // Selecting something swaps the panel to the element's options.
    await page.keyboard.press("Escape");
    await draw(page, "r", [420, 200], [540, 280]);
    await expect(page.getByTestId("canvas-background")).toHaveCount(0);
    await expect(page.getByTestId("fill-style")).toBeVisible();
  });

  test("the eyedropper copies a colour from the canvas", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 320]);
    await page.getByTestId("fill-style-solid").click();
    await page.getByTestId("background-color-open").click();
    await page.getByTestId("background-color-blue-2").click();
    await page.keyboard.press("Escape"); // closes the popover only
    expect((await elements(page))[0].backgroundColor).toBe("#93c5fd");

    await page.getByTestId("stroke-color-eyedropper").click();
    await page.mouse.move(520, 260, { steps: 3 });
    await expect(page.getByTestId("eyedropper-chip")).toContainText("#93c5fd");
    await page.mouse.click(520, 260);
    expect((await appState(page)).eyedropper).toBeNull();
    expect((await elements(page))[0].strokeColor).toBe("#93c5fd");
  });

  test("Escape cancels the eyedropper without changing anything", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 320]);
    await page.keyboard.press("i");
    expect((await appState(page)).eyedropper).not.toBeNull();
    await page.keyboard.press("Escape");
    expect((await appState(page)).eyedropper).toBeNull();
    expect((await appState(page)).selectedIds).toHaveLength(1);
    expect((await elements(page))[0].strokeColor).toBe("#1e1e1e");
  });
});

test.describe("clear canvas", () => {
  test("asks first, clears everything, and can be undone", async ({ page }) => {
    await draw(page, "r", [420, 200], [520, 280]);
    await draw(page, "o", [640, 200], [740, 280]);
    await page.getByTestId("clear-canvas").click();
    await expect(page.getByTestId("dialog-confirm")).toBeVisible();
    await page.getByTestId("dialog-cancel").click();
    expect(await elements(page)).toHaveLength(2);

    await page.keyboard.press("Control+Delete");
    await page.getByTestId("dialog-confirm").click();
    expect(await elements(page)).toHaveLength(0);
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(2);
  });

  test("Escape closes the dialog without clearing", async ({ page }) => {
    await draw(page, "r", [420, 200], [520, 280]);
    await page.keyboard.press("Control+Delete");
    await expect(page.getByTestId("dialog-confirm")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dialog-confirm")).toHaveCount(0);
    expect(await elements(page)).toHaveLength(1);
  });
});

test.describe("persistence", () => {
  test("labels, groups, curves and polygons survive a reload", async ({ page }) => {
    await draw(page, "r", [420, 200], [620, 300]);
    await addLabel(page, [520, 250], "kept");
    await page.keyboard.press("a");
    await page.getByTestId("arrow-type-round").click();
    await drag(page, [420, 450], [700, 450]);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+g");
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    const els = await elements(page);
    expect(els.map((e) => e.type)).toEqual(["rectangle", "text", "arrow"]);
    expect(els[1].containerId).toBe(els[0].id);
    expect(els[1].text).toBe("kept");
    expect(els[2].arrowType).toBe("round");
    expect(els[0].groupIds).toHaveLength(1);
    expect(els[0].groupIds).toEqual(els[2].groupIds);
  });
});

test("a Phase 2 scene renders in light and dark without console errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await draw(page, "r", [330, 120], [530, 240]);
  await addLabel(page, [430, 180], "Start here");
  await draw(page, "d", [620, 110], [780, 250]);
  await addLabel(page, [700, 180], "Choice");
  await page.getByTestId("shape-type-ellipse").click();

  // A curved arrow with a triangle head and a label.
  await page.keyboard.press("a");
  await page.getByTestId("arrow-type-round").click();
  await page.getByTestId("arrowhead-end-open").click();
  await page.getByTestId("arrowhead-end-triangle").click();
  await drag(page, [540, 180], [610, 180]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("yes");
  await page.keyboard.press("Escape");

  // Entity-relationship arrows.
  for (const [i, [start, end]] of ([
    ["crowfoot_many", "cardinality_exactly_one"],
    ["cardinality_zero_or_many", "crowfoot_one_or_many"],
    ["circle_outline", "diamond"],
  ] as const).entries()) {
    await page.keyboard.press("a");
    await page.getByTestId("arrow-type-sharp").click();
    await page.getByTestId("arrowhead-start-open").click();
    await page.getByTestId(`arrowhead-start-${start}`).click();
    await page.getByTestId("arrowhead-end-open").click();
    await page.getByTestId(`arrowhead-end-${end}`).click();
    await drag(page, [360, 330 + i * 70], [600, 330 + i * 70]);
  }

  // A filled polygon.
  await page.keyboard.press("l");
  await page.getByTestId("line-style-straight").click();
  await page.mouse.click(700, 330);
  await page.mouse.move(820, 340, { steps: 4 });
  await page.mouse.click(820, 340);
  await page.mouse.move(780, 460, { steps: 4 });
  await page.mouse.click(780, 460);
  await page.mouse.move(702, 332, { steps: 4 });
  await page.mouse.click(700, 330);
  await page.getByTestId("fill-style-hachure").click();
  await page.getByTestId("background-color").locator('button[title="#fecaca"]').click();

  // Fixed-width text.
  await page.keyboard.press("t");
  await page.mouse.click(880, 150);
  await page.keyboard.type("A long caption that wraps");
  await page.keyboard.press("Escape");
  await page.getByTestId("text-mode-fixed").click();
  const [text] = (await elements(page)).filter((e) => e.type === "text" && !e.containerId);
  await drag(page, [text.x + text.width + 6, text.y + text.height / 2], [text.x + 110, text.y + text.height / 2]);

  await page.keyboard.press("Escape");
  await page.mouse.click(1100, 700);
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("phase2-light.png") });
  await page.keyboard.press("Alt+Shift+KeyD");
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("phase2-dark.png") });

  expect(errors).toEqual([]);
});
