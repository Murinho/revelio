import { ContestSnapshot, ProblemCellState, ProblemMeta } from "./types";

export interface ContestProblemConfiguration {
  id: string;
  label: string;
  balloonColor: string;
}

export interface ContestCodeforcesCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface ContestConfiguration {
  contestName: string;
  startAtUtc: string;
  durationMinutes: number;
  freezeDurationMinutes: number;
  contestUrl: string;
  problems: ContestProblemConfiguration[];
  codeforces: ContestCodeforcesCredentials;
}

export const MIN_PROBLEM_COUNT = 1;
export const MAX_PROBLEM_COUNT = 26;

const DEFAULT_BALLOON_COLORS = [
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

export function createDefaultContestConfiguration(now = new Date()): ContestConfiguration {
  return {
    contestName: "Latin America Championship",
    startAtUtc: toUtcDateTimeInputValue(now),
    durationMinutes: 300,
    freezeDurationMinutes: 60,
    contestUrl: "",
    problems: resizeContestProblems([], 12),
    codeforces: {
      apiKey: "",
      apiSecret: ""
    }
  };
}

export function resizeContestProblems(
  problems: ContestProblemConfiguration[],
  nextCount: number
): ContestProblemConfiguration[] {
  const safeCount = clamp(nextCount, MIN_PROBLEM_COUNT, MAX_PROBLEM_COUNT);

  return Array.from({ length: safeCount }, (_, index) => {
    const label = getProblemLabel(index);
    const existingProblem = problems[index];

    if (existingProblem) {
      return {
        ...existingProblem,
        id: label,
        label
      };
    }

    return createContestProblemConfiguration(index);
  });
}

export function formatDurationClock(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainderMinutes = safeMinutes % 60;

  return `${hours}:${remainderMinutes.toString().padStart(2, "0")}:00`;
}

export function formatFreezeWindowLabel(minutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(minutes));

  if (safeMinutes === 0) {
    return "No scoreboard freeze configured";
  }

  if (safeMinutes === 1) {
    return "Frozen during the final minute";
  }

  return `Frozen during the final ${safeMinutes} minutes`;
}

export function formatUtcSummary(startAtUtc: string): string {
  return startAtUtc ? `${startAtUtc.replace("T", " ")} UTC` : "UTC pending";
}

export function createConfiguredContestPreview(
  snapshot: ContestSnapshot,
  configuration: ContestConfiguration
): ContestSnapshot {
  const problems = configuration.problems.map((problem) => ({
    id: problem.id,
    label: problem.label,
    color: problem.balloonColor
  }));
  const visibleProblemLabels = new Set(problems.map((problem) => problem.label));

  return {
    ...snapshot,
    contestName: "Revelio",
    regionName: configuration.contestName.trim() || snapshot.regionName,
    durationLabel: formatDurationClock(configuration.durationMinutes),
    freezeLabel: formatFreezeWindowLabel(configuration.freezeDurationMinutes),
    problems,
    teams: snapshot.teams.map((team) => {
      const nextCells = problems.map((problem, index) =>
        bindProblemToCell(problem, team.problems[index])
      );

      return {
        ...team,
        solved: nextCells.filter((cell) => cell.kind === "solved").length,
        problems: nextCells,
        pendingProblemLabels: team.pendingProblemLabels.filter((label) =>
          visibleProblemLabels.has(label)
        )
      };
    }),
    recentSubmissions: snapshot.recentSubmissions.filter((submission) =>
      visibleProblemLabels.has(submission.problemLabel)
    ),
    updatedAtLabel: "Previewing configured contest settings"
  };
}

function createContestProblemConfiguration(index: number): ContestProblemConfiguration {
  const label = getProblemLabel(index);

  return {
    id: label,
    label,
    balloonColor: DEFAULT_BALLOON_COLORS[index % DEFAULT_BALLOON_COLORS.length]
  };
}

function getProblemLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function toUtcDateTimeInputValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function bindProblemToCell(problem: ProblemMeta, cell?: ProblemCellState): ProblemCellState {
  if (!cell) {
    return {
      kind: "untouched",
      problemId: problem.id,
      problemLabel: problem.label
    };
  }

  return {
    ...cell,
    problemId: problem.id,
    problemLabel: problem.label
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
