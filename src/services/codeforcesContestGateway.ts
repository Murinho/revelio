import {
  ContestConfiguration,
  formatDurationClock,
  formatFreezeWindowLabel
} from "../domain/contestConfiguration";
import {
  ContestSnapshot,
  PendingRevealOutcome,
  ProblemCellState,
  ProblemMeta,
  RecentSubmission,
  TeamStanding
} from "../domain/types";
import { requestCodeforcesApi } from "./codeforcesApi";
import type { ContestGateway } from "./contestGateway";

interface CodeforcesContest {
  id: number;
  name: string;
  durationSeconds?: number;
}

interface CodeforcesMember {
  handle: string;
}

type CodeforcesParticipantType =
  | "CONTESTANT"
  | "PRACTICE"
  | "VIRTUAL"
  | "MANAGER"
  | "OUT_OF_COMPETITION";

interface CodeforcesParty {
  contestId?: number;
  participantId?: number;
  participantType: CodeforcesParticipantType;
  members: CodeforcesMember[];
  teamId?: number;
  teamName?: string;
  ghost: boolean;
}

interface CodeforcesProblem {
  contestId?: number;
  index: string;
  name: string;
}

interface CodeforcesProblemResult {
  points: number;
  rejectedAttemptCount: number;
  bestSubmissionTimeSeconds?: number;
}

interface CodeforcesRanklistRow {
  party: CodeforcesParty;
  rank: number;
  points: number;
  penalty: number;
  problemResults: CodeforcesProblemResult[];
}

interface CodeforcesStandingsResult {
  contest: CodeforcesContest;
  problems: CodeforcesProblem[];
  rows: CodeforcesRanklistRow[];
}

interface CodeforcesSubmission {
  id: number;
  relativeTimeSeconds?: number;
  problem: CodeforcesProblem;
  author: CodeforcesParty;
  verdict?: string;
}

interface CodeforcesContestData {
  contest: CodeforcesContest;
  problems: CodeforcesProblem[];
  rows: CodeforcesRanklistRow[];
  submissions: CodeforcesSubmission[];
}

interface RelevantSubmissionAttempt {
  id: number;
  relativeTimeSeconds: number;
  verdict: string;
  isAccepted: boolean;
  isRejected: boolean;
}

const CODEFORCES_PAGE_SIZE = 5000;
const FALLBACK_BALLOON_COLORS = [
  "#f5f7fb",
  "#ff9326",
  "#ff5d4d",
  "#ffde3c",
  "#a8ff35",
  "#34db64",
  "#2452ff",
  "#34d6ff",
  "#f845ff",
  "#a51bda",
  "#5aff4b",
  "#ffd35c"
];
const NON_PENALIZED_VERDICTS = new Set([
  "COMPILATION_ERROR",
  "SKIPPED",
  "SUBMITTED",
  "TESTING"
]);

const contestDataCache = new Map<number, Promise<CodeforcesContestData>>();

export function createCodeforcesContestGateway(): ContestGateway {
  return {
    async getContestSnapshot(configuration: ContestConfiguration): Promise<ContestSnapshot> {
      const contestId = extractCodeforcesContestId(configuration.contestUrl);

      if (contestId === null) {
        throw new Error("Enter a valid Codeforces contest or gym URL.");
      }

      const contestData = await loadCodeforcesContestData(contestId);
      return buildContestSnapshot(configuration, contestData);
    }
  };
}

export function extractCodeforcesContestId(contestUrl: string): number | null {
  const trimmedContestUrl = contestUrl.trim();

  if (!trimmedContestUrl) {
    return null;
  }

  const directContestId = parsePositiveInteger(trimmedContestUrl);

  if (directContestId !== null) {
    return directContestId;
  }

  const parsedUrl = parseContestUrl(trimmedContestUrl);

  if (!parsedUrl) {
    return null;
  }

  const contestIdFromQuery =
    parsePositiveInteger(
      parsedUrl.searchParams.get("contestId") ??
        parsedUrl.searchParams.get("contest_id") ??
        ""
    );

  if (contestIdFromQuery !== null) {
    return contestIdFromQuery;
  }

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);

  for (let index = 0; index < pathSegments.length; index += 1) {
    const segment = pathSegments[index]?.toLowerCase();

    if (segment !== "contest" && segment !== "gym") {
      continue;
    }

    const contestId = parsePositiveInteger(pathSegments[index + 1] ?? "");

    if (contestId !== null) {
      return contestId;
    }
  }

  return null;
}

