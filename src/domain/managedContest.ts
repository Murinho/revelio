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
      "latam-final-2026",
      createMockConfiguration({
        contestName: "LATAM Final 2026",
        startAtUtc: "2026-03-20T16:00",
        durationMinutes: 300,
        freezeDurationMinutes: 60,
        contestUrl: "https://codeforces.com/group/revelio/contest/latam-final-2026",
        problemCount: 13
      })
    ),
    createManagedContest(
      "winter-camp-day-2",
      createMockConfiguration({
        contestName: "Winter Camp Day 2",
        startAtUtc: "2026-03-20T19:30",
        durationMinutes: 240,
        freezeDurationMinutes: 45,
        contestUrl: "https://codeforces.com/group/revelio/contest/winter-camp-day-2",
        problemCount: 10
      })
    ),
    createManagedContest(
      "spring-open-2026",
      createMockConfiguration({
        contestName: "Spring Open 2026",
        startAtUtc: "2026-03-21T18:00",
        durationMinutes: 180,
        freezeDurationMinutes: 30,
        contestUrl: "https://codeforces.com/group/revelio/contest/spring-open-2026",
        problemCount: 8
      })
    ),
    createManagedContest(
      "regional-practice-7",
      createMockConfiguration({
        contestName: "Regional Practice 7",
        startAtUtc: "2026-03-24T00:00",
        durationMinutes: 210,
        freezeDurationMinutes: 45,
        contestUrl: "https://codeforces.com/group/revelio/contest/regional-practice-7",
        problemCount: 9
      })
    ),
    createManagedContest(
      "continental-qualifier",
      createMockConfiguration({
        contestName: "Continental Qualifier",
        startAtUtc: "2026-03-17T22:00",
        durationMinutes: 300,
        freezeDurationMinutes: 60,
        contestUrl: "https://codeforces.com/group/revelio/contest/continental-qualifier",
        problemCount: 12
      })
    ),
    createManagedContest(
      "balloon-night-scrim",
      createMockConfiguration({
        contestName: "Balloon Night Scrim",
        startAtUtc: "2026-03-10T01:30",
        durationMinutes: 150,
        freezeDurationMinutes: 0,
        contestUrl: "https://codeforces.com/group/revelio/contest/balloon-night-scrim",
        problemCount: 6
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
