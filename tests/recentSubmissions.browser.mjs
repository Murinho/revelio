import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5197 },
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client"] },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: Number(process.env.WIDTH || 1440), height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const result = await page.evaluate(async () => {
    const { React, createRoot, flushSync } =
      await import("/tests/fixtures/submissionMotionRuntime.ts");
    const { RecentSubmissionsPanel } =
      await import("/src/components/RecentSubmissionsPanel.tsx");
    const check = (value, message) => {
      if (!value) throw Error(message);
    };
    const close = (a, b, message) =>
      check(Math.abs(a - b) < 0.1, `${message}: ${a} vs ${b}`);
    const host = document.createElement("div");
    host.style.cssText =
      "position:absolute;inset:0 auto auto 0;z-index:100;background:#07111a;padding:24px;--team-width:260px";
    document.body.append(host);
    const root = createRoot(host);
    const problem = { id: "A", label: "A", color: "#57f2af" };
    const entry = (id) => ({
      id: String(id),
      teamName: `Team ${id}`,
      teamId: `team-${id}`,
      contestMinute: id,
      problemLabel: "A",
      summary: "? +0",
      status: "pending",
      kind: "queued",
    });
    const team = {
      id: "team",
      name: "Team",
      rank: 1,
      solved: 0,
      penalty: 0,
      marked: false,
      pendingProblemLabels: ["A"],
      problems: [
        {
          kind: "queued",
          problemId: "A",
          problemLabel: "A",
          wrongAttempts: 0,
          frozenSubmissionCount: 1,
        },
      ],
    };
    let current = [];
    let beforeAnimations = new Set();
    const render = (items) => {
      beforeAnimations = new Set(rows().flatMap((r) => r.getAnimations()));
      current = items;
      flushSync(() =>
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(RecentSubmissionsPanel, {
              problems: [problem],
              teams: [team],
              submissions: items,
            }),
          ),
        ),
      );
    };
    const rows = () => [...host.querySelectorAll("li")];
    const freeze = (time) =>
      rows().forEach((r) =>
        r.getAnimations().forEach((a) => {
          a.pause();
          a.currentTime = time;
        }),
      );
    const freezeNew = () =>
      rows().forEach((r) =>
        r.getAnimations().forEach((a) => {
          if (!beforeAnimations.has(a)) {
            a.pause();
            a.currentTime = 0;
          }
        }),
      );
    const advance = (time) =>
      rows().forEach((r) =>
        r.getAnimations().forEach((a) => {
          a.pause();
          a.currentTime = Math.min(1500, Number(a.currentTime) + time);
        }),
      );
    const top = (r) => r.getBoundingClientRect().top;
    const opacity = (r) => Number(getComputedStyle(r).opacity);
    render(Array.from({ length: 20 }, (_, i) => entry(20 - i)));
    check(
      rows().every((r) => r.getAnimations().length === 0),
      "initial history must not animate",
    );
    const old = rows()[0],
      originalTop = top(old);
    render([entry(21), ...current].slice(0, 20));
    freeze(0);
    check(rows().length === 20, "feed cap retained");
    check(opacity(rows()[0]) === 0, "newest row starts invisible");
    close(
      top(old),
      originalTop,
      "old row starts at its original visual position",
    );
    const motion = old.getAnimations()[0];
    check(motion.effect.getTiming().duration === 1500, "scoreboard duration");
    check(
      motion.effect.getTiming().easing === "cubic-bezier(0.65, 0, 0.35, 1)",
      "scoreboard easing",
    );
    const positions = [];
    for (const time of [0, 150, 375, 600, 750, 900, 1125, 1350, 1499]) {
      freeze(time);
      positions.push(top(old));
      check(opacity(rows()[0]) >= 0 && opacity(rows()[0]) <= 1, "valid fade");
    }
    check(
      positions.every((p, i) => i === 0 || p >= positions[i - 1]),
      "push is monotonic",
    );
    freeze(600);
    const before = rows()
      .slice(0, 15)
      .map((r) => ({ element: r, top: top(r), opacity: opacity(r) }));
    render([entry(24), entry(23), entry(22), ...current].slice(0, 20));
    freezeNew();
    before.forEach((r) => {
      close(top(r.element), r.top, "interrupted movement has no position jump");
      close(
        opacity(r.element),
        r.opacity,
        "interrupted fade has no opacity jump",
      );
    });
    check(
      rows()
        .slice(0, 3)
        .every((r) => opacity(r) === 0),
      "whole incoming batch fades",
    );
    freeze(500);
    const animatedRows = rows().map((r) => r.getAnimations());
    render(current.map((s) => ({ ...s, status: "rejected", summary: "−1" })));
    rows().forEach((r, i) =>
      check(
        r.getAnimations().every((a, j) => a === animatedRows[i][j]),
        "verdict update must not restart movement",
      ),
    );
    freeze(750);
    let overlapChecks = 0;
    for (let i = 0; i < rows().length; i++)
      for (let j = i + 1; j < rows().length; j++) {
        const a = rows()[i].getBoundingClientRect(),
          b = rows()[j].getBoundingClientRect();
        const t = Math.max(a.top, b.top),
          bottom = Math.min(a.bottom, b.bottom);
        if (bottom - t < 2 || t < 0 || bottom > innerHeight) continue;
        const x = a.left + 20,
          y = (t + bottom) / 2;
        const hit = document.elementFromPoint(x, y)?.closest("li");
        const covering = rows().find((r) => {
          const q = r.getBoundingClientRect();
          return y >= q.top && y <= q.bottom && opacity(r) > 0;
        });
        check(
          hit === covering,
          "newer row must paint over older rows during overlap",
        );
        overlapChecks++;
      }
    // Repeated arrivals well inside the 1500ms animation window.
    for (let i = 25; i < 125; i++) {
      advance(90);
      const survivors = rows()
        .slice(0, 19)
        .map((r) => ({ r, top: top(r), opacity: opacity(r) }));
      render([entry(i), ...current].slice(0, 20));
      freezeNew();
      survivors.forEach(({ r, top: t, opacity: o }) => {
        close(top(r), t, "rapid burst position continuity");
        close(opacity(r), o, "rapid burst opacity continuity");
      });
      check(rows().length === 20, "burst never exceeds feed limit");
      check(
        rows().every(
          (r, index) =>
            r.querySelector(".submission-list__team").title ===
            current[index].teamName,
        ),
        "arrival order is preserved",
      );
      check(
        rows().every((r) => r.getAnimations().length <= 2),
        "at most one movement and one entrance per row",
      );
    }
    check(
      rows()
        .slice(17)
        .every((r) => opacity(r) === 1),
      "continued arrivals cannot postpone existing fades",
    );
    // A complete replacement should fade in without retaining stale rows.
    render(Array.from({ length: 20 }, (_, i) => entry(200 - i)));
    freeze(0);
    check(
      rows().every((r) => opacity(r) === 0),
      "complete replacement fades all incoming rows",
    );
    freeze(1500);
    rows().forEach((r) => {
      close(opacity(r), 1, "settled opacity");
      check(
        getComputedStyle(r).transform === "none" ||
          new DOMMatrixReadOnly(getComputedStyle(r).transform).m42 === 0,
        "settled geometry",
      );
    });
    render([]);
    check(rows().length === 0, "empty feed clears cleanly");
    render([entry(201)]);
    freeze(0);
    check(
      opacity(rows()[0]) === 0,
      "first live arrival after empty feed fades",
    );
    freeze(1500);
    render([
      entry(208),
      entry(207),
      entry(206),
      entry(205),
      entry(204),
      ...current,
    ]);
    freeze(1500);
    render([entry(209), ...current]);
    freeze(750);
    window.motionTest = { render, rows, entry, root, host };
    return {
      positions,
      overlapChecks,
      rapidArrivals: 100,
      simultaneousBatch: 3,
      fullReplacement: 20,
    };
  });
  assert.ok(result.overlapChecks > 0);
  if (process.env.SCREENSHOT_PATH)
    await page.screenshot({ path: process.env.SCREENSHOT_PATH });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(async () => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const t = window.motionTest;
    if (t.rows().some((r) => r.getAnimations().length))
      throw Error("motion preference change must cancel active animation");
    t.render([t.entry(203), t.entry(202)]);
    if (
      t
        .rows()
        .some(
          (r) =>
            r.getAnimations().length ||
            Number(getComputedStyle(r).opacity) !== 1,
        )
    )
      throw Error("reduced motion rows must render immediately");
    t.root.unmount();
    t.host.remove();
    return true;
  });
  assert.equal(reduced, true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        ...result,
        reducedMotion: reduced,
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await server.close();
}