async function loadCodeforcesContestData(contestId: number): Promise<CodeforcesContestData> {
  const cachedContest = contestDataCache.get(contestId);

  if (cachedContest) {
    return cachedContest;
  }

  const contestPromise = fetchCodeforcesContestData(contestId).catch((error) => {
    contestDataCache.delete(contestId);
    throw error;
  });

  contestDataCache.set(contestId, contestPromise);
  return contestPromise;
}

async function fetchCodeforcesContestData(contestId: number): Promise<CodeforcesContestData> {
  const standingsResult = await loadStandingsResult(contestId);
  const selectedRows = selectRelevantRows(standingsResult.rows);

  if (selectedRows.rows.length === 0) {
    throw new Error(
      "Codeforces returned no visible participants for this contest. Private contests will need a server-side signed gateway."
    );
  }

  const participantKeys = new Set(
    selectedRows.rows
      .map((row) => getPartyKey(row.party))
      .filter((key): key is string => key !== null)
  );

  const submissions = (await loadContestSubmissions(contestId)).filter((submission) => {
    const participantKey = getPartyKey(submission.author);

    return participantKey !== null && participantKeys.has(participantKey);
  });

  return {
    contest: standingsResult.contest,
    problems: standingsResult.problems,
    rows: selectedRows.rows,
    submissions
  };
}

async function loadStandingsResult(contestId: number): Promise<CodeforcesStandingsResult> {
  let from = 1;
  let contest: CodeforcesContest | null = null;
  let problems: CodeforcesProblem[] = [];
  const rows: CodeforcesRanklistRow[] = [];

  while (true) {
    const result = await requestCodeforcesApi<CodeforcesStandingsResult>(
      "contest.standings",
      {
        contestId,
        from,
        count: CODEFORCES_PAGE_SIZE,
        showUnofficial: true,
        lang: "en"
      }
    );

    contest = contest ?? result.contest;
    if (problems.length === 0) {
      problems = result.problems;
    }

    rows.push(...result.rows);

    if (result.rows.length < CODEFORCES_PAGE_SIZE) {
      return {
        contest: contest ?? result.contest,
        problems,
        rows
      };
    }

    from += CODEFORCES_PAGE_SIZE;
  }
}

async function loadContestSubmissions(contestId: number): Promise<CodeforcesSubmission[]> {
  let from = 1;
  const submissions: CodeforcesSubmission[] = [];

  while (true) {
    const result = await requestCodeforcesApi<CodeforcesSubmission[]>("contest.status", {
      contestId,
      from,
      count: CODEFORCES_PAGE_SIZE,
      lang: "en"
    });

    submissions.push(...result);

    if (result.length < CODEFORCES_PAGE_SIZE) {
      return submissions;
    }

    from += CODEFORCES_PAGE_SIZE;
  }
}

function buildContestSnapshot(
  configuration: ContestConfiguration,
  contestData: CodeforcesContestData
): ContestSnapshot {
  const durationSeconds =
    contestData.contest.durationSeconds ?? configuration.durationMinutes * 60;
  const freezeDurationSeconds = Math.min(
    durationSeconds,
    Math.max(0, configuration.freezeDurationMinutes * 60)
  );
  const freezeStartSeconds = Math.max(0, durationSeconds - freezeDurationSeconds);
  const problems = buildProblems(configuration, contestData.problems);
  const problemsByIndex = new Set(problems.map((problem) => problem.id));
  const submissionAttemptsByProblemKey = indexRelevantAttempts(
    contestData.submissions,
    durationSeconds,
    problemsByIndex
  );
  const teams = rankTeams(
    applyFirstToSolveFlags(
      contestData.rows.map((row) =>
        buildTeamStanding(row, problems, submissionAttemptsByProblemKey, freezeStartSeconds)
      )
    )
  );

  return {
    contestName: "Revelio",
    regionName: contestData.contest.name,
    phase: "frozen",
    durationLabel: formatDurationClock(Math.floor(durationSeconds / 60)),
    freezeLabel: formatFreezeWindowLabel(Math.floor(freezeDurationSeconds / 60)),
    problems,
    teams,
    recentSubmissions: buildRecentSubmissions(teams),
    updatedAtLabel:
      "Loaded from Codeforces contest.standings and contest.status, including unofficial participants"
  };
}

