import { expect, test, type Page } from "@playwright/test";

// Elements as plain data, read through the test hook (only present when the dev server runs with VITE_E2E=1).
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
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  opacity: number;
  roughness: number;
  fontSize: number;
};

const elements = (page: Page): Promise<El[]> => page.evaluate(() => JSON.parse(JSON.stringify((window as never as { __sketchboard: { elements(): unknown } }).__sketchboard.elements())));
const appState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as never as { __sketchboard: { state(): Record<string, unknown> } }).__sketchboard.state();
    return JSON.parse(JSON.stringify(s)) as { tool: string; zoom: number; offsetX: number; offsetY: number; selectedIds: string[]; theme: string; toolLocked: boolean; currentItem: Record<string, unknown> };
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

/** Draws with a tool shortcut; returns the newly created element. */
async function draw(page: Page, key: string, from: [number, number], to: [number, number]): Promise<El> {
  const before = (await elements(page)).length;
  await page.keyboard.press(key);
  await drag(page, from, to);
  const els = await elements(page);
  expect(els.length).toBe(before + 1);
  return els[els.length - 1];
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
});

test.describe("drawing", () => {
  test("each shape tool creates its element with the dragged size", async ({ page }) => {
    const rect = await draw(page, "r", [400, 200], [560, 300]);
    expect(rect.type).toBe("rectangle");
    expect(rect.width).toBeCloseTo(160, 0);
    expect(rect.height).toBeCloseTo(100, 0);

    const diamond = await draw(page, "d", [600, 200], [700, 320]);
    expect(diamond.type).toBe("diamond");
    const ellipse = await draw(page, "o", [750, 200], [850, 260]);
    expect(ellipse.type).toBe("ellipse");
    const line = await draw(page, "l", [400, 450], [600, 500]);
    expect(line.type).toBe("line");
    expect(line.points).toEqual([
      [0, 0],
      [200, 50],
    ]);
    const arrow = await draw(page, "a", [650, 450], [850, 400]);
    expect(arrow.type).toBe("arrow");
    expect(arrow.points![1]).toEqual([200, -50]);
  });

  test("dragging up and left still makes a positive-size shape", async ({ page }) => {
    const rect = await draw(page, "r", [600, 400], [450, 300]);
    expect(rect.x).toBeCloseTo(450, 0);
    expect(rect.y).toBeCloseTo(300, 0);
    expect(rect.width).toBeCloseTo(150, 0);
  });

  test("Shift draws a square", async ({ page }) => {
    await page.keyboard.press("r");
    await drag(page, [400, 200], [560, 260], { shift: true });
    const [rect] = await elements(page);
    expect(rect.width).toBeCloseTo(rect.height, 0);
  });

  test("a plain click with a shape tool draws nothing", async ({ page }) => {
    await page.keyboard.press("r");
    await page.mouse.click(500, 300);
    expect(await elements(page)).toHaveLength(0);
  });

  test("the tool returns to selection after drawing, unless it is locked", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    expect((await appState(page)).tool).toBe("selection");

    await page.keyboard.press("q");
    expect((await appState(page)).toolLocked).toBe(true);
    await draw(page, "r", [600, 200], [700, 280]);
    expect((await appState(page)).tool).toBe("rectangle");
  });

  test("freedraw records the path and keeps the pen active", async ({ page }) => {
    await page.keyboard.press("p");
    await page.mouse.move(400, 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(400 + i * 10, 300 + Math.sin(i / 3) * 40);
    await page.mouse.up();
    const [pen] = await elements(page);
    expect(pen.type).toBe("freedraw");
    expect(pen.points!.length).toBeGreaterThan(10);
    expect((await appState(page)).tool).toBe("freedraw");
  });

  test("a multi-point line: click, click, click, then Enter", async ({ page }) => {
    await page.keyboard.press("l");
    await page.mouse.click(400, 300);
    await page.mouse.move(500, 350, { steps: 5 });
    await page.mouse.click(500, 350);
    await page.mouse.move(600, 300, { steps: 5 });
    await page.mouse.click(600, 300);
    await page.mouse.move(650, 360, { steps: 5 });
    await page.keyboard.press("Enter");
    const [line] = await elements(page);
    expect(line.type).toBe("line");
    expect(line.points).toEqual([
      [0, 0],
      [100, 50],
      [200, 0],
    ]);
    expect((await appState(page)).selectedIds).toEqual([line.id]);
  });

  test("Shift snaps a line to 15 degree steps", async ({ page }) => {
    await page.keyboard.press("l");
    await page.keyboard.down("Shift");
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(600, 305, { steps: 8 }); // almost horizontal
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const [line] = await elements(page);
    expect(line.points![1][1]).toBeCloseTo(0, 3);
  });
});

