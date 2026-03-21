import {
  ContestSnapshot,
  HiddenSubmission,
  PendingProblemCell,
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
  verdict: "rejected" | "accepted";
  result: "pending" | "solved" | "failed";
  wrongAttempts: number;
  frozenSubmissionCount: number;
  penalty: number | null;
  nextCell: ProblemCellState;
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
              kind: "frozen-pending",
              problemId: cell.problemId,
              problemLabel: cell.problemLabel,
              wrongAttempts: cell.wrongAttempts,
              frozenSubmissionCount: cell.frozenSubmissionCount,
              revealOutcome: cell.revealOutcome ? cloneRevealOutcome(cell.revealOutcome) : undefined
            }
          : cloneProblemCell(cell)
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
      createFrozenSnapshot(snapshot).teams.map((team) => cloneTeam(team, false))
    )
  );
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
        teams = teams.map((team) =>
          team.id === activeTeamId
            ? {
                ...team,
                marked: true
              }
            : team
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
      teams[activeTeamIndex].problems[problemIndex] = cloneProblemCell(revealEvent.nextCell);
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
  const nextTeams = frozenSnapshot.teams.map((team) => cloneTeam(team, false));
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

    nextTeams[teamIndex].problems[problemIndex] = cloneProblemCell(event.nextCell);
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
        : `${revealedCount} submission${revealedCount === 1 ? "" : "s"} revealed`
  };
}

export function countRevealedSolves(revealEvents: UnfreezeRevealEvent[]): number {
  return revealEvents.filter((event) => event.result === "solved").length;
}

function buildRevealEventFromPendingCell(
  team: TeamStanding,
  cell: PendingProblemCell,
  teamIndex: number,
  problemIndex: number
): UnfreezeRevealEvent {
  const revealOutcome =
    cell.revealOutcome?.hiddenSubmissions.length
      ? cloneRevealOutcome(cell.revealOutcome)
      : createSyntheticRevealOutcome(cell, teamIndex, problemIndex);
  const [hiddenSubmission, ...remainingHiddenSubmissions] =
    revealOutcome.hiddenSubmissions;

  if (!hiddenSubmission) {
    throw new Error(
      `Pending cell ${team.id}/${cell.problemId} is missing hidden submissions.`
    );
  }

  const nextWrongAttempts =
    cell.wrongAttempts + (hiddenSubmission.result === "rejected" ? 1 : 0);
  const contestMinute =
    hiddenSubmission.contestMinute ??
    revealOutcome.contestMinute ??
    revealOutcome.lastHiddenContestMinute ??
    0;
  const nextCell = createNextCell(
    cell,
    revealOutcome,
    hiddenSubmission,
    remainingHiddenSubmissions,
    nextWrongAttempts,
    contestMinute
  );
  const result =
    nextCell.kind === "solved"
      ? "solved"
      : nextCell.kind === "failed"
        ? "failed"
        : "pending";

  return {
    id: `${team.id}-${cell.problemId}-${hiddenSubmission.id}`,
    teamId: team.id,
    teamName: team.name,
    organization: team.organization,
    problemId: cell.problemId,
    problemLabel: cell.problemLabel,
    contestMinute,
    verdict: hiddenSubmission.result,
    result,
    wrongAttempts: nextWrongAttempts,
    frozenSubmissionCount: isPendingCell(nextCell) ? nextCell.frozenSubmissionCount : 0,
    penalty: nextCell.kind === "solved" ? nextCell.penalty : null,
    nextCell
  };
}