function buildProblems(
  configuration: ContestConfiguration,
  contestProblems: CodeforcesProblem[]
): ProblemMeta[] {
  const configuredColorsByLabel = new Map(
    configuration.problems.map((problem) => [problem.label, problem.balloonColor])
  );

  return contestProblems.map((problem, index) => ({
    id: problem.index,
    label: problem.index,
    color:
      configuredColorsByLabel.get(problem.index) ??
      FALLBACK_BALLOON_COLORS[index % FALLBACK_BALLOON_COLORS.length]
  }));
}

function buildTeamStanding(
  row: CodeforcesRanklistRow,
  problems: ProblemMeta[],
  attemptsByProblemKey: Map<string, RelevantSubmissionAttempt[]>,
  freezeStartSeconds: number
): TeamStanding {
  const partyKey = getPartyKey(row.party) ?? buildFallbackPartyKey(row);
  const members = row.party.members
    .map((member) => member.handle.trim())
    .filter((handle) => handle.length > 0);
  const name = row.party.teamName?.trim() || members.join(" / ") || "Unnamed team";
  const problemCells = problems.map((problem, problemIndex) => {
    const problemResult = row.problemResults[problemIndex];
    const attempts =
      attemptsByProblemKey.get(`${partyKey}:${problem.id}`) ?? [];

    return buildProblemCell(problem, problemResult, attempts, freezeStartSeconds);
  });

  return {
    id: partyKey,
    rank: row.rank,
    name,
    organization: undefined,
    members,
    solved: countSolvedProblems(problemCells),
    penalty: calculateTeamPenalty(problemCells),
    marked: false,
    pendingProblemLabels: collectPendingProblemLabels(problemCells),
    problems: problemCells
  };
}

function buildProblemCell(
  problem: ProblemMeta,
  problemResult: CodeforcesProblemResult | undefined,
  attempts: RelevantSubmissionAttempt[],
  freezeStartSeconds: number
): ProblemCellState {
  const finalWrongAttempts = Math.max(0, problemResult?.rejectedAttemptCount ?? 0);
  const finalSolved = (problemResult?.points ?? 0) > 0;
  const solveTimeSeconds =
    problemResult?.bestSubmissionTimeSeconds ??
    attempts.find((attempt) => attempt.isAccepted)?.relativeTimeSeconds;
  const preFreezeWrongAttempts = attempts.filter(
    (attempt) => attempt.isRejected && attempt.relativeTimeSeconds <= freezeStartSeconds
  ).length;
  const hiddenWrongAttempts = Math.max(0, finalWrongAttempts - preFreezeWrongAttempts);
  const solvedBeforeFreeze =
    finalSolved &&
    solveTimeSeconds !== undefined &&
    solveTimeSeconds <= freezeStartSeconds;
  const solvedAfterFreeze =
    finalSolved &&
    solveTimeSeconds !== undefined &&
    solveTimeSeconds > freezeStartSeconds;

  if (solvedBeforeFreeze && solveTimeSeconds !== undefined) {
    return {
      kind: "solved",
      problemId: problem.id,
      problemLabel: problem.label,
      wrongAttempts: finalWrongAttempts,
      penalty: computeIcpcPenalty(solveTimeSeconds, finalWrongAttempts),
      firstToSolve: false
    };
  }

  if (hiddenWrongAttempts > 0 || solvedAfterFreeze) {
    const frozenSubmissionCount = hiddenWrongAttempts + (solvedAfterFreeze ? 1 : 0);
    const revealOutcome: PendingRevealOutcome = {
      result: solvedAfterFreeze ? "solved" : "failed",
      hiddenWrongAttempts,
      finalWrongAttempts,
      contestMinute:
        solvedAfterFreeze && solveTimeSeconds !== undefined
          ? toContestMinute(solveTimeSeconds)
          : null,
      penalty:
        solvedAfterFreeze && solveTimeSeconds !== undefined
          ? computeIcpcPenalty(solveTimeSeconds, finalWrongAttempts)
          : null,
      lastHiddenContestMinute: getLastHiddenContestMinute(
        attempts,
        freezeStartSeconds,
        solveTimeSeconds
      )
    };

    return {
      kind: "queued",
      problemId: problem.id,
      problemLabel: problem.label,
      wrongAttempts: preFreezeWrongAttempts,
      frozenSubmissionCount,
      revealOutcome
    };
  }

  if (finalWrongAttempts > 0) {
    return {
      kind: "failed",
      problemId: problem.id,
      problemLabel: problem.label,
      wrongAttempts: finalWrongAttempts
    };
  }

  return {
    kind: "untouched",
    problemId: problem.id,
    problemLabel: problem.label
  };
}

