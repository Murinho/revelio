import {
  ContestSnapshot,
  HiddenSubmission,
  PendingProblemCell,
  PendingRevealOutcome,
  ProblemCellState,
  SolvedProblemCell,
  TeamStanding
} from "./types";

interface BaseUnfreezeEvent {
  id: string;
  kind: "advance" | "submission";
  teamId: string;
  teamName: string;
  organization?: string;
  contestMinute: number | null;
  nextCurrentTeamId: string | null;
  nextCurrentTeamName: string | null;
}

export interface AdvanceTeamEvent extends BaseUnfreezeEvent {
  kind: "advance";
}

export interface SubmissionRevealEvent extends BaseUnfreezeEvent {
  kind: "submission";
  problemId: string;
  problemLabel: string;
  verdict: "rejected" | "accepted";
  result: "pending" | "solved" | "failed";
  wrongAttempts: number;
  frozenSubmissionCount: number;
  penalty: number | null;
  nextCell: ProblemCellState;
  previousRank: number;
  nextRank: number;
  positionsGained: number;
}

export type UnfreezeRevealEvent = AdvanceTeamEvent | SubmissionRevealEvent;

export interface UnfreezeProgressState {
  snapshot: ContestSnapshot;
  currentTeamId: string | null;
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
  let teams = getRankedFrozenTeams(snapshot);
  let currentTeamId = getLastTeamId(teams);
  const revealEvents: UnfreezeRevealEvent[] = [];

  while (currentTeamId) {
    const currentTeamIndex = teams.findIndex((team) => team.id === currentTeamId);

    if (currentTeamIndex < 0) {
      currentTeamId = getLastTeamId(teams);
      continue;
    }

    const currentTeam = teams[currentTeamIndex];
    const pendingProblemIndex = findNextPendingProblemIndex(currentTeam);

    if (pendingProblemIndex < 0) {
      const nextCurrentTeam = getTeamAbove(teams, currentTeam.id);

      revealEvents.push(
        buildAdvanceEvent(currentTeam, nextCurrentTeam, revealEvents.length + 1)
      );
      currentTeamId = nextCurrentTeam?.id ?? null;
      continue;
    }

    const pendingCell = currentTeam.problems[pendingProblemIndex];

    if (!isPendingCell(pendingCell)) {
      currentTeamId = getTeamAbove(teams, currentTeam.id)?.id ?? null;
      continue;
    }

    const teamAboveBeforeReveal = getTeamAbove(teams, currentTeam.id);
    const revealEvent = buildRevealEventFromPendingCell(
      currentTeam,
      pendingCell,
      currentTeamIndex,
      pendingProblemIndex,
      revealEvents.length + 1
    );

    teams[currentTeamIndex].problems[pendingProblemIndex] = cloneProblemCell(revealEvent.nextCell);
    teams = rankTeams(applyFirstToSolveFlags(teams));

    const updatedTeamIndex = teams.findIndex((team) => team.id === currentTeam.id);
    const updatedTeam = updatedTeamIndex >= 0 ? teams[updatedTeamIndex] : null;

    if (!updatedTeam) {
      break;
    }

    const positionsGained = Math.max(0, currentTeamIndex - updatedTeamIndex);
    const climbed = revealEvent.verdict === "accepted" && positionsGained > 0;
    const nextCurrentTeam =
      climbed
        ? (teamAboveBeforeReveal ? findTeamById(teams, teamAboveBeforeReveal.id) : updatedTeam)
        : updatedTeam;

    revealEvents.push({
      ...revealEvent,
      previousRank: currentTeam.rank,
      nextRank: updatedTeam.rank,
      positionsGained,
      nextCurrentTeamId: nextCurrentTeam?.id ?? null,
      nextCurrentTeamName: nextCurrentTeam?.name ?? null
    });

    currentTeamId = nextCurrentTeam?.id ?? null;
  }

  return revealEvents;
}

