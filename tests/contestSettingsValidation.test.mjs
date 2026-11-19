import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const output = mkdtempSync(join(tmpdir(), "revelio-settings-"));
after(() => rmSync(output, { recursive: true, force: true }));
for (const source of ["contestConfiguration", "contestSettingsValidation"]) {
  writeFileSync(join(output, `${source}.js`), ts.transpileModule(
    readFileSync(new URL(`../src/domain/${source}.ts`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
  ).outputText);
}
const require = createRequire(import.meta.url);
const { createDefaultContestConfiguration } = require(join(output, "contestConfiguration.js"));
const { validateContestSettings } = require(join(output, "contestSettingsValidation.js"));
const validConfiguration = () => ({
  ...createDefaultContestConfiguration(),
  contestName: "Invitational",
  contestUrl: "https://codeforces.com/gym/106416"
});

test("new contests require an entered name and URL and retain timing defaults", () => {
  const now = new Date("2026-11-18T12:34:00Z");
  const configuration = createDefaultContestConfiguration(now);
  assert.equal(configuration.contestName, "");
  assert.equal(configuration.contestUrl, "");
  assert.equal(configuration.durationMinutes, 300);
  assert.equal(configuration.freezeDurationMinutes, 60);
  assert.equal(configuration.startAtUtc, "2026-11-18T12:34");
  assert.deepEqual(Object.keys(validateContestSettings(configuration, "300", "60")),
    ["contestName", "contestUrl"]);
});

test("blank and whitespace-only contest names are rejected", () => {
  for (const contestName of ["", " ", "\t\n"]) {
    assert.ok(validateContestSettings({ ...validConfiguration(), contestName }, "300", "60").contestName);
  }
});

test("contest URL must be an absolute HTTP or HTTPS URL", () => {
  for (const contestUrl of ["", " ", "codeforces.com", "/gym/123", "https://", "https:example.com", "https://bad host", "javascript:alert(1)"]) {
    assert.ok(validateContestSettings({ ...validConfiguration(), contestUrl }, "300", "60").contestUrl, contestUrl);
  }
  for (const contestUrl of ["https://codeforces.com/gym/123", "http://example.com/contest?id=1"]) {
    assert.deepEqual(validateContestSettings({ ...validConfiguration(), contestUrl }, "300", "60"), {});
  }
});

test("duration rejects empty, zero, negative, fractional, exponent, and unsafe values", () => {
  for (const duration of ["", " ", "0", "-1", "1.5", "1e3", "12minutes", "Infinity", "9007199254740992"]) {
    assert.ok(validateContestSettings(validConfiguration(), duration, "0").duration, duration);
  }
  for (const duration of ["1", "300", "00300"]) {
    assert.deepEqual(validateContestSettings(validConfiguration(), duration, "0"), {});
  }
});

test("freeze requires a non-negative integer and cannot exceed duration", () => {
  for (const freeze of ["", " ", "-1", "1.5", "1e1", "NaN", "301", "9007199254740992"]) {
    assert.ok(validateContestSettings(validConfiguration(), "300", freeze).freeze, freeze);
  }
  for (const freeze of ["0", "60", "300"]) {
    assert.deepEqual(validateContestSettings(validConfiguration(), "300", freeze), {});
  }
});

test("each selectable participant type alone is enough; no types blocks saving", () => {
  const configuration = validConfiguration();
  assert.ok(validateContestSettings({ ...configuration, includedParticipantTypes: [] }, "300", "60").participants);
  for (const type of ["CONTESTANT", "OUT_OF_COMPETITION", "VIRTUAL"]) {
    assert.deepEqual(validateContestSettings({ ...configuration, includedParticipantTypes: [type] }, "300", "60"), {});
  }
});

test("invalid start and overflowing end dates cannot be saved", () => {
  assert.ok(validateContestSettings({ ...validConfiguration(), startAtUtc: "" }, "300", "60").start);
  assert.ok(validateContestSettings(validConfiguration(), "9007199254740991", "60").duration);
});