function buildRecentSubmissions(teams: TeamStanding[]): RecentSubmission[] {
  const recentEntries = teams.flatMap((team) =>
    team.problems.flatMap((cell) => {
      if (cell.kind !== "queued" && cell.kind !== "frozen-pending") {
        return [];
      }

      const contestMinute = cell.revealOutcome?.lastHiddenContestMinute ?? 0;

      return [
        {
          id: `${team.id}-${cell.problemId}`,
          contestMinute,
          teamName: team.name,
          problemLabel: cell.problemLabel,
          summary: formatPendingSummary(cell.wrongAttempts, cell.frozenSubmissionCount),
          kind: cell.kind
        }
      ];
    })
  );

  return recentEntries
    .sort(
      (leftEntry, rightEntry) =>
        rightEntry.contestMinute - leftEntry.contestMinute ||
        leftEntry.problemLabel.localeCompare(rightEntry.problemLabel) ||
        leftEntry.teamName.localeCompare(rightEntry.teamName)
    )
    .slice(0, 20);
}

function indexRelevantAttempts(
  submissions: CodeforcesSubmission[],
  durationSeconds: number,
  problemsByIndex: Set<string>
): Map<string, RelevantSubmissionAttempt[]> {
  const attemptsByProblemKey = new Map<string, RelevantSubmissionAttempt[]>();

  submissions.forEach((submission) => {
    const partyKey = getPartyKey(submission.author);
    const problemIndex = submission.problem.index;
    const relativeTimeSeconds = submission.relativeTimeSeconds;
    const verdict = submission.verdict ?? "";

    if (
      partyKey === null ||
      !problemsByIndex.has(problemIndex) ||
      relativeTimeSeconds === undefined ||
      relativeTimeSeconds < 0 ||
      relativeTimeSeconds > durationSeconds
    ) {
      return;
    }

    const isAccepted = verdict === "OK";
    const isRejected = isRejectedAttemptVerdict(verdict);

    if (!isAccepted && !isRejected) {
      return;
    }

    const problemKey = `${partyKey}:${problemIndex}`;
    const currentAttempts = attemptsByProblemKey.get(problemKey) ?? [];

    currentAttempts.push({
      id: submission.id,
      relativeTimeSeconds,
      verdict,
      isAccepted,
      isRejected
    });

    attemptsByProblemKey.set(problemKey, currentAttempts);
  });

  attemptsByProblemKey.forEach((attempts, problemKey) => {
    const orderedAttempts = [...attempts].sort(
      (leftAttempt, rightAttempt) =>
        leftAttempt.relativeTimeSeconds - rightAttempt.relativeTimeSeconds ||
        leftAttempt.id - rightAttempt.id
    );
    const relevantAttempts: RelevantSubmissionAttempt[] = [];

    for (const attempt of orderedAttempts) {
      relevantAttempts.push(attempt);

      if (attempt.isAccepted) {
        break;
      }
    }

    attemptsByProblemKey.set(problemKey, relevantAttempts);
  });

  return attemptsByProblemKey;
}

function selectRelevantRows(rows: CodeforcesRanklistRow[]): {
  rows: CodeforcesRanklistRow[];
} {
  return {
    rows: rows.filter((row) => row.party.participantType !== "MANAGER")
  };
}

function getPartyKey(party: CodeforcesParty): string | null {
  if (party.contestId !== undefined && party.participantId !== undefined) {
    return `contest-${party.contestId}-participant-${party.participantId}`;
  }

  if (party.contestId !== undefined && party.teamId !== undefined) {
    return `contest-${party.contestId}-team-${party.teamId}`;
  }

  if (party.contestId !== undefined && party.teamName?.trim()) {
    return `contest-${party.contestId}-team-name-${sanitizeKeySegment(party.teamName)}`;
  }

  if (party.members.length > 0) {
    return `members-${party.members
      .map((member) => sanitizeKeySegment(member.handle))
      .join("-")}`;
  }

  return null;
}

function buildFallbackPartyKey(row: CodeforcesRanklistRow): string {
  return `rank-${row.rank}-${row.penalty}-${row.points}`;
}