function createNextCell(
  cell: PendingProblemCell,
  revealOutcome: PendingRevealOutcome,
  hiddenSubmission: HiddenSubmission,
  remainingHiddenSubmissions: HiddenSubmission[],
  wrongAttempts: number,
  contestMinute: number
): ProblemCellState {
  if (hiddenSubmission.result === "accepted") {
    return {
      kind: "solved",
      problemId: cell.problemId,
      problemLabel: cell.problemLabel,
      wrongAttempts,
      penalty:
        revealOutcome.penalty ?? contestMinute + Math.max(0, wrongAttempts) * 20,
      firstToSolve: false
    };
  }

  if (remainingHiddenSubmissions.length === 0) {
    return {
      kind: "failed",
      problemId: cell.problemId,
      problemLabel: cell.problemLabel,
      wrongAttempts
    };
  }

  return {
    kind: cell.kind === "queued" ? "queued" : "frozen-pending",
    problemId: cell.problemId,
    problemLabel: cell.problemLabel,
    wrongAttempts,
    frozenSubmissionCount: remainingHiddenSubmissions.length,
    revealOutcome: {
      ...revealOutcome,
      result: remainingHiddenSubmissions.some(
        (submission) => submission.result === "accepted"
      )
        ? "solved"
        : "failed",
      hiddenWrongAttempts: remainingHiddenSubmissions.filter(
        (submission) => submission.result === "rejected"
      ).length,
      lastHiddenContestMinute:
        remainingHiddenSubmissions[remainingHiddenSubmissions.length - 1]
          ?.contestMinute ?? null,
      hiddenSubmissions: remainingHiddenSubmissions
    }
  };
}

function createSyntheticRevealOutcome(
  cell: PendingProblemCell,
  teamIndex: number,
  problemIndex: number
): PendingRevealOutcome {
  const revealSeed =
    teamIndex + problemIndex + cell.wrongAttempts + cell.frozenSubmissionCount;
  const solved =
    (problemIndex + teamIndex + cell.frozenSubmissionCount) % 4 !== 0;
  const hiddenSubmissions: HiddenSubmission[] = Array.from(
    { length: Math.max(1, cell.frozenSubmissionCount) },
    (_, hiddenIndex) => {
      const contestMinute = 240 + revealSeed * 3 + hiddenIndex * 4;
      const isAccepted = solved && hiddenIndex === cell.frozenSubmissionCount - 1;

      return {
        id: `synthetic-${cell.problemId}-${hiddenIndex + 1}`,
        contestMinute,
        result: isAccepted ? "accepted" : "rejected"
      };
    }
  );
  const hiddenWrongAttempts = hiddenSubmissions.filter(
    (submission) => submission.result === "rejected"
  ).length;
  const finalWrongAttempts = cell.wrongAttempts + hiddenWrongAttempts;
  const solveSubmission = hiddenSubmissions.find(
    (submission) => submission.result === "accepted"
  );
  const contestMinute = solveSubmission?.contestMinute ?? null;

  return {
    result: solved ? "solved" : "failed",
    hiddenWrongAttempts,
    finalWrongAttempts,
    contestMinute,
    penalty:
      solved && contestMinute !== null
        ? contestMinute + finalWrongAttempts * 20
        : null,
    lastHiddenContestMinute:
      hiddenSubmissions[hiddenSubmissions.length - 1]?.contestMinute ?? null,
    hiddenSubmissions
  };
}

function cloneRevealOutcome(revealOutcome: PendingRevealOutcome): PendingRevealOutcome {
  return {
    ...revealOutcome,
    hiddenSubmissions: revealOutcome.hiddenSubmissions.map((submission) => ({
      ...submission
    }))
  };
}

function cloneProblemCell(cell: ProblemCellState): ProblemCellState {
  if (!isPendingCell(cell)) {
    return { ...cell };
  }

  return {
    ...cell,
    revealOutcome: cell.revealOutcome ? cloneRevealOutcome(cell.revealOutcome) : undefined
  };
}

function cloneTeam(team: TeamStanding, marked: boolean): TeamStanding {
  return {
    ...team,
    marked,
    problems: team.problems.map((cell) => cloneProblemCell(cell))
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

function isPendingCell(cell: ProblemCellState): cell is PendingProblemCell {
  return cell.kind === "queued" || cell.kind === "frozen-pending";
}
