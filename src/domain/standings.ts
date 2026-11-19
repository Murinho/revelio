import { ProblemCellState, SolvedProblemCell, TeamStanding } from "./types";

export function applyFirstToSolveFlags(teams: TeamStanding[]): TeamStanding[] {
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

export function rankTeams(teams: TeamStanding[]): TeamStanding[] {
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

function isSolvedCell(cell: ProblemCellState): cell is SolvedProblemCell {
  return cell.kind === "solved";
}