test.describe("text", () => {
  test("type with the text tool and finish with Escape", async ({ page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(500, 300);
    await expect(page.getByTestId("text-editor")).toBeFocused();
    await page.keyboard.type("Hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    await page.keyboard.press("Escape");
    const [text] = await elements(page);
    expect(text.type).toBe("text");
    expect(text.text).toBe("Hello\nworld");
    expect(text.height).toBeGreaterThan(40); // two lines
    await expect(page.getByTestId("text-editor")).toHaveCount(0);
  });

  test("empty text is discarded", async ({ page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(500, 300);
    await page.keyboard.press("Escape");
    expect(await elements(page)).toHaveLength(0);
  });

  test("double-click empty canvas creates text; double-click text edits it", async ({ page }) => {
    await page.mouse.dblclick(500, 300);
    await page.keyboard.type("first");
    await page.keyboard.press("Control+Enter");
    let els = await elements(page);
    expect(els[0].text).toBe("first");

    const t = els[0];
    await page.mouse.dblclick(t.x + t.width / 2, t.y + t.height / 2);
    await expect(page.getByTestId("text-editor")).toBeFocused();
    await page.keyboard.type("second"); // replaces the selected text
    await page.keyboard.press("Escape");
    els = await elements(page);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("second");
  });

  test("text is undone as a whole", async ({ page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(500, 300);
    await page.keyboard.type("abc");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(0);
    await page.keyboard.press("Control+Shift+z");
    expect((await elements(page))[0].text).toBe("abc");
  });
});

test.describe("selection", () => {
  test("click selects, dragging moves, undo and redo restore the position", async ({ page }) => {
    const rect = await draw(page, "r", [400, 200], [560, 300]);
    // Grab the left edge away from its midpoint, where the west resize handle sits.
    await page.mouse.click(400, 220);
    expect((await appState(page)).selectedIds).toEqual([rect.id]);

    await drag(page, [400, 220], [450, 300]);
    let [moved] = await elements(page);
    expect(moved.x).toBeCloseTo(450, 0);
    expect(moved.y).toBeCloseTo(280, 0);

    await page.keyboard.press("Control+z");
    [moved] = await elements(page);
    expect(moved.x).toBeCloseTo(400, 0);
    expect(moved.y).toBeCloseTo(200, 0);

    await page.keyboard.press("Control+Shift+z");
    [moved] = await elements(page);
    expect(moved.x).toBeCloseTo(450, 0);
  });

  test("clicking the empty inside of an unfilled shape selects nothing", async ({ page }) => {
    await draw(page, "r", [400, 200], [600, 400]);
    await page.mouse.click(1000, 600);
    expect((await appState(page)).selectedIds).toEqual([]);
    await page.mouse.click(500, 300);
    expect((await appState(page)).selectedIds).toEqual([]);
  });

  test("box select picks fully enclosed elements, Shift extends the selection", async ({ page }) => {
    const a = await draw(page, "r", [400, 200], [480, 260]);
    const b = await draw(page, "o", [560, 200], [640, 260]);
    const c = await draw(page, "r", [800, 500], [880, 560]);
    await drag(page, [360, 160], [700, 320]);
    expect((await appState(page)).selectedIds.sort()).toEqual([a.id, b.id].sort());

    // Shift + box adds the third.
    await page.keyboard.down("Shift");
    await drag(page, [760, 460], [920, 600]);
    await page.keyboard.up("Shift");
    expect((await appState(page)).selectedIds.sort()).toEqual([a.id, b.id, c.id].sort());
  });

  test("a box that only touches an element does not select it", async ({ page }) => {
    await draw(page, "r", [400, 200], [600, 400]);
    await drag(page, [380, 180], [500, 300]);
    expect((await appState(page)).selectedIds).toEqual([]);
  });

  test("Shift-click toggles an element in the selection", async ({ page }) => {
    const a = await draw(page, "r", [400, 200], [480, 260]);
    const b = await draw(page, "r", [600, 200], [680, 260]);
    await page.mouse.click(400, 230);
    await page.keyboard.down("Shift");
    await page.mouse.click(600, 230);
    expect((await appState(page)).selectedIds.sort()).toEqual([a.id, b.id].sort());
    await page.mouse.click(600, 230);
    await page.keyboard.up("Shift");
    expect((await appState(page)).selectedIds).toEqual([a.id]);
  });

  test("Alt-drag duplicates instead of moving", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    await page.mouse.click(400, 215);
    await drag(page, [400, 215], [600, 415], { alt: true });
    const els = await elements(page);
    expect(els).toHaveLength(2);
    expect(els[0].x).toBeCloseTo(400, 0);
    expect(els[1].x).toBeCloseTo(600, 0);
    expect(els[1].y).toBeCloseTo(400, 0);
  });

  test("Shift while dragging locks the axis", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    await page.mouse.click(400, 215);
    await drag(page, [400, 215], [560, 245], { shift: true });
    const [el] = await elements(page);
    expect(el.x).toBeCloseTo(560, 0);
    expect(el.y).toBeCloseTo(200, 0);
  });

  test("delete, duplicate, select all and arrow-key nudging", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    await draw(page, "o", [600, 200], [700, 280]);
    await page.keyboard.press("Control+a");
    expect((await appState(page)).selectedIds).toHaveLength(2);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    let els = await elements(page);
    expect(els[0].x).toBeCloseTo(401, 0);
    expect(els[0].y).toBeCloseTo(205, 0);

    await page.keyboard.press("Control+d");
    els = await elements(page);
    expect(els).toHaveLength(4);
    expect(els[2].x).toBeCloseTo(els[0].x + 10, 0);
    expect((await appState(page)).selectedIds).toHaveLength(2);

    await page.keyboard.press("Delete");
    expect(await elements(page)).toHaveLength(2);
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(4);
  });

  test("Escape clears the selection", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    expect((await appState(page)).selectedIds).toHaveLength(1);
    await page.keyboard.press("Escape");
    expect((await appState(page)).selectedIds).toHaveLength(0);
  });
});