export function applyUnfreezeProgress(
  snapshot: ContestSnapshot,
  revealEvents: UnfreezeRevealEvent[],
  revealCount: number
): UnfreezeProgressState {
  const frozenSnapshot = createFrozenSnapshot(snapshot);
  let teams = getRankedFrozenTeams(frozenSnapshot);
  let currentTeamId = getLastTeamId(teams);

  revealEvents.slice(0, revealCount).forEach((event) => {
    if (event.kind === "submission") {
      const teamIndex = teams.findIndex((team) => team.id === event.teamId);

      if (teamIndex >= 0) {
        const problemIndex = teams[teamIndex].problems.findIndex(
          (cell) => cell.problemId === event.problemId
        );

        if (problemIndex >= 0) {
          teams[teamIndex].problems[problemIndex] = cloneProblemCell(event.nextCell);
          teams = rankTeams(applyFirstToSolveFlags(teams));
        }
      }
    }

    currentTeamId = event.nextCurrentTeamId;
  });

  const revealedCount = Math.min(revealCount, revealEvents.length);
  const pendingCount = revealEvents.length - revealedCount;

  return {
    currentTeamId,
    snapshot: {
      ...frozenSnapshot,
      phase: pendingCount === 0 ? "complete" : "revealing",
      teams,
      updatedAtLabel:
        pendingCount === 0
          ? "All unfreeze steps have been completed"
          : `${revealedCount} step${revealedCount === 1 ? "" : "s"} completed`
    }
  };
}

export function countRevealedSolves(revealEvents: UnfreezeRevealEvent[]): number {
  return revealEvents.filter(
    (event): event is SubmissionRevealEvent =>
      event.kind === "submission" && event.result === "solved"
  ).length;
}

function buildAdvanceEvent(
  team: TeamStanding,
  nextCurrentTeam: TeamStanding | null,
  eventNumber: number
): AdvanceTeamEvent {
  return {
    id: `step-${eventNumber}-${team.id}-advance`,
    kind: "advance",
    teamId: team.id,
    teamName: team.name,
    organization: team.organization,
    contestMinute: null,
    nextCurrentTeamId: nextCurrentTeam?.id ?? null,
    nextCurrentTeamName: nextCurrentTeam?.name ?? null
  };
}

function buildRevealEventFromPendingCell(
  team: TeamStanding,
  cell: PendingProblemCell,
  teamIndex: number,
  problemIndex: number,
  eventNumber: number
): Omit<
  SubmissionRevealEvent,
  "nextCurrentTeamId" | "nextCurrentTeamName" | "previousRank" | "nextRank" | "positionsGained"
> {
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
    revealOutcome.solveTime ??
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
    id: `step-${eventNumber}-${team.id}-${cell.problemId}-${hiddenSubmission.id}`,
    kind: "submission",
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
    const solveTime = revealOutcome.solveTime ?? contestMinute;

    return {
      kind: "solved",
      problemId: cell.problemId,
      problemLabel: cell.problemLabel,
      wrongAttempts,
      solveTime,
      penalty:
        revealOutcome.penalty ?? solveTime + Math.max(0, wrongAttempts) * 20,
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
  const solveTime = solveSubmission?.contestMinute ?? null;

  return {
    result: solved ? "solved" : "failed",
    hiddenWrongAttempts,
    finalWrongAttempts,
    solveTime,
    penalty:
      solved && solveTime !== null
        ? solveTime + finalWrongAttempts * 20
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

function cloneTeam(team: TeamStanding): TeamStanding {
  return {
    ...team,
    marked: false,
    problems: team.problems.map((cell) => cloneProblemCell(cell))
  };
}

function getRankedFrozenTeams(snapshot: ContestSnapshot): TeamStanding[] {
  return rankTeams(
    applyFirstToSolveFlags(createFrozenSnapshot(snapshot).teams.map((team) => cloneTeam(team)))
  );
}

function getLastTeamId(teams: TeamStanding[]): string | null {
  return teams.length > 0 ? teams[teams.length - 1].id : null;
}

function getTeamAbove(teams: TeamStanding[], teamId: string): TeamStanding | null {
  const teamIndex = teams.findIndex((team) => team.id === teamId);

  if (teamIndex <= 0) {
    return null;
  }

  return teams[teamIndex - 1] ?? null;
}

function findTeamById(teams: TeamStanding[], teamId: string): TeamStanding | null {
  return teams.find((team) => team.id === teamId) ?? null;
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
          leftEntry.cell.solveTime - rightEntry.cell.solveTime ||
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
      leftTeam.penalty - rightTeam.penalty
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
