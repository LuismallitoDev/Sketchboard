import { expect, test, type Page } from "@playwright/test";

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 10 });
  await page.mouse.up();
}

/** Draws a varied scene, checks nothing logged an error, and saves screenshots (test-results/) for a visual check. */
test("a mixed scene renders in light and dark without console errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.waitForFunction(() => (window as never as { __sketchboard?: unknown }).__sketchboard !== undefined);

  // Filled, hatched rectangle.
  await page.keyboard.press("r");
  await page.getByTestId("background-color-open").click();
  await page.getByTestId("background-color-blue-2").click();
  await page.keyboard.press("Escape");
  await drag(page, [320, 140], [520, 260]);

  // Cross-hatched diamond with a different colour.
  await page.keyboard.press("d");
  await page.getByTestId("background-color").locator('button[title="#bbf7d0"]').click();
  await page.getByTestId("fill-style-cross-hatch").click();
  await drag(page, [580, 130], [740, 280]);

  // Solid ellipse, cartoonist roughness.
  await page.keyboard.press("o");
  await page.getByTestId("background-color").locator('button[title="#fecaca"]').click();
  await page.getByTestId("fill-style-solid").click();
  await page.getByTestId("sloppiness-2").click();
  await drag(page, [800, 140], [960, 260]);

  // Dashed arrow, then a multi-point line.
  await page.keyboard.press("a");
  await page.getByTestId("stroke-style-dashed").click();
  await drag(page, [340, 330], [620, 380]);
  await page.keyboard.press("l");
  await page.mouse.click(700, 330);
  await page.mouse.move(760, 400, { steps: 4 });
  await page.mouse.click(760, 400);
  await page.mouse.move(840, 340, { steps: 4 });
  await page.mouse.click(840, 340);
  await page.mouse.move(900, 410, { steps: 4 });
  await page.keyboard.press("Enter");

  // A pen scribble.
  await page.keyboard.press("p");
  await page.mouse.move(340, 470);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(340 + i * 8, 470 + Math.sin(i / 3) * 40);
  await page.mouse.up();

  // Text in the three fonts.
  for (const [i, font] of (["hand", "normal", "code"] as const).entries()) {
    await page.keyboard.press("t");
    await page.getByTestId(`font-family-${font}`).click();
    await page.mouse.click(720, 480 + i * 50);
    await page.keyboard.type(`${font} font — Sketchboard`);
    await page.keyboard.press("Escape");
  }

  // Select the rectangle so the handles show.
  await page.keyboard.press("v");
  await page.mouse.click(320, 160);
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("scene-light.png") });

  await page.keyboard.press("Alt+Shift+KeyD");
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("scene-dark.png") });

  expect(errors).toEqual([]);
});
