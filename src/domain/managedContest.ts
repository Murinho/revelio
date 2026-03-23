import {
  cloneContestConfiguration,
  ContestConfiguration,
  createDefaultContestConfiguration,
  resizeContestProblems
} from "./contestConfiguration";

export type ContestTimelineBucket = "past" | "current" | "future";

export interface ManagedContest {
  id: string;
  configuration: ContestConfiguration;
}

export function createMockManagedContests(): ManagedContest[] {
  return [
    createManagedContest(
      "106416",
      createMockConfiguration({
        contestName: "The 2026 ICPC Latin America Championship",
        startAtUtc: "2026-03-20T16:00",
        durationMinutes: 300,
        freezeDurationMinutes: 60,
        contestUrl: "https://codeforces.com/gym/106416",
        problemCount: 12
      })
    )
  ];
}

export function createManagedContest(
  id: string,
  configuration: ContestConfiguration
): ManagedContest {
  return {
    id,
    configuration: cloneContestConfiguration(configuration)
  };
}

export function getContestTimelineBucket(
  contest: ManagedContest,
  now = new Date()
): ContestTimelineBucket {
  const startAt = parseUtcInput(contest.configuration.startAtUtc);

  if (!startAt) {
    return "future";
  }

  const endAt = new Date(
    startAt.getTime() + contest.configuration.durationMinutes * 60_000
  );

  if (now < startAt) {
    return "future";
  }

  if (now >= endAt) {
    return "past";
  }

  return "current";
}

function createMockConfiguration(options: {
  contestName: string;
  startAtUtc: string;
  durationMinutes: number;
  freezeDurationMinutes: number;
  contestUrl: string;
  problemCount: number;
}): ContestConfiguration {
  const baseConfiguration = createDefaultContestConfiguration(
    parseUtcInput(options.startAtUtc) ?? new Date()
  );

  return {
    ...baseConfiguration,
    contestName: options.contestName,
    startAtUtc: options.startAtUtc,
    durationMinutes: options.durationMinutes,
    freezeDurationMinutes: options.freezeDurationMinutes,
    contestUrl: options.contestUrl,
    problems: resizeContestProblems(baseConfiguration.problems, options.problemCount)
  };
}

function parseUtcInput(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(`${value}:00Z`);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}
