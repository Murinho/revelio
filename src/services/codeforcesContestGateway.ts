import {
  ContestCodeforcesCredentials,
  ContestConfiguration,
  formatDurationClock,
  formatFreezeWindowLabel
} from "../domain/contestConfiguration";
import {
  ContestSnapshot,
  HiddenSubmission,
  PendingRevealOutcome,
  ProblemCellState,
  ProblemMeta,
  RecentSubmission,
  SolvedProblemCell,
  TeamStanding
} from "../domain/types";
import { requestCodeforcesApi } from "./codeforcesApi";
import type { ContestGateway, ContestSnapshotRequest } from "./contestGateway";

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
  ghost?: boolean;
}

interface CodeforcesProblem {
  contestId?: number;
  index: string;
  name?: string;
}

export interface CodeforcesSubmission {
  id: number;
  relativeTimeSeconds?: number;
  creationTimeSeconds?: number;
  problem: CodeforcesProblem;
  author: CodeforcesParty;
  verdict?: string;
}

export type CodeforcesSubmissionVerdictStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "compilation-error";

interface BuildCodeforcesContestSnapshotOptions extends ContestSnapshotRequest {
  updatedAt?: Date;
}

interface RelevantSubmissionAttempt {
  id: number;
  relativeTimeSeconds: number;
  verdict: string;
  isAccepted: boolean;
  isRejected: boolean;
}

interface LivePendingSubmission {
  id: number;
  relativeTimeSeconds: number;
  pendingSubmissionCount: number;
}

