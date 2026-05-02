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
export const DEFAULT_PROBLEM_COUNT = 12;

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
    problems: resizeContestProblems([], DEFAULT_PROBLEM_COUNT),
    codeforces: {
      apiKey: "",
      apiSecret: ""
    }
  };
}

export function cloneContestConfiguration(
  configuration: ContestConfiguration
): ContestConfiguration {
  return {
    ...configuration,
    problems: configuration.problems.map((problem) => ({ ...problem })),
    codeforces: { ...configuration.codeforces }
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

export function formatLocalStartSummary(startAtUtc: string): string {
  const startDate = parseUtcDateTimeInputValue(startAtUtc);

  if (!startDate) {
    return "Local time pending";
  }

  return `${toLocalDateTimeInputValue(startDate).replace("T", " ")} ${formatUtcOffset(startDate)}`;
}

export function formatLocalEndSummary(
  startAtUtc: string,
  durationMinutes: number
): string {
  const endDate = calculateContestEndDate(startAtUtc, durationMinutes);

  if (!endDate) {
    return "End time pending";
  }

  return `${toLocalDateTimeInputValue(endDate).replace("T", " ")} ${formatUtcOffset(endDate)}`;
}

export function formatLocalUtcOffset(startAtUtc: string): string {
  return formatUtcOffset(parseUtcDateTimeInputValue(startAtUtc) ?? new Date());
}

export function toLocalStartDateTimeInputValue(startAtUtc: string): string {
  const startDate = parseUtcDateTimeInputValue(startAtUtc);

  return startDate ? toLocalDateTimeInputValue(startDate) : "";
}

export function toLocalEndDateTimeInputValue(
  startAtUtc: string,
  durationMinutes: number
): string {
  const endDate = calculateContestEndDate(startAtUtc, durationMinutes);

  return endDate ? toLocalDateTimeInputValue(endDate) : "";
}

export function toUtcStartDateTimeInputValue(localStartAt: string): string {
  if (!localStartAt) {
    return "";
  }

  const localDate = parseLocalDateTimeInputValue(localStartAt);

  return localDate ? toUtcDateTimeInputValue(localDate) : "";
}

export function calculateContestEndDate(
  startAtUtc: string,
  durationMinutes: number
): Date | null {
  const startDate = parseUtcDateTimeInputValue(startAtUtc);

  if (!startDate || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  return new Date(startDate.getTime() + Math.floor(durationMinutes) * 60_000);
}

export function calculateDurationMinutesFromLocalEndDateTimeInputValue(
  startAtUtc: string,
  localEndAt: string
): number | null {
  const startDate = parseUtcDateTimeInputValue(startAtUtc);
  const endDate = parseLocalDateTimeInputValue(localEndAt);

  if (!startDate || !endDate) {
    return null;
  }

  const durationMinutes = Math.round(
    (endDate.getTime() - startDate.getTime()) / 60_000
  );

  return durationMinutes > 0 ? durationMinutes : null;
}

export function parseUtcDateTimeInputValue(value: string): Date | null {
  const dateTimeParts = parseDateTimeInputParts(value);

  if (!dateTimeParts) {
    return null;
  }

  const { year, month, day, hours, minutes } = dateTimeParts;
  const parsedDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day ||
    parsedDate.getUTCHours() !== hours ||
    parsedDate.getUTCMinutes() !== minutes
  ) {
    return null;
  }

  return parsedDate;
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

function parseLocalDateTimeInputValue(value: string): Date | null {
  const dateTimeParts = parseDateTimeInputParts(value);

  if (!dateTimeParts) {
    return null;
  }

  const { year, month, day, hours, minutes } = dateTimeParts;
  const parsedDate = new Date(year, month - 1, day, hours, minutes);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day ||
    parsedDate.getHours() !== hours ||
    parsedDate.getMinutes() !== minutes
  ) {
    return null;
  }

  return parsedDate;
}

function parseDateTimeInputParts(value: string):
  | {
      year: number;
      month: number;
      day: number;
      hours: number;
      minutes: number;
    }
  | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hoursText, minutesText] = match;
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    hours,
    minutes
  };
}

function toLocalDateTimeInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toUtcDateTimeInputValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatUtcOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteOffsetMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (absoluteOffsetMinutes % 60).toString().padStart(2, "0");

  return `UTC${sign}${hours}:${minutes}`;
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
