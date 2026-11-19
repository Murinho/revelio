import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  server: { host: "127.0.0.1", port: 5199 },
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
  const result = await page.evaluate(async () => {
    const { React, createRoot, flushSync } =
      await import("/tests/fixtures/submissionMotionRuntime.ts");
    const { RecentSubmissionsPanel } =
      await import("/src/components/RecentSubmissionsPanel.tsx");
    const { ScoreboardTable } =
      await import("/src/components/ScoreboardTable.tsx");
    const check = (value, message) => {
      if (!value) throw Error(message);
    };
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const root = createRoot(host);
    const problem = { id: "A", label: "A", color: "#57f2af" };
    const pendingCell = {
      kind: "queued",
      problemId: "A",
      problemLabel: "A",
      wrongAttempts: 0,
      frozenSubmissionCount: 1,
    };
    const render = (status = "pending") => {
      const cell = status === "pending" ? { ...pendingCell } : status === "accepted"
        ? { ...pendingCell, kind: "solved", solveTime: 10, penalty: 10, firstToSolve: true }
        : { ...pendingCell, kind: "failed", wrongAttempts: 1 };
      const team = {
        id: "team", name: "Team", rank: 1, solved: status === "accepted" ? 1 : 0,
        penalty: 0, marked: false, pendingProblemLabels: [], problems: [cell],
      };
      const submission = {
        id: "submission", teamId: "team", teamName: "Team", contestMinute: 10,
        problemLabel: "A", summary: status === "pending" ? "? +0" : "X +1",
        status, kind: "queued",
      };
      flushSync(() => root.render(React.createElement(React.StrictMode, null,
        React.createElement(ScoreboardTable, { problems: [problem], teams: [team] }),
        React.createElement(RecentSubmissionsPanel, {
          problems: [problem], teams: [team], submissions: [submission],
        }),
      )));
    };
    const cells = () => [...host.querySelectorAll(".problem-cell")];
    const heartbeat = (cell) => cell.getAnimations({ subtree: true }).find(
      (animation) => animation.animationName === "pending-cell-heartbeat",
    );
    const overlayOpacity = (cell) => Number(getComputedStyle(cell, "::before").opacity);
    const textStyle = (cell) => [...cell.querySelectorAll("span")].map((span) => {
      const style = getComputedStyle(span);
      return [style.color, style.opacity, style.transform];
    });
    render();
    check(cells().length === 2, "both views render a pending cell");
    const animations = cells().map(heartbeat);
    const textStyles = cells().map(textStyle);
    animations.forEach((animation) => {
      check(animation, "pending cell has a heartbeat");
      const timing = animation.effect.getTiming();
      check(timing.duration === 1200 && timing.iterations === 3, "exactly three pulses");
      animation.pause();
    });
    for (const [time, opacity] of [[0, 0], [600, 1], [1200, 0], [1800, 1], [2400, 0], [3000, 1], [3600, 0], [5000, 0]]) {
      animations.forEach((animation) => { animation.currentTime = time; });
      cells().forEach((cell, index) => {
        check(overlayOpacity(cell) === opacity, `correct background phase at ${time}ms`);
        check(JSON.stringify(textStyle(cell)) === JSON.stringify(textStyles[index]), "text stays unchanged");
        check(getComputedStyle(cell).backgroundImage === "linear-gradient(rgb(255, 228, 115), rgb(255, 202, 54))", "original yellow remains underneath");
      });
    }
    animations.forEach((animation) => { animation.currentTime = 300; });
    cells().forEach((cell) => check(overlayOpacity(cell) > 0 && overlayOpacity(cell) < 1, "smooth intermediate shade"));
    render();
    cells().forEach((cell, index) => check(heartbeat(cell) === animations[index], "snapshot refresh does not restart pulse"));
    for (const status of ["rejected", "compilation-error", "accepted"]) {
      render();
      const active = cells().map(heartbeat);
      active.forEach((animation) => { animation.pause(); animation.currentTime = 600; });
      render(status);
      cells().forEach((cell) => {
        check(!heartbeat(cell), "verdict immediately removes heartbeat");
        check(getComputedStyle(cell, "::before").content === "none", "verdict removes dark overlay");
        check(cell.classList.contains(status === "accepted" ? "problem-cell--solved" : "problem-cell--failed"), "correct verdict style");
      });
      check(active.every((animation) => animation.playState === "idle"), "interrupted animations are cancelled");
    }
    render();
    window.pendingCellTest = { cells, heartbeat, overlayOpacity, root };
    return { views: 2, pulses: 3, verdicts: 3 };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.evaluate(() => {
    const test = window.pendingCellTest;
    const result = test.cells().every((cell) => !test.heartbeat(cell) && test.overlayOpacity(cell) === 0);
    test.root.unmount();
    return result;
  });
  assert.equal(reducedMotion, true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, ...result, reducedMotion, consoleErrors: errors }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