interface SubmissionRevealState {
  pendingSubmissionIds?: ReadonlySet<number>;
  revealedSubmissionIds?: ReadonlySet<number>;
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
const LIVE_RECENT_SUBMISSION_LIMIT = 20;
const PENDING_VERDICTS = new Set(["", "SKIPPED", "SUBMITTED", "TESTING"]);
const INCLUDED_PARTICIPANT_TYPES: CodeforcesParticipantType[] = [
  "CONTESTANT",
  "VIRTUAL"
];
const INCLUDED_PARTICIPANT_TYPE_SET = new Set(INCLUDED_PARTICIPANT_TYPES);

export function createCodeforcesContestGateway(): ContestGateway {
  return {
    async getContestSnapshot(
      configuration: ContestConfiguration,
      request: ContestSnapshotRequest = {}
    ): Promise<ContestSnapshot> {
      const contestId = extractCodeforcesContestId(configuration.contestUrl);

      if (contestId === null) {
        throw new Error("Enter a valid Codeforces contest or gym URL.");
      }

      const submissions = await loadCodeforcesContestSubmissions(
        contestId,
        configuration.codeforces
      );

      return buildCodeforcesContestSnapshot(configuration, contestId, submissions, {
        ...request,
        freezeHiddenSubmissions: request.freezeHiddenSubmissions ?? true
      });
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

export async function loadCodeforcesContestSubmissions(
  contestId: number,
  credentials: ContestCodeforcesCredentials
): Promise<CodeforcesSubmission[]> {
  let from = 1;
  const submissions: CodeforcesSubmission[] = [];

  while (true) {
    const result = await requestCodeforcesApi<CodeforcesSubmission[]>(
      "contest.status",
      {
        contestId,
        from,
        count: CODEFORCES_PAGE_SIZE,
        lang: "en"
      },
      credentials
    );

    submissions.push(...result);

    if (result.length < CODEFORCES_PAGE_SIZE) {
      return submissions;
    }

    from += CODEFORCES_PAGE_SIZE;
  }
}

export function buildCodeforcesContestSnapshot(
  configuration: ContestConfiguration,
  contestId: number,
  submissions: CodeforcesSubmission[],
  options: BuildCodeforcesContestSnapshotOptions = {}
): ContestSnapshot {
  const durationSeconds = Math.max(
    1,
    Math.floor(configuration.durationMinutes * 60)
  );
  const freezeDurationSeconds = Math.min(
    durationSeconds,
    Math.max(0, Math.floor(configuration.freezeDurationMinutes * 60))
  );
  const freezeStartSeconds = Math.max(0, durationSeconds - freezeDurationSeconds);
  const elapsedLimitSeconds = clamp(
    Math.floor(options.elapsedSeconds ?? durationSeconds),
    0,
    durationSeconds
  );
  const problems = buildProblems(configuration, submissions);
  const problemsByIndex = new Set(problems.map((problem) => problem.id));
  const consideredSubmissions = submissions.filter((submission) =>
    isConsideredCodeforcesSubmission(
      submission,
      elapsedLimitSeconds,
      problemsByIndex
    )
  );
  const relevantConsideredSubmissions =
    selectSubmissionsUntilFirstAccepted(consideredSubmissions);
  const scoringSubmissions =
    options.revealedSubmissionIds === undefined
      ? relevantConsideredSubmissions
      : relevantConsideredSubmissions.filter((submission) =>
          options.revealedSubmissionIds?.has(submission.id)
        );
  const attemptsByProblemKey = indexRelevantAttempts(
    scoringSubmissions,
    problemsByIndex
  );
  const livePendingSubmissionsByProblemKey = indexLivePendingSubmissions(
    relevantConsideredSubmissions,
    problemsByIndex,
    {
      pendingSubmissionIds: options.pendingSubmissionIds,
      revealedSubmissionIds: options.revealedSubmissionIds
    }
  );
  const teams = rankTeams(
    applyFirstToSolveFlags(
      collectParticipantParties(consideredSubmissions).map((party) =>
        buildTeamStanding(
          party,
          problems,
          attemptsByProblemKey,
          livePendingSubmissionsByProblemKey,
          freezeStartSeconds,
          options.freezeHiddenSubmissions ?? false
        )
      )
    )
  );

  return {
    contestName: "Revelio",
    regionName:
      configuration.contestName.trim() || `Codeforces Contest ${contestId}`,
    phase: options.freezeHiddenSubmissions ? "frozen" : "revealing",
    durationLabel: formatDurationClock(Math.floor(durationSeconds / 60)),
    freezeLabel: formatFreezeWindowLabel(Math.floor(freezeDurationSeconds / 60)),
    problems,
    teams,
    recentSubmissions: buildRecentSubmissions(relevantConsideredSubmissions, teams, {
      pendingSubmissionIds: options.pendingSubmissionIds,
      revealedSubmissionIds: options.revealedSubmissionIds
    }),
    updatedAtLabel: formatStatusUpdateLabel(
      options.updatedAt ?? new Date(),
      elapsedLimitSeconds
    )
  };
}

export function isCodeforcesSubmissionEligible(
  submission: CodeforcesSubmission,
  elapsedSeconds: number
): boolean {
  const relativeTimeSeconds = submission.relativeTimeSeconds;

  return (
    isIncludedParticipantType(submission.author.participantType) &&
    relativeTimeSeconds !== undefined &&
    relativeTimeSeconds >= 0 &&
    relativeTimeSeconds <= Math.max(0, Math.floor(elapsedSeconds))
  );
}

export function getCodeforcesSubmissionVerdictStatus(
  verdict?: string
): CodeforcesSubmissionVerdictStatus {
  const normalizedVerdict = verdict ?? "";

  if (normalizedVerdict === "OK") {
    return "accepted";
  }

  if (normalizedVerdict === "COMPILATION_ERROR") {
    return "compilation-error";
  }

  if (PENDING_VERDICTS.has(normalizedVerdict)) {
    return "pending";
  }

  return "rejected";
}

function buildProblems(
  configuration: ContestConfiguration,
  submissions: CodeforcesSubmission[]
): ProblemMeta[] {
  const configuredColorsByLabel = new Map(
    configuration.problems.map((problem) => [problem.label, problem.balloonColor])
  );
  const problemByIndex = new Map<string, ProblemMeta>();

  configuration.problems.forEach((problem, index) => {
    problemByIndex.set(problem.label, {
      id: problem.label,
      label: problem.label,
      color:
        configuredColorsByLabel.get(problem.label) ??
        FALLBACK_BALLOON_COLORS[index % FALLBACK_BALLOON_COLORS.length]
    });
  });

  submissions.forEach((submission) => {
    const problemIndex = submission.problem.index;

    if (!problemIndex || problemByIndex.has(problemIndex)) {
      return;
    }

    problemByIndex.set(problemIndex, {
      id: problemIndex,
      label: problemIndex,
      color:
        configuredColorsByLabel.get(problemIndex) ??
        FALLBACK_BALLOON_COLORS[problemByIndex.size % FALLBACK_BALLOON_COLORS.length]
    });
  });

  return [...problemByIndex.values()].sort((leftProblem, rightProblem) =>
    compareProblemIndex(leftProblem.id, rightProblem.id)
  );
}

function isConsideredCodeforcesSubmission(
  submission: CodeforcesSubmission,
  elapsedLimitSeconds: number,
  problemsByIndex: Set<string>
): boolean {
  return (
    isCodeforcesSubmissionEligible(submission, elapsedLimitSeconds) &&
    problemsByIndex.has(submission.problem.index)
  );
}

function selectSubmissionsUntilFirstAccepted(
  submissions: CodeforcesSubmission[]
): CodeforcesSubmission[] {
  const solvedProblemKeys = new Set<string>();
  const relevantSubmissions: CodeforcesSubmission[] = [];

  [...submissions].sort(compareSubmissionsChronologically).forEach((submission) => {
    const partyKey = getPartyKey(submission.author);

    if (partyKey === null) {
      return;
    }

    const problemKey = `${partyKey}:${submission.problem.index}`;

    if (solvedProblemKeys.has(problemKey)) {
      return;
    }

    relevantSubmissions.push(submission);

    if (getCodeforcesSubmissionVerdictStatus(submission.verdict) === "accepted") {
      solvedProblemKeys.add(problemKey);
    }
  });

  return relevantSubmissions;
}

function collectParticipantParties(
  submissions: CodeforcesSubmission[]
): CodeforcesParty[] {
  const partiesByKey = new Map<string, CodeforcesParty>();

  [...submissions]
    .sort(compareSubmissionsChronologically)
    .forEach((submission) => {
      const partyKey = getPartyKey(submission.author);

      if (partyKey === null || partiesByKey.has(partyKey)) {
        return;
      }

      partiesByKey.set(partyKey, submission.author);
    });

  return [...partiesByKey.values()];
}

function buildTeamStanding(
  party: CodeforcesParty,
  problems: ProblemMeta[],
  attemptsByProblemKey: Map<string, RelevantSubmissionAttempt[]>,
  livePendingSubmissionsByProblemKey: Map<string, LivePendingSubmission>,
  freezeStartSeconds: number,
  freezeHiddenSubmissions: boolean
): TeamStanding {
  const partyKey = getPartyKey(party) ?? buildFallbackPartyKey(party);
  const members = party.members
    .map((member) => member.handle.trim())
    .filter((handle) => handle.length > 0);
  const name = party.teamName?.trim() || members.join(" / ") || "Unnamed team";
  const problemCells = problems.map((problem) => {
    const problemKey = `${partyKey}:${problem.id}`;
    const attempts = attemptsByProblemKey.get(problemKey) ?? [];
    const livePendingSubmission =
      livePendingSubmissionsByProblemKey.get(problemKey) ?? null;

    return buildProblemCell(
      problem,
      attempts,
      livePendingSubmission,
      freezeStartSeconds,
      freezeHiddenSubmissions
    );
  });

  return {
    id: partyKey,
    rank: 0,
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
  attempts: RelevantSubmissionAttempt[],
  livePendingSubmission: LivePendingSubmission | null,
  freezeStartSeconds: number,
  freezeHiddenSubmissions: boolean
): ProblemCellState {
  const firstAcceptedAttempt = attempts.find((attempt) => attempt.isAccepted);
  const finalWrongAttempts = attempts.filter((attempt) => attempt.isRejected).length;
  const finalSolved = firstAcceptedAttempt !== undefined;

  if (!freezeHiddenSubmissions) {
    if (finalSolved && firstAcceptedAttempt) {
      return {
        kind: "solved",
        problemId: problem.id,
        problemLabel: problem.label,
        wrongAttempts: finalWrongAttempts,
        solveTime: toContestMinute(firstAcceptedAttempt.relativeTimeSeconds),
        solveTimeSeconds: firstAcceptedAttempt.relativeTimeSeconds,
        solveSubmissionId: firstAcceptedAttempt.id,
        penalty: computeIcpcPenalty(
          firstAcceptedAttempt.relativeTimeSeconds,
          finalWrongAttempts
        ),
        firstToSolve: false
      };
    }

    if (livePendingSubmission) {
      return {
        kind: "queued",
        problemId: problem.id,
        problemLabel: problem.label,
        wrongAttempts: finalWrongAttempts,
        frozenSubmissionCount: livePendingSubmission.pendingSubmissionCount,
        pendingContestMinute: toContestMinute(
          livePendingSubmission.relativeTimeSeconds
        )
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

  const hiddenAttempts = attempts.filter(
    (attempt) => attempt.relativeTimeSeconds > freezeStartSeconds
  );
  const preFreezeWrongAttempts = attempts.filter(
    (attempt) =>
      attempt.isRejected && attempt.relativeTimeSeconds <= freezeStartSeconds
  ).length;
  const hiddenWrongAttempts = hiddenAttempts.filter(
    (attempt) => attempt.isRejected
  ).length;
  const solvedBeforeFreeze =
    finalSolved &&
    firstAcceptedAttempt !== undefined &&
    firstAcceptedAttempt.relativeTimeSeconds <= freezeStartSeconds;
  const hiddenSubmissions: HiddenSubmission[] = hiddenAttempts.map(
    (attempt, attemptIndex) => ({
      id: `${problem.id}-hidden-${attempt.id}-${attemptIndex}`,
      contestMinute: toContestMinute(attempt.relativeTimeSeconds),
      result: attempt.isAccepted
        ? "accepted"
        : attempt.isRejected
          ? "rejected"
          : "compilation-error"
    })
  );

  if (solvedBeforeFreeze && firstAcceptedAttempt) {
    return {
      kind: "solved",
      problemId: problem.id,
      problemLabel: problem.label,
      wrongAttempts: finalWrongAttempts,
      solveTime: toContestMinute(firstAcceptedAttempt.relativeTimeSeconds),
      solveTimeSeconds: firstAcceptedAttempt.relativeTimeSeconds,
      solveSubmissionId: firstAcceptedAttempt.id,
      penalty: computeIcpcPenalty(
        firstAcceptedAttempt.relativeTimeSeconds,
        finalWrongAttempts
      ),
      firstToSolve: false
    };
  }

  if (hiddenSubmissions.length > 0) {
    const revealOutcome: PendingRevealOutcome = {
      result: finalSolved ? "solved" : "failed",
      hiddenWrongAttempts,
      finalWrongAttempts,
      solveTime:
        finalSolved && firstAcceptedAttempt
          ? toContestMinute(firstAcceptedAttempt.relativeTimeSeconds)
          : null,
      penalty:
        finalSolved && firstAcceptedAttempt
          ? computeIcpcPenalty(
              firstAcceptedAttempt.relativeTimeSeconds,
              finalWrongAttempts
            )
          : null,
      lastHiddenContestMinute:
        hiddenSubmissions[hiddenSubmissions.length - 1]?.contestMinute ?? null,
      hiddenSubmissions
    };

    return {
      kind: "queued",
      problemId: problem.id,
      problemLabel: problem.label,
      wrongAttempts: preFreezeWrongAttempts,
      frozenSubmissionCount: hiddenSubmissions.length,
      revealOutcome
    };
  }

  if (preFreezeWrongAttempts > 0) {
    return {
      kind: "failed",
      problemId: problem.id,
      problemLabel: problem.label,
      wrongAttempts: preFreezeWrongAttempts
    };
  }

  return {
    kind: "untouched",
    problemId: problem.id,
    problemLabel: problem.label
  };
}

function indexRelevantAttempts(
  submissions: CodeforcesSubmission[],
  problemsByIndex: Set<string>
): Map<string, RelevantSubmissionAttempt[]> {
  const attemptsByProblemKey = new Map<string, RelevantSubmissionAttempt[]>();

  submissions.forEach((submission) => {
    const partyKey = getPartyKey(submission.author);
    const problemIndex = submission.problem.index;
    const relativeTimeSeconds = submission.relativeTimeSeconds;
    const verdictStatus = getCodeforcesSubmissionVerdictStatus(submission.verdict);

    if (
      partyKey === null ||
      !problemsByIndex.has(problemIndex) ||
      relativeTimeSeconds === undefined ||
      relativeTimeSeconds < 0 ||
      verdictStatus === "pending"
    ) {
      return;
    }

    const problemKey = `${partyKey}:${problemIndex}`;
    const currentAttempts = attemptsByProblemKey.get(problemKey) ?? [];

    currentAttempts.push({
      id: submission.id,
      relativeTimeSeconds,
      verdict: submission.verdict ?? "",
      isAccepted: verdictStatus === "accepted",
      isRejected: verdictStatus === "rejected"
    });

    attemptsByProblemKey.set(problemKey, currentAttempts);
  });

  attemptsByProblemKey.forEach((attempts, problemKey) => {
    const relevantAttempts: RelevantSubmissionAttempt[] = [];

    for (const attempt of attempts.sort(compareAttemptsChronologically)) {
      relevantAttempts.push(attempt);

      if (attempt.isAccepted) {
        break;
      }
    }

    attemptsByProblemKey.set(problemKey, relevantAttempts);
  });

  return attemptsByProblemKey;
}

function indexLivePendingSubmissions(
  submissions: CodeforcesSubmission[],
  problemsByIndex: Set<string>,
  revealState: SubmissionRevealState
): Map<string, LivePendingSubmission> {
  const livePendingSubmissionsByProblemKey = new Map<
    string,
    LivePendingSubmission
  >();
  const pendingSubmissionCountsByProblemKey = new Map<string, number>();

  if (
    revealState.pendingSubmissionIds === undefined &&
    revealState.revealedSubmissionIds === undefined
  ) {
    return livePendingSubmissionsByProblemKey;
  }

  submissions
    .filter((submission) => {
      const partyKey = getPartyKey(submission.author);
      const relativeTimeSeconds = submission.relativeTimeSeconds;

      return (
        partyKey !== null &&
        relativeTimeSeconds !== undefined &&
        relativeTimeSeconds >= 0 &&
        problemsByIndex.has(submission.problem.index) &&
        getRecentSubmissionStatus(submission, revealState) === "pending"
      );
    })
    .sort(compareSubmissionsChronologically)
    .forEach((submission) => {
      const partyKey = getPartyKey(submission.author);
      const relativeTimeSeconds = submission.relativeTimeSeconds;

      if (partyKey === null || relativeTimeSeconds === undefined) {
        return;
      }

      const problemKey = `${partyKey}:${submission.problem.index}`;
      const pendingSubmissionCount =
        (pendingSubmissionCountsByProblemKey.get(problemKey) ?? 0) + 1;

      pendingSubmissionCountsByProblemKey.set(
        problemKey,
        pendingSubmissionCount
      );
      livePendingSubmissionsByProblemKey.set(problemKey, {
        id: submission.id,
        relativeTimeSeconds,
        pendingSubmissionCount
      });
    });

  return livePendingSubmissionsByProblemKey;
}

function buildRecentSubmissions(
  submissions: CodeforcesSubmission[],
  teams: TeamStanding[],
  revealState: SubmissionRevealState
): RecentSubmission[] {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const wrongAttemptCountsBySubmissionId = buildWrongAttemptCountsBySubmissionId(
    submissions,
    revealState
  );
  const pendingVisualCountsBySubmissionId = buildPendingVisualCountsBySubmissionId(
    submissions,
    revealState
  );

  return [...submissions]
    .sort(compareSubmissionsReverseChronologically)
    .slice(0, LIVE_RECENT_SUBMISSION_LIMIT)
    .map((submission) => {
      const partyKey = getPartyKey(submission.author) ?? "";
      const team = teamsById.get(partyKey);
      const status = getRecentSubmissionStatus(submission, revealState);
      const wrongAttempts = wrongAttemptCountsBySubmissionId.get(submission.id) ?? 0;
      const pendingVisualCount =
        pendingVisualCountsBySubmissionId.get(submission.id) ?? 0;

      return {
        id: `cf-submission-${submission.id}`,
        teamId: partyKey || undefined,
        contestMinute: toContestMinute(submission.relativeTimeSeconds ?? 0),
        teamName: team?.name ?? getPartyDisplayName(submission.author),
        problemLabel: submission.problem.index,
        summary: formatRecentSubmissionSummary(
          status,
          toContestMinute(submission.relativeTimeSeconds ?? 0),
          wrongAttempts,
          pendingVisualCount
        ),
        kind: status === "pending" ? "queued" : "frozen-pending",
        status
      };
    });
}

function buildWrongAttemptCountsBySubmissionId(
  submissions: CodeforcesSubmission[],
  revealState: SubmissionRevealState
): Map<number, number> {
  const wrongAttemptCountsBySubmissionId = new Map<number, number>();
  const problemStates = new Map<string, { wrongAttempts: number; solved: boolean }>();

  [...submissions].sort(compareSubmissionsChronologically).forEach((submission) => {
    const partyKey = getPartyKey(submission.author);

    if (partyKey === null) {
      return;
    }

    const problemKey = `${partyKey}:${submission.problem.index}`;
    const problemState =
      problemStates.get(problemKey) ?? { wrongAttempts: 0, solved: false };
    const verdictStatus = getRecentSubmissionStatus(submission, revealState);

    if (problemState.solved) {
      wrongAttemptCountsBySubmissionId.set(submission.id, problemState.wrongAttempts);
      return;
    }

    if (verdictStatus === "rejected") {
      problemState.wrongAttempts += 1;
    }

    wrongAttemptCountsBySubmissionId.set(
      submission.id,
      problemState.wrongAttempts
    );

    if (verdictStatus === "accepted") {
      problemState.solved = true;
    }

    problemStates.set(problemKey, problemState);
  });

  return wrongAttemptCountsBySubmissionId;
}

function buildPendingVisualCountsBySubmissionId(
  submissions: CodeforcesSubmission[],
  revealState: SubmissionRevealState
): Map<number, number> {
  const pendingVisualCountsBySubmissionId = new Map<number, number>();
  const pendingSubmissionCountsByProblemKey = new Map<string, number>();

  [...submissions].sort(compareSubmissionsChronologically).forEach((submission) => {
    const partyKey = getPartyKey(submission.author);

    if (partyKey === null) {
      return;
    }

    if (getRecentSubmissionStatus(submission, revealState) !== "pending") {
      return;
    }

    const problemKey = `${partyKey}:${submission.problem.index}`;
    const previousPendingSubmissions =
      pendingSubmissionCountsByProblemKey.get(problemKey) ?? 0;

    pendingVisualCountsBySubmissionId.set(
      submission.id,
      previousPendingSubmissions
    );
    pendingSubmissionCountsByProblemKey.set(
      problemKey,
      previousPendingSubmissions + 1
    );
  });

  return pendingVisualCountsBySubmissionId;
}

function getRecentSubmissionStatus(
  submission: CodeforcesSubmission,
  revealState: SubmissionRevealState
): CodeforcesSubmissionVerdictStatus {
  if (
    revealState.pendingSubmissionIds?.has(submission.id) &&
    !revealState.revealedSubmissionIds?.has(submission.id)
  ) {
    return "pending";
  }

  if (
    revealState.revealedSubmissionIds !== undefined &&
    !revealState.revealedSubmissionIds.has(submission.id)
  ) {
    return "pending";
  }

  return getCodeforcesSubmissionVerdictStatus(submission.verdict);
}

function formatRecentSubmissionSummary(
  status: CodeforcesSubmissionVerdictStatus,
  contestMinute: number,
  wrongAttempts: number,
  pendingVisualCount: number
): string {
  switch (status) {
    case "accepted":
      return `OK ${contestMinute}`;
    case "rejected":
      return `X +${wrongAttempts}`;
    case "compilation-error":
      return `X +${wrongAttempts}`;
    case "pending":
      return `${formatPendingVisualCount(pendingVisualCount)} +${wrongAttempts}`;
  }
}

function formatPendingVisualCount(pendingVisualCount: number): string {
  return pendingVisualCount > 0 ? `(${pendingVisualCount})` : "?";
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

        return isSolvedCell(cell)
          ? {
              teamIndex,
              cell
            }
          : null;
      })
      .filter(
        (
          entry
        ): entry is { teamIndex: number; cell: SolvedProblemCell } =>
          entry !== null
      )
      .sort(
        (leftEntry, rightEntry) =>
          getSolvedCellTimeSeconds(leftEntry.cell) -
            getSolvedCellTimeSeconds(rightEntry.cell) ||
          (leftEntry.cell.solveSubmissionId ?? Number.MAX_SAFE_INTEGER) -
            (rightEntry.cell.solveSubmissionId ?? Number.MAX_SAFE_INTEGER) ||
          leftEntry.teamIndex - rightEntry.teamIndex
      );

    solvedEntries.forEach(({ teamIndex, cell }, solvedIndex) => {
      nextTeams[teamIndex].problems[problemIndex] = {
        ...cell,
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
      getScoreAchievedAtSeconds(leftTeam) - getScoreAchievedAtSeconds(rightTeam) ||
      leftTeam.name.localeCompare(rightTeam.name)
  );
  let currentRank = 0;
  let previousSolved = Number.NaN;
  let previousPenalty = Number.NaN;
  let previousScoreAchievedAt = Number.NaN;

  return sortedTeams.map((team, index) => {
    const scoreAchievedAt = getScoreAchievedAtSeconds(team);

    if (
      team.solved !== previousSolved ||
      team.penalty !== previousPenalty ||
      scoreAchievedAt !== previousScoreAchievedAt
    ) {
      currentRank = index + 1;
      previousSolved = team.solved;
      previousPenalty = team.penalty;
      previousScoreAchievedAt = scoreAchievedAt;
    }

    return {
      ...team,
      rank: currentRank
    };
  });
}

function countSolvedProblems(problemCells: ProblemCellState[]): number {
  return problemCells.filter(isSolvedCell).length;
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

function getScoreAchievedAtSeconds(team: TeamStanding): number {
  const solvedTimes = team.problems
    .filter(isSolvedCell)
    .map((cell) => getSolvedCellTimeSeconds(cell));

  return solvedTimes.length > 0 ? Math.max(...solvedTimes) : 0;
}

function getSolvedCellTimeSeconds(cell: SolvedProblemCell): number {
  return cell.solveTimeSeconds ?? cell.solveTime * 60;
}

function computeIcpcPenalty(relativeTimeSeconds: number, wrongAttempts: number): number {
  return toContestMinute(relativeTimeSeconds) + wrongAttempts * 20;
}

function toContestMinute(relativeTimeSeconds: number): number {
  return Math.max(0, Math.floor(relativeTimeSeconds / 60));
}

function isIncludedParticipantType(
  participantType: CodeforcesParticipantType
): boolean {
  return INCLUDED_PARTICIPANT_TYPE_SET.has(participantType);
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

function buildFallbackPartyKey(party: CodeforcesParty): string {
  return `participant-${sanitizeKeySegment(
    party.teamName || party.members.map((member) => member.handle).join("-") || "unknown"
  )}`;
}

function getPartyDisplayName(party: CodeforcesParty): string {
  const members = party.members
    .map((member) => member.handle.trim())
    .filter((handle) => handle.length > 0);

  return party.teamName?.trim() || members.join(" / ") || "Unknown participant";
}

function compareAttemptsChronologically(
  leftAttempt: RelevantSubmissionAttempt,
  rightAttempt: RelevantSubmissionAttempt
): number {
  return (
    leftAttempt.relativeTimeSeconds - rightAttempt.relativeTimeSeconds ||
    leftAttempt.id - rightAttempt.id
  );
}

function compareSubmissionsChronologically(
  leftSubmission: CodeforcesSubmission,
  rightSubmission: CodeforcesSubmission
): number {
  return (
    (leftSubmission.relativeTimeSeconds ?? 0) -
      (rightSubmission.relativeTimeSeconds ?? 0) ||
    leftSubmission.id - rightSubmission.id
  );
}

function compareSubmissionsReverseChronologically(
  leftSubmission: CodeforcesSubmission,
  rightSubmission: CodeforcesSubmission
): number {
  return (
    (rightSubmission.relativeTimeSeconds ?? 0) -
      (leftSubmission.relativeTimeSeconds ?? 0) ||
    rightSubmission.id - leftSubmission.id
  );
}

function compareProblemIndex(leftIndex: string, rightIndex: string): number {
  return leftIndex.localeCompare(rightIndex, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function isSolvedCell(cell: ProblemCellState): cell is SolvedProblemCell {
  return cell.kind === "solved";
}

function formatStatusUpdateLabel(updatedAt: Date, elapsedSeconds: number): string {
  return `Loaded from Codeforces contest.status at ${updatedAt.toLocaleTimeString()} through ${formatElapsedSeconds(
    elapsedSeconds
  )}`;
}

function formatElapsedSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
