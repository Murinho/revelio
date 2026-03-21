import {
  ContestSnapshot,
  PendingRevealOutcome,
  ProblemCellState,
  SolvedProblemCell,
  TeamStanding
} from "./types";

export interface UnfreezeRevealEvent {
  id: string;
  teamId: string;
  teamName: string;
  organization?: string;
  problemId: string;
  problemLabel: string;
  contestMinute: number;
  result: "solved" | "failed";
  wrongAttempts: number;
  penalty: number | null;
}

export function createFrozenSnapshot(snapshot: ContestSnapshot): ContestSnapshot {
  return {
    ...snapshot,
    phase: "frozen",
    updatedAtLabel: "Frozen scoreboard ready for reveal",
    teams: snapshot.teams.map((team) => ({
      ...team,
      marked: false,
      problems: team.problems.map((cell) =>
        cell.kind === "queued"
          ? {
              ...cell,
              kind: "frozen-pending"
            }
          : { ...cell }
      )
    })),
    recentSubmissions: snapshot.recentSubmissions.map((submission) => ({
      ...submission,
      kind: "frozen-pending"
    }))
  };
}

export function buildUnfreezeRevealEvents(
  snapshot: ContestSnapshot
): UnfreezeRevealEvent[] {
  let teams = rankTeams(
    applyFirstToSolveFlags(
      createFrozenSnapshot(snapshot).teams.map((team) => ({
        ...team,
        marked: false,
        problems: team.problems.map((cell) => ({ ...cell }))
      }))
    )
  ).map((team) => ({
    ...team,
    marked: false
  }));

  const revealEvents: UnfreezeRevealEvent[] = [];

  while (true) {
    const teamIndex = findLastUnmarkedTeamIndex(teams);

    if (teamIndex < 0) {
      return revealEvents;
    }

    const activeTeamId = teams[teamIndex].id;

    while (true) {
      const activeTeamIndex = teams.findIndex((team) => team.id === activeTeamId);

      if (activeTeamIndex < 0) {
        break;
      }

      const activeTeam = teams[activeTeamIndex];
      const problemIndex = findNextPendingProblemIndex(activeTeam);

      if (problemIndex < 0) {
        teams = teams.map((currentTeam) =>
          currentTeam.id === activeTeamId
            ? {
                ...currentTeam,
                marked: true
              }
            : currentTeam
        );
        break;
      }

      const pendingCell = activeTeam.problems[problemIndex];

      if (!isPendingCell(pendingCell)) {
        break;
      }

      const revealEvent = buildRevealEventFromPendingCell(
        activeTeam,
        pendingCell,
        activeTeamIndex,
        problemIndex
      );

      revealEvents.push(revealEvent);

      teams[activeTeamIndex].problems[problemIndex] = createRevealedCell(revealEvent);
      teams = rankTeams(applyFirstToSolveFlags(teams));
    }
  }
}

export function applyUnfreezeProgress(
  snapshot: ContestSnapshot,
  revealEvents: UnfreezeRevealEvent[],
  revealCount: number
): ContestSnapshot {
  const frozenSnapshot = createFrozenSnapshot(snapshot);
  const nextTeams = frozenSnapshot.teams.map((team) => ({
    ...team,
    marked: false,
    problems: team.problems.map((cell) => ({ ...cell }))
  }));
  const teamIndexById = new Map(nextTeams.map((team, index) => [team.id, index]));

  revealEvents.slice(0, revealCount).forEach((event) => {
    const teamIndex = teamIndexById.get(event.teamId);

    if (teamIndex === undefined) {
      return;
    }

    const problemIndex = nextTeams[teamIndex].problems.findIndex(
      (cell) => cell.problemId === event.problemId
    );

    if (problemIndex < 0) {
      return;
    }

    nextTeams[teamIndex].problems[problemIndex] = createRevealedCell(event);
  });

  const rankedTeams = rankTeams(applyFirstToSolveFlags(nextTeams));
  const revealedCount = Math.min(revealCount, revealEvents.length);
  const pendingCount = revealEvents.length - revealedCount;

  return {
    ...frozenSnapshot,
    phase: pendingCount === 0 ? "complete" : "revealing",
    teams: rankedTeams,
    updatedAtLabel:
      pendingCount === 0
        ? "All frozen submissions have been revealed"
        : `${revealedCount} reveal${revealedCount === 1 ? "" : "s"} completed`
  };
}

export function countRevealedSolves(revealEvents: UnfreezeRevealEvent[]): number {
  return revealEvents.filter((event) => event.result === "solved").length;
}

