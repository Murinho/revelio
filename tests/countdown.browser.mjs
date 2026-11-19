import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  server: { host: "127.0.0.1", port: 5198 },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const start = new Date("2026-03-20T16:00:00Z");
  const beforeStart = new Date(start.getTime() - 300_000);
  await page.clock.install({ time: beforeStart });
  await page.clock.pauseAt(beforeStart);
  let releaseSnapshot;
  const snapshotReady = new Promise((resolve) => { releaseSnapshot = resolve; });
  await page.route("https://codeforces.com/api/**", async (route) => {
    await snapshotReady;
    await route.fulfill({ json: { status: "OK", result: [] } });
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole("button", { name: "/scoreboard/106416", exact: true }).click();
  const timer = page.getByRole("timer");
  await timer.waitFor();
  assert.equal(await timer.textContent(), "00:05:00");
  assert.equal(await page.locator(".app__layout, .scoreboard-toolbar__summary, .loading-card").count(), 0);
  assert.equal(await page.getByRole("button").count(), 2);
  assert.equal(await page.getByRole("heading", { name: "The 2026 ICPC Latin America Championship" }).count(), 1);

  // Verify the clock's rounding and all phase boundaries independently of rendering.
  await page.evaluate(async () => {
    const { buildContestClock } = await import("/src/hooks/useContestClock.ts");
    const { createDefaultContestConfiguration } = await import("/src/domain/contestConfiguration.ts");
    const configuration = {
      ...createDefaultContestConfiguration(),
      startAtUtc: "2026-03-20T16:00",
    };
    const startMs = Date.parse("2026-03-20T16:00:00Z");
    for (const [offset, phase, label] of [
      [-3_661_000, "standby", "01:01:01"],
      [-300_000, "standby", "00:05:00"],
      [-299_999, "standby", "00:05:00"],
      [-1, "standby", "00:00:01"],
      [0, "play", "00:00:00"],
      [14_400_000, "frozen", "00:00:00"],
      [18_000_000, "complete", "00:00:00"],
    ]) {
      const clock = buildContestClock(configuration, startMs + offset);
      if (clock.phase !== phase || clock.countdownLabel !== label) {
        throw new Error(`Unexpected clock at offset ${offset}: ${JSON.stringify(clock)}`);
      }
    }
  });

  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const countdown = document.querySelector(".contest-countdown").getBoundingClientRect();
      const time = document.querySelector(".contest-countdown__time");
      const name = document.querySelector(".contest-countdown__name");
      const timeRect = time.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      return {
        centered: Math.abs(timeRect.left + timeRect.width / 2 - innerWidth / 2) < 1,
        verticallyCentered: Math.abs((timeRect.top + nameRect.bottom) / 2 - (countdown.top + countdown.height / 2)) < 1,
        smallerName: parseFloat(getComputedStyle(name).fontSize) < parseFloat(getComputedStyle(time).fontSize),
        nameBelowTime: nameRect.top > timeRect.bottom,
        noOverflow: document.documentElement.scrollWidth === innerWidth,
      };
    });
    assert.ok(Object.values(layout).every(Boolean), JSON.stringify({ width, ...layout }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const snapshotResponse = page.waitForResponse("https://codeforces.com/api/**");
  releaseSnapshot();
  await snapshotResponse;
  await page.clock.runFor(299_000);
  assert.equal(await timer.textContent(), "00:00:01");
  assert.equal(await page.locator(".app__layout").count(), 0);
  await page.clock.runFor(1000);
  await page.locator(".app__layout").waitFor();
  assert.equal(await timer.count(), 0);
  assert.equal(await page.locator(".timer-panel__clock").textContent(), "0:00:00");
  assert.equal(await page.locator(".submission-list, .scoreboard-table, .scoreboard-toolbar__summary").count(), 3);
  assert.equal(await page.getByRole("button", { name: "Edit Contest", exact: true }).count(), 1);
  await page.getByRole("button", { name: "Edit Contest", exact: true }).click();
  await page.getByRole("heading", { name: "Edit Contest", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Countdown formatting, pending snapshot, responsive layout, start transition, and edit navigation passed.");
} finally {
  await browser?.close();
  await server.close();
}
