import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  server: { host: "127.0.0.1", port: 5200 },
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client"] },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { React, createRoot, flushSync } =
      await import("/tests/fixtures/submissionMotionRuntime.ts");
    const { RecentSubmissionsPanel } =
      await import("/src/components/RecentSubmissionsPanel.tsx");
    const { ScoreboardTable } =
      await import("/src/components/ScoreboardTable.tsx");
    const check = (value, message) => { if (!value) throw Error(message); };
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const root = createRoot(host);
    const problem = { id: "A", label: "A", color: "#57f2af" };
    const render = (status, minute = null, firstToSolve = true) => {
      const cell = status === "accepted"
        ? { kind: "solved", problemId: "A", problemLabel: "A", wrongAttempts: 1,
            solveTime: 10, penalty: 30, firstToSolve }
        : { kind: "queued", problemId: "A", problemLabel: "A", wrongAttempts: 1,
            frozenSubmissionCount: 1 };
      const team = { id: "team", name: "Team", rank: 1, solved: 1, penalty: 30,
        marked: false, pendingProblemLabels: [], problems: [cell] };
      const submission = { id: "submission", teamId: "team", teamName: "Team",
        contestMinute: 10, problemLabel: "A", summary: "? +1", status, kind: "queued" };
      flushSync(() => root.render(React.createElement(React.StrictMode, null,
        React.createElement(ScoreboardTable, {
          problems: [problem], teams: [team], firstToSolveTwinkleMinute: minute,
        }),
        React.createElement(RecentSubmissionsPanel, {
          problems: [problem], teams: [team], submissions: [submission],
          firstToSolveTwinkleMinute: minute,
        }),
      )));
    };
    const cells = () => [...host.querySelectorAll(".problem-cell")];
    const twinkle = (cell) => cell.getAnimations().find(
      (animation) => animation.animationName === "first-to-solve-cell-background-twinkle",
    );
    render("pending");
    check(cells().every((cell) => !twinkle(cell)), "pending cells do not twinkle");
    render("accepted");
    const revealedCells = cells();
    const revealedAnimations = cells().map(twinkle);
    check(revealedAnimations.every(Boolean), "both views twinkle on verdict reveal away from a minute boundary");
    check(cells()[0].querySelector(".problem-cell__bottom").textContent === "10", "table retains solve time");
    check(cells()[1].querySelector(".problem-cell__bottom").textContent === "30", "queue retains penalty");
    revealedAnimations.forEach((animation) => { animation.pause(); });
    for (const time of [0, 600, 1200, 2400, 4200]) {
      revealedAnimations.forEach((animation) => { animation.currentTime = time; });
      check(getComputedStyle(cells()[0]).backgroundColor === getComputedStyle(cells()[1]).backgroundColor,
        `matching background colors at ${time}ms`);
    }
    render("accepted");
    check(cells().every((cell, i) => twinkle(cell) === revealedAnimations[i]), "refresh does not restart twinkles");
    render("accepted", 55);
    const boundaryAnimations = cells().map(twinkle);
    check(cells().every((cell, i) => cell === revealedCells[i]), "minute trigger keeps cell DOM and row motion intact");
    check(boundaryAnimations.every((animation, i) => animation && animation !== revealedAnimations[i]),
      "minute boundary restarts both active reveal animations");
    boundaryAnimations.forEach((animation) => { animation.pause(); animation.currentTime = 2000; });
    render("accepted", 55);
    check(cells().every((cell, i) => twinkle(cell) === boundaryAnimations[i]), "same minute does not restart animation");
    boundaryAnimations.forEach((animation) => { animation.finish(); });
    // Let native animationend events remove the temporary background and sheen.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    check(cells().every((cell) => !cell.classList.contains("problem-cell--first-to-solve-twinkle")),
      "finished twinkles restore the normal solved background");
    render("accepted", 56);
    check(cells().every((cell) => twinkle(cell)), "next minute restarts completed animations");
    render("accepted", 56, false);
    check(cells().every((cell) => !twinkle(cell)), "ordinary accepted cells never twinkle");
    root.unmount();
  });

  // Exercise the actual App clock wiring at the requested full-minute examples.
  const startMs = Date.parse("2026-03-20T16:00:00Z");
  const time = new Date(startMs + (54 * 60 + 59) * 1000);
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.route("https://codeforces.com/api/**", (route) => route.fulfill({
    json: { status: "OK", result: [{
      id: 1, relativeTimeSeconds: 600,
      problem: { contestId: 106416, index: "A" },
      author: { contestId: 106416, participantType: "CONTESTANT", members: [{ handle: "team" }] },
      verdict: "OK",
    }] },
  }));
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole("button", { name: "/scoreboard/106416", exact: true }).click();
  await page.locator(".scoreboard-table .problem-cell--first-to-solve").waitFor();
  const capture = () => page.evaluate(() => {
    const cells = [
      document.querySelector(".scoreboard-table .problem-cell--first-to-solve"),
      document.querySelector(".submission-list .problem-cell--first-to-solve"),
    ];
    const animations = cells.map((cell) => cell?.getAnimations().find(
      (animation) => animation.animationName === "first-to-solve-cell-background-twinkle",
    ));
    if (!animations.every(Boolean)) throw Error("Both views must twinkle at the full minute");
    window.lastTwinkles = animations;
  });
  await capture();
  await page.clock.runFor(1000);
  assert.equal(await page.locator(".timer-panel__clock").textContent(), "0:55:00");
  await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".problem-cell--first-to-solve")];
    if (!cells.every((cell, i) => cell.getAnimations().some((a) =>
      a.animationName === "first-to-solve-cell-background-twinkle" && a !== window.lastTwinkles[i]))) {
      throw Error("0:55:00 must restart the reveal animation in both views");
    }
  });
  // Jump close to the second example without replaying hours of polling timers.
  await page.clock.setSystemTime(new Date(startMs + (173 * 60 + 59) * 1000));
  await page.clock.runFor(1000);
  assert.equal(await page.locator(".timer-panel__clock").textContent(), "2:54:00");
  await capture();
  assert.deepEqual(errors, []);
  console.log("First-to-solve reveal, refresh stability, overlapping and completed minute restarts, backgrounds, and App clock boundaries passed.");
} finally {
  await browser?.close();
  await server.close();
}