test.describe("transform", () => {
  test("dragging a corner handle resizes, undo restores", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    // The se handle sits 6px outside the corner.
    await drag(page, [506, 286], [606, 336]);
    let [rect] = await elements(page);
    expect(rect.x).toBeCloseTo(400, 0);
    expect(rect.width).toBeCloseTo(200, 0);
    expect(rect.height).toBeCloseTo(130, 0);

    await page.keyboard.press("Control+z");
    [rect] = await elements(page);
    expect(rect.width).toBeCloseTo(100, 0);
  });

  test("dragging the north-west handle keeps the opposite corner fixed", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    // The handle moves by exactly as much as the pointer (it is grabbed 6px outside the corner, no jump).
    await drag(page, [394, 194], [350, 150]);
    const [rect] = await elements(page);
    expect(rect.x + rect.width).toBeCloseTo(500, 0);
    expect(rect.y + rect.height).toBeCloseTo(280, 0);
    expect(rect.width).toBeCloseTo(144, 0);
    expect(rect.height).toBeCloseTo(124, 0);
  });

  test("Shift keeps the aspect ratio while resizing", async ({ page }) => {
    await draw(page, "r", [400, 200], [600, 300]); // 2:1
    await drag(page, [606, 306], [706, 316], { shift: true });
    const [rect] = await elements(page);
    expect(rect.width / rect.height).toBeCloseTo(2, 1);
  });

  test("the rotation handle turns the element; Shift snaps to 15 degrees", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 300]);
    // Rotation handle: above the top-centre, 6px pad + 26px offset.
    await drag(page, [450, 168], [550, 250]); // pointer to the right of the centre
    let [rect] = await elements(page);
    expect(rect.angle).toBeGreaterThan(0.5);

    await page.keyboard.press("Control+z");
    await page.mouse.click(1000, 700); // deselect
    await page.mouse.click(400, 250);
    await drag(page, [450, 168], [560, 250], { shift: true });
    [rect] = await elements(page);
    const step = Math.PI / 12;
    expect(rect.angle / step).toBeCloseTo(Math.round(rect.angle / step), 5);
  });

  test("a group of elements resizes together", async ({ page }) => {
    await draw(page, "r", [400, 200], [450, 250]);
    await draw(page, "r", [550, 200], [600, 250]);
    await page.keyboard.press("Control+a");
    // Group box is 200 wide: its east handle is at x = 606.
    await drag(page, [606, 225], [806, 225]);
    const els = await elements(page);
    expect(els[0].width).toBeCloseTo(100, 0);
    expect(els[1].x).toBeCloseTo(700, 0);
    expect(els[1].width).toBeCloseTo(100, 0);
  });

  test("text scales its font size from a corner", async ({ page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(500, 300);
    await page.keyboard.type("Scale me");
    await page.keyboard.press("Escape");
    const [text] = await elements(page);
    const right = text.x + text.width + 6;
    const bottom = text.y + text.height + 6;
    await drag(page, [right, bottom], [right + text.width, bottom + text.height]);
    const [scaled] = await elements(page);
    expect(scaled.fontSize).toBeGreaterThan(text.fontSize * 1.5);
  });
});

