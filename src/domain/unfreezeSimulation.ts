import {
  ContestSnapshot,
  ProblemCellState,
  SolvedProblemCell,
  TeamStanding
} from "./types";

export interface UnfreezeRevealEvent {
  id: string;
  teamId: string;
  teamName: string;
  organization: string;
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
  const pendingEntries = snapshot.teams.flatMap((team, teamIndex) =>
    team.problems.flatMap((cell, problemIndex) => {
      if (cell.kind !== "queued" && cell.kind !== "frozen-pending") {
        return [];
      }

      const revealSeed =
        teamIndex + problemIndex + cell.wrongAttempts + cell.frozenSubmissionCount;
      const contestMinute = 240 + revealSeed * 3;
      const solved =
        (problemIndex + teamIndex + cell.frozenSubmissionCount) % 4 !== 0;

      return [
        {
          id: `${team.id}-${cell.problemId}`,
          teamId: team.id,
          teamName: team.name,
          organization: team.organization,
          problemId: cell.problemId,
          problemLabel: cell.problemLabel,
          contestMinute,
          result: solved ? ("solved" as const) : ("failed" as const),
          wrongAttempts: cell.wrongAttempts,
          penalty: solved
            ? contestMinute + Math.max(0, cell.wrongAttempts) * 20
            : null
        }
      ];
    })
  );

  return pendingEntries.sort(
    (leftEvent, rightEvent) =>
      leftEvent.contestMinute - rightEvent.contestMinute ||
      leftEvent.problemLabel.localeCompare(rightEvent.problemLabel) ||
      leftEvent.teamName.localeCompare(rightEvent.teamName)
  );
}

export function applyUnfreezeProgress(
  snapshot: ContestSnapshot,
  revealEvents: UnfreezeRevealEvent[],
  revealCount: number
): ContestSnapshot {
  const frozenSnapshot = createFrozenSnapshot(snapshot);
  const nextTeams = frozenSnapshot.teams.map((team) => ({
    ...team,
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

    nextTeams[teamIndex].problems[problemIndex] =
      event.result === "solved"
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
            wrongAttempts: event.wrongAttempts + 1
          };
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
      .filter(
        (
          cell
        ): cell is Extract<ProblemCellState, { kind: "queued" | "frozen-pending" }> =>
          cell.kind === "queued" || cell.kind === "frozen-pending"
      )
      .map((cell) => cell.problemLabel)
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
      rank: currentRank,
      marked: index === 0
    };
  });
}

function isSolvedCell(cell: ProblemCellState): cell is SolvedProblemCell {
  return cell.kind === "solved";
}
