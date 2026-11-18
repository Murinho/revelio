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
const { buildUnfreezeRevealEvents } = require(join(output, "domain/unfreezeSimulation.js"));

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
    submission("CONTESTANT", durationSeconds),
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