test.describe("eraser", () => {
  test("erases what the stroke touches and can be undone", async ({ page }) => {
    await draw(page, "r", [400, 200], [600, 300]);
    await draw(page, "o", [700, 200], [800, 300]);
    await page.keyboard.press("e");
    await drag(page, [380, 200], [620, 200]); // crosses the rectangle's top edge only
    expect(await elements(page)).toHaveLength(1);
    expect((await elements(page))[0].type).toBe("ellipse");
    await page.keyboard.press("Control+z");
    expect(await elements(page)).toHaveLength(2);
  });
});

test.describe("viewport", () => {
  test("Ctrl+wheel zooms around the pointer", async ({ page }) => {
    await draw(page, "r", [600, 300], [700, 380]);
    const before = await appState(page);
    await page.keyboard.down("Control");
    await page.mouse.move(650, 340);
    await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    const after = await appState(page);
    expect(after.zoom).toBeGreaterThan(before.zoom * 1.2);
    // The scene point under the pointer stays put.
    const sceneBefore = (650 - before.offsetX) / before.zoom;
    const sceneAfter = (650 - after.offsetX) / after.zoom;
    expect(sceneAfter).toBeCloseTo(sceneBefore, 3);
  });

  test("plain wheel pans", async ({ page }) => {
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 120);
    expect((await appState(page)).offsetY).toBeCloseTo(-120, 0);
  });

  test("Space + drag pans without changing the tool", async ({ page }) => {
    await page.mouse.move(640, 400);
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(740, 460, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    const s = await appState(page);
    expect(s.offsetX).toBeCloseTo(100, 0);
    expect(s.offsetY).toBeCloseTo(60, 0);
    expect(s.tool).toBe("selection");
  });

  test("zoom buttons and reset", async ({ page }) => {
    await page.getByTestId("zoom-in").click();
    expect((await appState(page)).zoom).toBeCloseTo(1.2, 2);
    await page.getByTestId("zoom-out").click();
    await page.getByTestId("zoom-out").click();
    expect((await appState(page)).zoom).toBeCloseTo(1 / 1.2, 2);
    await page.getByTestId("zoom-reset").click();
    expect((await appState(page)).zoom).toBe(1);
  });

  test("drawing while zoomed in lands at the right scene coordinates", async ({ page }) => {
    await page.getByTestId("zoom-in").click(); // 1.2x about the centre
    const rect = await draw(page, "r", [500, 300], [620, 396]);
    expect(rect.width).toBeCloseTo(100, 0); // 120px on screen / 1.2
    expect(rect.height).toBeCloseTo(80, 0);
  });
});