function buildRevealEventFromPendingCell(
  team: TeamStanding,
  cell: Extract<ProblemCellState, { kind: "queued" | "frozen-pending" }>,
  teamIndex: number,
  problemIndex: number
): UnfreezeRevealEvent {
  const revealOutcome = cell.revealOutcome ?? createSyntheticRevealOutcome(cell, teamIndex, problemIndex);
  const contestMinute = revealOutcome.contestMinute ?? revealOutcome.lastHiddenContestMinute ?? 0;
  const penalty =
    revealOutcome.result === "solved"
      ? revealOutcome.penalty ??
        contestMinute + Math.max(0, revealOutcome.finalWrongAttempts) * 20
      : null;

  return {
    id: `${team.id}-${cell.problemId}`,
    teamId: team.id,
    teamName: team.name,
    organization: team.organization,
    problemId: cell.problemId,
    problemLabel: cell.problemLabel,
    contestMinute,
    result: revealOutcome.result,
    wrongAttempts: revealOutcome.finalWrongAttempts,
    penalty
  };
}

function createSyntheticRevealOutcome(
  cell: Extract<ProblemCellState, { kind: "queued" | "frozen-pending" }>,
  teamIndex: number,
  problemIndex: number
): PendingRevealOutcome {
  const revealSeed =
    teamIndex + problemIndex + cell.wrongAttempts + cell.frozenSubmissionCount;
  const contestMinute = 240 + revealSeed * 3;
  const solved =
    (problemIndex + teamIndex + cell.frozenSubmissionCount) % 4 !== 0;
  const finalWrongAttempts = solved
    ? cell.wrongAttempts + Math.max(0, cell.frozenSubmissionCount - 1)
    : cell.wrongAttempts + cell.frozenSubmissionCount;

  return {
    result: solved ? "solved" : "failed",
    hiddenWrongAttempts: Math.max(0, finalWrongAttempts - cell.wrongAttempts),
    finalWrongAttempts,
    contestMinute,
    penalty: solved ? contestMinute + finalWrongAttempts * 20 : null,
    lastHiddenContestMinute: contestMinute
  };
}

function createRevealedCell(event: UnfreezeRevealEvent): ProblemCellState {
  return event.result === "solved"
    ? {
        kind: "solved",
        problemId: event.problemId,
        problemLabel: event.problemLabel,
        wrongAttempts: event.wrongAttempts,
        penalty: event.penalty ?? event.contestMinute,
        firstToSolve: false
      }
    : {
        kind: "failed",
        problemId: event.problemId,
        problemLabel: event.problemLabel,
        wrongAttempts: event.wrongAttempts
      };
}

function findLastUnmarkedTeamIndex(teams: TeamStanding[]): number {
  for (let teamIndex = teams.length - 1; teamIndex >= 0; teamIndex -= 1) {
    if (!teams[teamIndex].marked) {
      return teamIndex;
    }
  }

  return -1;
}

function findNextPendingProblemIndex(team: TeamStanding): number {
  return team.problems.findIndex((cell) => isPendingCell(cell));
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
    const solvedCells = nextTeams
      .map((team, teamIndex) => {
        const cell = team.problems[problemIndex];

        return isSolvedCell(cell)
          ? {
              teamIndex,
              cell
            }
          : null;
      })
      .filter((entry): entry is { teamIndex: number; cell: SolvedProblemCell } =>
        entry !== null
      )
      .sort(
        (leftEntry, rightEntry) =>
          leftEntry.cell.penalty - rightEntry.cell.penalty ||
          leftEntry.teamIndex - rightEntry.teamIndex
      );

    solvedCells.forEach(({ teamIndex, cell }, solvedIndex) => {
      nextTeams[teamIndex].problems[problemIndex] = {
        ...cell,
        firstToSolve: solvedIndex === 0
      };
    });
  }

  return nextTeams.map((team) => ({
    ...team,
    solved: team.problems.filter(isSolvedCell).length,
    penalty: team.problems.reduce(
      (totalPenalty, cell) => totalPenalty + (isSolvedCell(cell) ? cell.penalty : 0),
      0
    ),
    pendingProblemLabels: team.problems
      .filter(isPendingCell)
      .map((cell) => cell.problemLabel)
  }));
}

function rankTeams(teams: TeamStanding[]): TeamStanding[] {
  const markedById = new Map(teams.map((team) => [team.id, team.marked]));
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
      rank: currentRank,
      marked: markedById.get(team.id) ?? false
    };
  });
}

function isSolvedCell(cell: ProblemCellState): cell is SolvedProblemCell {
  return cell.kind === "solved";
}

function isPendingCell(
  cell: ProblemCellState
): cell is Extract<ProblemCellState, { kind: "queued" | "frozen-pending" }> {
  return cell.kind === "queued" || cell.kind === "frozen-pending";
}
