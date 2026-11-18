import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Compile only the domain modules exercised here, without adding a test runtime.
// The production build separately checks the complete TypeScript application.
const output = mkdtempSync(join(tmpdir(), "revelio-participants-"));
after(() => rmSync(output, { recursive: true, force: true }));
for (const source of [
  "domain/contestConfiguration",
  "domain/managedContest",
  "domain/unfreezeSimulation",
  "domain/standings",
  "services/codeforcesApi",
  "services/codeforcesContestGateway"
]) {
  const destination = join(output, `${source}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, ts.transpileModule(
    readFileSync(new URL(`../src/${source}.ts`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
  ).outputText);
}
const require = createRequire(import.meta.url);
const { createDefaultContestConfiguration, cloneContestConfiguration } =
  require(join(output, "domain/contestConfiguration.js"));
const { createManagedContest } = require(join(output, "domain/managedContest.js"));
const { buildCodeforcesContestSnapshot, isCodeforcesSubmissionEligible } =
  require(join(output, "services/codeforcesContestGateway.js"));
const { buildUnfreezeRevealEvents, applyUnfreezeProgress } = require(join(output, "domain/unfreezeSimulation.js"));

const selectableTypes = ["CONTESTANT", "OUT_OF_COMPETITION", "VIRTUAL"];
const allTypes = [...selectableTypes, "PRACTICE", "MANAGER"];
const durationSeconds = 600;
function configuration(selected) {
  return {
    ...createDefaultContestConfiguration(),
    durationMinutes: durationSeconds / 60,
    freezeDurationMinutes: 5,
    includedParticipantTypes: selected
  };
}
function submission(type, time = 400, overrides = {}) {
  return {
    id: allTypes.indexOf(type) + 1,
    relativeTimeSeconds: time,
    author: { contestId: 123, participantType: type, members: [{ handle: type }] },
    problem: { index: "A" },
    verdict: "OK",
    ...overrides
  };
}
function names(snapshot) {
  return snapshot.teams.map((team) => team.name).sort();
}

for (let mask = 0; mask < 8; mask++) {
  const selected = selectableTypes.filter((_, index) => mask & (1 << index));
  test(`participant selection ${JSON.stringify(selected)} filters live and revelator`, () => {
    const settings = configuration(selected);
    const submissions = allTypes.map((type) => submission(type));
    const eligibleIds = new Set(submissions
      .filter((entry) => isCodeforcesSubmissionEligible(entry, durationSeconds, selected))
      .map((entry) => entry.id));
    const live = buildCodeforcesContestSnapshot(settings, 123, submissions, {
      elapsedSeconds: durationSeconds,
      revealedSubmissionIds: eligibleIds,
      pendingSubmissionIds: new Set(),
      freezeHiddenSubmissions: false
    });
    const frozen = buildCodeforcesContestSnapshot(settings, 123, submissions, {
      freezeHiddenSubmissions: true
    });
    assert.deepEqual(names(live), [...selected].sort());
    assert.deepEqual(names(frozen), [...selected].sort());
    assert.deepEqual(live.recentSubmissions.map((entry) => entry.id).sort(),
      [...eligibleIds].map((id) => `cf-submission-${id}`).sort());
    assert.deepEqual(frozen.recentSubmissions.map((entry) => entry.id).sort(),
      [...eligibleIds].map((id) => `cf-submission-${id}`).sort());
    const events = buildUnfreezeRevealEvents(frozen)
      .filter((event) => event.kind === "submission");
    assert.deepEqual(events.map((event) => event.teamName).sort(), [...selected].sort());
    assert.ok(live.teams.every((team) => team.solved === 1));
    assert.ok(frozen.teams.every((team) => team.solved === 0));
  });
}

test("excluded results cannot affect included participants' ranks or first-to-solve", () => {
  const snapshot = buildCodeforcesContestSnapshot(configuration(["VIRTUAL"]), 123, [
    submission("CONTESTANT", 1),
    submission("OUT_OF_COMPETITION", 2),
    submission("VIRTUAL", 100)
  ]);
  assert.equal(snapshot.teams.length, 1);
  assert.equal(snapshot.teams[0].rank, 1);
  assert.equal(snapshot.teams[0].problems[0].firstToSolve, true);
});

test("live eligibility keeps time boundaries for every selectable type", () => {
  for (const type of selectableTypes) {
    for (const [time, expected] of [[undefined, false], [-1, false], [0, true],
      [100, true], [101, false]]) {
      const entry = submission(type, 0, { relativeTimeSeconds: time });
      assert.equal(isCodeforcesSubmissionEligible(entry, 100, [type]), expected);
      assert.equal(isCodeforcesSubmissionEligible(entry, 100, []), false);
    }
  }
});

test("snapshot caps live submissions at configured duration", () => {
  const snapshot = buildCodeforcesContestSnapshot(configuration(selectableTypes), 123, [
    submission("CONTESTANT", durationSeconds - 1),
    submission("VIRTUAL", durationSeconds + 1)
  ], { elapsedSeconds: durationSeconds + 100 });
  assert.deepEqual(names(snapshot), ["CONTESTANT"]);
});

test("filtering removes excluded attempts even when the same handle has multiple types", () => {
  const author = { contestId: 123, members: [{ handle: "same-user" }] };
  const snapshot = buildCodeforcesContestSnapshot(configuration(["OUT_OF_COMPETITION"]), 123, [
    submission("CONTESTANT", 10, { author: { ...author, participantType: "CONTESTANT" } }),
    submission("OUT_OF_COMPETITION", 100, {
      author: { ...author, participantType: "OUT_OF_COMPETITION" }, verdict: "WRONG_ANSWER"
    })
  ]);
  assert.equal(snapshot.teams.length, 1);
  assert.equal(snapshot.teams[0].solved, 0);
});

test("saved selections survive editing and reopening without sharing mutable arrays", () => {
  for (const selected of [[], ["OUT_OF_COMPETITION"], selectableTypes]) {
    const draft = configuration([...selected]);
    const saved = createManagedContest("123", draft);
    const reopened = cloneContestConfiguration(saved.configuration);
    assert.deepEqual(reopened.includedParticipantTypes, selected);
    draft.includedParticipantTypes.push("VIRTUAL");
    reopened.includedParticipantTypes.push("CONTESTANT");
    assert.deepEqual(saved.configuration.includedParticipantTypes, selected);
  }
});

test("defaults retain previous behavior and older configurations can be cloned", () => {
  const first = createDefaultContestConfiguration();
  const second = createDefaultContestConfiguration();
  assert.deepEqual(first.includedParticipantTypes, ["CONTESTANT", "VIRTUAL"]);
  first.includedParticipantTypes.length = 0;
  assert.deepEqual(second.includedParticipantTypes, ["CONTESTANT", "VIRTUAL"]);
  delete second.includedParticipantTypes;
  assert.deepEqual(cloneContestConfiguration(second).includedParticipantTypes,
    ["CONTESTANT", "VIRTUAL"]);
});

// Scoring regressions exercise the actual live snapshot and frozen replay paths.
function teamSubmission(name, id, time, problem = "A", verdict = "OK") {
  return submission("CONTESTANT", time, {
    id,
    author: {
      contestId: 123,
      participantType: "CONTESTANT",
      members: [{ handle: name }]
    },
    problem: { index: problem },
    verdict
  });
}

function scoreSummary(snapshot) {
  return snapshot.teams.map((team) => ({
    name: team.name,
    rank: team.rank,
    solved: team.solved,
    penalty: team.penalty,
    solves: team.problems.filter((cell) => cell.kind === "solved").map((cell) => ({
      problem: cell.problemId,
      seconds: cell.solveTimeSeconds,
      submissionId: cell.solveSubmissionId,
      firstToSolve: cell.firstToSolve
    }))
  }));
}

function liveAndReplay(settings, submissions) {
  const live = buildCodeforcesContestSnapshot(settings, 123, submissions, {
    freezeHiddenSubmissions: false
  });
  const frozen = buildCodeforcesContestSnapshot(settings, 123, submissions, {
    freezeHiddenSubmissions: true
  });
  const events = buildUnfreezeRevealEvents(frozen);
  const replay = applyUnfreezeProgress(frozen, events, events.length).snapshot;
  assert.deepEqual(scoreSummary(replay), scoreSummary(live));
  return { live, frozen, events, replay };
}

test("both scoreboards exclude contest end and later submissions, including pending ones", () => {
  const settings = { ...configuration(["CONTESTANT"]), durationMinutes: 300, freezeDurationMinutes: 60 };
  const entries = [
    teamSubmission("LastValid", 1, 17999),
    teamSubmission("AtEnd", 2, 18000),
    teamSubmission("AfterEnd", 3, 18001),
    teamSubmission("PendingAtEnd", 4, 18000, "A", "TESTING"),
    teamSubmission("LastValid", 5, 18000, "B")
  ];
  for (const entry of entries) {
    assert.equal(isCodeforcesSubmissionEligible(entry, 18100, ["CONTESTANT"], 18000),
      entry.relativeTimeSeconds < 18000);
  }
  const { live, frozen, events } = liveAndReplay(settings, entries);
  assert.deepEqual(names(live), ["LastValid"]);
  assert.deepEqual(names(frozen), ["LastValid"]);
  assert.equal(live.teams[0].solved, 1);
  assert.equal(live.teams[0].penalty, 299);
  assert.equal(events.filter((event) => event.kind === "submission").length, 1);
  assert.deepEqual(live.recentSubmissions.map((entry) => entry.id), ["cf-submission-1"]);
});

test("elapsed-time boundary remains inclusive before the exclusive contest end", () => {
  const snapshot = buildCodeforcesContestSnapshot(configuration(["CONTESTANT"]), 123, [
    teamSubmission("Now", 1, 100), teamSubmission("Future", 2, 101)
  ], { elapsedSeconds: 100 });
  assert.deepEqual(names(snapshot), ["Now"]);
});

test("both scoreboards rank by solves, penalty, then last acceptance seconds and retain true ties", () => {
  const entries = [
    teamSubmission("MostSolves", 1, 300),
    teamSubmission("MostSolves", 2, 310, "B"),
    teamSubmission("LowPenalty", 3, 320),
    teamSubmission("ZuluEarly", 4, 20, "A", "WRONG_ANSWER"),
    teamSubmission("ZuluEarly", 5, 330),
    teamSubmission("AlphaLate", 6, 30, "A", "WRONG_ANSWER"),
    teamSubmission("AlphaLate", 7, 350),
    teamSubmission("TieLate", 8, 40, "A", "WRONG_ANSWER"),
    teamSubmission("TieLate", 9, 350)
  ];
  const { live } = liveAndReplay(configuration(["CONTESTANT"]), entries);
  assert.deepEqual(live.teams.map((team) => [team.name, team.rank]), [
    ["MostSolves", 1], ["LowPenalty", 2], ["ZuluEarly", 3], ["AlphaLate", 4], ["TieLate", 4]
  ]);
});

test("last acceptance tie-break uses the latest solve across all problems", () => {
  const { live } = liveAndReplay(configuration(["CONTESTANT"]), [
    teamSubmission("AlphaLater", 1, 320), teamSubmission("AlphaLater", 2, 370, "B"),
    teamSubmission("ZuluEarlier", 3, 360), teamSubmission("ZuluEarlier", 4, 330, "B")
  ]);
  assert.deepEqual(live.teams.map((team) => [team.name, team.rank, team.penalty]), [
    ["ZuluEarlier", 1, 11], ["AlphaLater", 2, 11]
  ]);
});

for (const [label, earlierTime, earlierId, laterTime, laterId] of [
  ["seconds before submission ID", 310, 100, 350, 1],
  ["submission ID when seconds tie", 350, 1, 350, 100]
]) {
  test(`first-to-solve uses ${label} during every reveal`, () => {
    const { live, frozen, events } = liveAndReplay(configuration(["CONTESTANT"]), [
      teamSubmission("AlphaEarlier", 200, 20, "A", "WRONG_ANSWER"),
      teamSubmission("AlphaEarlier", earlierId, earlierTime),
      teamSubmission("ZuluLater", laterId, laterTime)
    ]);
    assert.equal(live.teams.find((team) => team.name === "AlphaEarlier").problems[0].firstToSolve, true);
    let firstSolveRevealed = false;
    for (let count = 1; count <= events.length; count++) {
      const progress = applyUnfreezeProgress(frozen, events, count).snapshot;
      const solvedTeams = progress.teams.filter((team) => team.solved > 0);
      if (solvedTeams.length === 1) {
        firstSolveRevealed = true;
        assert.equal(solvedTeams[0].name, "ZuluLater");
        assert.equal(solvedTeams[0].problems[0].firstToSolve, true);
      } else if (solvedTeams.length === 2) {
        assert.equal(solvedTeams.find((team) => team.name === "AlphaEarlier").problems[0].firstToSolve, true);
        assert.equal(solvedTeams.find((team) => team.name === "ZuluLater").problems[0].firstToSolve, false);
      }
    }
    assert.equal(firstSolveRevealed, true);
  });
}

test("pre-freeze and revealed solves retain the same ranking and first-to-solve precision", () => {
  const { live, frozen } = liveAndReplay(configuration(["CONTESTANT"]), [
    teamSubmission("AlphaLater", 1, 150), teamSubmission("AlphaLater", 2, 350, "B"),
    teamSubmission("ZuluEarlier", 3, 130), teamSubmission("ZuluEarlier", 4, 310, "B")
  ]);
  assert.deepEqual(frozen.teams.map((team) => [team.name, team.rank]), [
    ["ZuluEarlier", 1], ["AlphaLater", 2]
  ]);
  assert.deepEqual(live.teams.map((team) => [team.name, team.rank]), [
    ["ZuluEarlier", 1], ["AlphaLater", 2]
  ]);
});