test.describe("properties", () => {
  test("changing the stroke colour of the selection", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    await page.getByTestId("stroke-color").locator('button[title="#dc2626"]').click();
    const [rect] = await elements(page);
    expect(rect.strokeColor).toBe("#dc2626");
    await page.keyboard.press("Control+z");
    expect((await elements(page))[0].strokeColor).toBe("#1e1e1e");
  });

  test("palette popover and hex input set a custom colour", async ({ page }) => {
    await draw(page, "r", [400, 200], [500, 280]);
    await page.getByTestId("background-color-open").click();
    await page.getByTestId("background-color-blue-2").click();
    expect((await elements(page))[0].backgroundColor).toBe("#93c5fd");

    await page.getByTestId("background-color-hex").fill("ff8800");
    await page.getByTestId("background-color-hex").press("Enter");
    expect((await elements(page))[0].backgroundColor).toBe("#ff8800");

    await page.getByTestId("background-color-hex").fill("nonsense");
    await page.getByTestId("background-color-hex").press("Enter");
    await expect(page.getByTestId("background-color-hex")).toHaveAttribute("aria-invalid", "true");
    expect((await elements(page))[0].backgroundColor).toBe("#ff8800");
  });

  test("with nothing selected the panel changes the next element", async ({ page }) => {
    await page.keyboard.press("r");
    await page.getByTestId("fill-style-cross-hatch").click();
    await page.getByTestId("sloppiness-2").click();
    await drag(page, [400, 200], [500, 280]);
    const [rect] = await elements(page);
    expect(rect.fillStyle).toBe("cross-hatch");
    expect(rect.roughness).toBe(2);
  });

  test("opacity slider and text options", async ({ page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(500, 300);
    await page.keyboard.type("Styled");
    await page.keyboard.press("Escape");
    const [before] = await elements(page);
    await page.getByTestId("font-size-XL").click();
    await page.getByTestId("font-family-code").click();
    const [after] = await elements(page);
    expect(after.fontSize).toBe(36);
    expect(after.width).toBeGreaterThan(before.width);
    await page.getByTestId("opacity").fill("50");
    expect((await elements(page))[0].opacity).toBe(50);
  });

  test("Escape closes the colour popover without leaving the current tool", async ({ page }) => {
    await page.keyboard.press("r");
    await page.getByTestId("stroke-color-open").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await appState(page)).tool).toBe("rectangle");
  });

  test("the panel only shows options that apply", async ({ page }) => {
    await page.keyboard.press("r");
    await expect(page.getByTestId("fill-style")).toBeVisible();
    await expect(page.getByTestId("font-size")).toHaveCount(0);
    await page.keyboard.press("t");
    await expect(page.getByTestId("font-size")).toBeVisible();
    await expect(page.getByTestId("fill-style")).toHaveCount(0);
    await page.keyboard.press("e");
    await expect(page.getByTestId("properties-panel")).toHaveCount(0);
  });
});

test.describe("persistence and theme", () => {
  test("the scene survives a reload", async ({ page }) => {
    await draw(page, "r", [400, 200], [560, 300]);
    await draw(page, "o", [650, 200], [750, 260]);
    await page.waitForTimeout(700); // autosave is debounced
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    const els = await elements(page);
    expect(els.map((e) => e.type)).toEqual(["rectangle", "ellipse"]);
    expect(els[0].width).toBeCloseTo(160, 0);
  });

  test("deleted elements stay deleted after a reload", async ({ page }) => {
    await draw(page, "r", [400, 200], [560, 300]);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);
    expect(await elements(page)).toHaveLength(0);
  });

  test("the theme toggle switches data-theme and survives a reload", async ({ page }) => {
    const html = page.locator("html");
    const initial = await html.getAttribute("data-theme");
    await page.getByTestId("theme-toggle").click();
    const toggled = initial === "dark" ? "light" : "dark";
    await expect(html).toHaveAttribute("data-theme", toggled);
    await page.waitForTimeout(700);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", toggled);
  });
});

test.describe("toolbar", () => {
  test("clicking tool buttons and the keyboard stay in sync", async ({ page }) => {
    await page.getByTestId("tool-ellipse").click();
    expect((await appState(page)).tool).toBe("ellipse");
    await expect(page.getByTestId("tool-ellipse")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("5");
    await expect(page.getByTestId("tool-arrow")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    expect((await appState(page)).tool).toBe("selection");
  });

  test("undo and redo buttons reflect and drive the history", async ({ page }) => {
    await expect(page.getByTestId("undo")).toBeDisabled();
    await draw(page, "r", [400, 200], [500, 280]);
    await expect(page.getByTestId("undo")).toBeEnabled();
    await page.getByTestId("undo").click();
    expect(await elements(page)).toHaveLength(0);
    await expect(page.getByTestId("redo")).toBeEnabled();
    await page.getByTestId("redo").click();
    expect(await elements(page)).toHaveLength(1);
  });
});