function applyFirstToSolveFlags(teams: TeamStanding[]): TeamStanding[] {
  const nextTeams = teams.map((team) => ({
    ...team,
    problems: [...team.problems]
  }));

  if (nextTeams.length === 0) {
    return nextTeams;
  }

  for (let problemIndex = 0; problemIndex < nextTeams[0].problems.length; problemIndex += 1) {
    const solvedEntries = nextTeams
      .map((team, teamIndex) => {
        const cell = team.problems[problemIndex];

        return cell.kind === "solved"
          ? {
              teamIndex,
              penalty: cell.penalty,
              wrongAttempts: cell.wrongAttempts
            }
          : null;
      })
      .filter(
        (
          entry
        ): entry is { teamIndex: number; penalty: number; wrongAttempts: number } =>
          entry !== null
      )
      .sort(
        (leftEntry, rightEntry) =>
          leftEntry.penalty - rightEntry.penalty ||
          leftEntry.teamIndex - rightEntry.teamIndex
      );

    solvedEntries.forEach((entry, solvedIndex) => {
      const solvedCell = nextTeams[entry.teamIndex].problems[problemIndex];

      if (solvedCell.kind !== "solved") {
        return;
      }

      nextTeams[entry.teamIndex].problems[problemIndex] = {
        ...solvedCell,
        firstToSolve: solvedIndex === 0
      };
    });
  }

  return nextTeams.map((team) => ({
    ...team,
    solved: countSolvedProblems(team.problems),
    penalty: calculateTeamPenalty(team.problems),
    pendingProblemLabels: collectPendingProblemLabels(team.problems)
  }));
}

function rankTeams(teams: TeamStanding[]): TeamStanding[] {
  const sortedTeams = [...teams].sort(
    (leftTeam, rightTeam) =>
      rightTeam.solved - leftTeam.solved ||
      leftTeam.penalty - rightTeam.penalty ||
      leftTeam.name.localeCompare(rightTeam.name)
  );
  let currentRank = 0;
  let previousSolved = Number.NaN;
  let previousPenalty = Number.NaN;

  return sortedTeams.map((team, index) => {
    if (team.solved !== previousSolved || team.penalty !== previousPenalty) {
      currentRank = index + 1;
      previousSolved = team.solved;
      previousPenalty = team.penalty;
    }

    return {
      ...team,
      rank: currentRank
    };
  });
}

function countSolvedProblems(problemCells: ProblemCellState[]): number {
  return problemCells.filter((cell) => cell.kind === "solved").length;
}

function calculateTeamPenalty(problemCells: ProblemCellState[]): number {
  return problemCells.reduce(
    (totalPenalty, cell) =>
      totalPenalty + (cell.kind === "solved" ? cell.penalty : 0),
    0
  );
}

function collectPendingProblemLabels(problemCells: ProblemCellState[]): string[] {
  return problemCells
    .filter(
      (
        cell
      ): cell is Extract<ProblemCellState, { kind: "queued" | "frozen-pending" }> =>
        cell.kind === "queued" || cell.kind === "frozen-pending"
    )
    .map((cell) => cell.problemLabel);
}

function formatPendingSummary(
  wrongAttempts: number,
  frozenSubmissionCount: number
): string {
  const mainLabel = frozenSubmissionCount > 1 ? `(${frozenSubmissionCount})` : "?";

  return `${mainLabel} +${wrongAttempts}`;
}

function computeIcpcPenalty(relativeTimeSeconds: number, wrongAttempts: number): number {
  return toContestMinute(relativeTimeSeconds) + wrongAttempts * 20;
}

function getLastHiddenContestMinute(
  attempts: RelevantSubmissionAttempt[],
  freezeStartSeconds: number,
  solveTimeSeconds?: number
): number | null {
  const hiddenAttempts = attempts.filter(
    (attempt) => attempt.relativeTimeSeconds > freezeStartSeconds
  );

  if (hiddenAttempts.length > 0) {
    return toContestMinute(hiddenAttempts[hiddenAttempts.length - 1].relativeTimeSeconds);
  }

  if (solveTimeSeconds !== undefined && solveTimeSeconds > freezeStartSeconds) {
    return toContestMinute(solveTimeSeconds);
  }

  if (freezeStartSeconds > 0) {
    return toContestMinute(freezeStartSeconds);
  }

  return null;
}

function toContestMinute(relativeTimeSeconds: number): number {
  return Math.max(0, Math.floor(relativeTimeSeconds / 60));
}

function isRejectedAttemptVerdict(verdict: string): boolean {
  return verdict.length > 0 && verdict !== "OK" && !NON_PENALIZED_VERDICTS.has(verdict);
}

function sanitizeKeySegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function parseContestUrl(contestUrl: string): URL | null {
  try {
    return new URL(contestUrl);
  } catch {
    try {
      return new URL(contestUrl, "https://codeforces.com");
    } catch {
      return null;
    }
  }
}

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}
