import { DEFAULT_BALLOON_COLORS } from "../domain/contestConfiguration";
import {
  ContestSnapshot,
  ProblemCellState,
  ProblemMeta,
  RecentSubmission,
  SolvedProblemCell,
  TeamStanding
} from "../domain/types";

interface TeamBlueprint {
  name: string;
  organization: string;
  movement?: number;
}

type CellRecipe =
  | { kind: "untouched" }
  | { kind: "failed"; wrongAttempts: number }
  | {
      kind: "queued" | "frozen-pending";
      wrongAttempts: number;
      frozenSubmissionCount: number;
    }
  | { kind: "solved"; wrongAttempts: number; solveTime: number };

const TEAM_BLUEPRINTS: TeamBlueprint[] = [
  { name: "Ooga Booga", organization: "UFMG", movement: 1 },
  { name: "Testigos de German", organization: "UP GDL", movement: 2 },
  { name: "Helicoptero", organization: "UNC", movement: 1 },
  { name: "E so fazer", organization: "UnB" },
  { name: "Los Tralalelitos dicen FLAMENGOOO", organization: "UnB", movement: -1 },
  { name: "Los Catastroficos", organization: "UBA", movement: 1 },
  { name: "e sempre o XOR", organization: "UDESC", movement: -2 },
  { name: "3f9f", organization: "UFCG" },
  { name: "Corman", organization: "UBA", movement: -1 },
  { name: "hmmmmmmmmmmm?", organization: "ESCOM IPN" },
  { name: "para la pda elegimos wf", organization: "UNR", movement: 1 },
  { name: "las4s e pelados", organization: "UFPE" }
];

const problems: ProblemMeta[] = Array.from({ length: 26 }, (_, index) =>
  createProblem(index)
);

const cellRecipes: CellRecipe[][] = TEAM_BLUEPRINTS.map(() =>
  problems.map(() => createUntouchedRecipe())
);

for (let problemIndex = 0; problemIndex < problems.length; problemIndex += 1) {
  const topGroupIndex = problemIndex % 4;
  const firstSolverTeamIndex = topGroupIndex;
  const extraTopSolverTeamIndex = (topGroupIndex + 1) % 4;
  const middleSolverTeamIndex = 4 + topGroupIndex;
  const middlePendingTeamIndex = 4 + ((topGroupIndex + 2) % 4);
  const middleFailedTeamIndex = 4 + ((topGroupIndex + 1) % 4);
  const lowerSolverTeamIndex = 8 + topGroupIndex;
  const lowerPendingTeamIndex = 8 + ((topGroupIndex + 1) % 4);
  const lowerFailedTeamIndex = 8 + ((topGroupIndex + 3) % 4);
  const firstSolveTime = 18 + problemIndex * 7 + (problemIndex % 3) * 2;

  setCellRecipe(
    firstSolverTeamIndex,
    problemIndex,
    createSolvedRecipe(problemIndex % 3, firstSolveTime)
  );
  setCellRecipe(
    middleSolverTeamIndex,
    problemIndex,
    createSolvedRecipe(
      1 + ((problemIndex + 1) % 3),
      firstSolveTime + 34 + (problemIndex % 5) * 5
    )
  );
  setCellRecipe(
    lowerSolverTeamIndex,
    problemIndex,
    createSolvedRecipe(
      1 + (problemIndex % 2),
      firstSolveTime + 76 + (problemIndex % 4) * 8
    )
  );

  if (problemIndex % 2 === 1) {
    setCellRecipe(
      extraTopSolverTeamIndex,
      problemIndex,
      createSolvedRecipe(
        1 + ((problemIndex + 2) % 3),
        firstSolveTime + 19 + (problemIndex % 4) * 4
      )
    );
  }

  setCellRecipe(
    middlePendingTeamIndex,
    problemIndex,
    problemIndex % 2 === 0
      ? createQueuedRecipe(problemIndex % 3, 1 + (problemIndex % 3))
      : createFrozenPendingRecipe(1 + (problemIndex % 2), 2 + (problemIndex % 3))
  );
  setCellRecipe(
    lowerPendingTeamIndex,
    problemIndex,
    problemIndex % 2 === 0
      ? createFrozenPendingRecipe(problemIndex % 2, 2 + (problemIndex % 4))
      : createQueuedRecipe(1 + (problemIndex % 3), 1 + (problemIndex % 2))
  );
  setCellRecipe(
    lowerFailedTeamIndex,
    problemIndex,
    createFailedRecipe(1 + (problemIndex % 4))
  );

  if (problemIndex % 3 === 0) {
    setCellRecipe(
      middleFailedTeamIndex,
      problemIndex,
      createFailedRecipe(2 + (problemIndex % 3))
    );
  }
}

const teams = rankTeams(
  applyFirstToSolveFlags(
    TEAM_BLUEPRINTS.map((team, teamIndex) =>
      buildTeam(team, teamIndex, cellRecipes[teamIndex])
    )
  )
);
const recentSubmissions = buildRecentSubmissions(teams);

validateMockStandings(teams, problems);

export const mockContestSnapshot: ContestSnapshot = {
  contestName: "Revelio",
  regionName: "Latin America Championship",
  phase: "revealing",
  durationLabel: "5:00:00",
  freezeLabel: "Frozen during the final hour",
  problems,
  teams,
  updatedAtLabel: "Updated from the full A-Z mock contest feed",
  recentSubmissions
};

function createProblem(index: number): ProblemMeta {
  const label = getProblemLabel(index);

  return {
    id: label,
    label,
    color: DEFAULT_BALLOON_COLORS[index % DEFAULT_BALLOON_COLORS.length]
  };
}

function getProblemLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function createUntouchedRecipe(): CellRecipe {
  return { kind: "untouched" };
}

function createFailedRecipe(wrongAttempts: number): CellRecipe {
  return {
    kind: "failed",
    wrongAttempts
  };
}

function createQueuedRecipe(
  wrongAttempts: number,
  frozenSubmissionCount: number
): CellRecipe {
  return {
    kind: "queued",
    wrongAttempts,
    frozenSubmissionCount
  };
}

function createFrozenPendingRecipe(
  wrongAttempts: number,
  frozenSubmissionCount: number
): CellRecipe {
  return {
    kind: "frozen-pending",
    wrongAttempts,
    frozenSubmissionCount
  };
}

function createSolvedRecipe(wrongAttempts: number, solveTime: number): CellRecipe {
  return {
    kind: "solved",
    wrongAttempts,
    solveTime
  };
}

function setCellRecipe(
  teamIndex: number,
  problemIndex: number,
  recipe: CellRecipe
) {
  cellRecipes[teamIndex][problemIndex] = recipe;
}

function buildTeam(
  team: TeamBlueprint,
  teamIndex: number,
  recipes: CellRecipe[]
): TeamStanding {
  const problemCells = recipes.map((recipe, problemIndex) =>
    buildProblemCell(problems[problemIndex], recipe)
  );

  return {
    id: buildTeamId(team.name),
    rank: 0,
    name: team.name,
    organization: team.organization,
    solved: countSolvedProblems(problemCells),
    penalty: calculateTeamPenalty(problemCells),
    marked: teamIndex === 0,
    movement: team.movement,
    pendingProblemLabels: collectPendingProblemLabels(problemCells),
    problems: problemCells
  };
}

function buildProblemCell(problem: ProblemMeta, recipe: CellRecipe): ProblemCellState {
  switch (recipe.kind) {
    case "untouched":
      return {
        kind: "untouched",
        problemId: problem.id,
        problemLabel: problem.label
      };
    case "failed":
      return {
        kind: "failed",
        problemId: problem.id,
        problemLabel: problem.label,
        wrongAttempts: recipe.wrongAttempts
      };
    case "queued":
    case "frozen-pending":
      return {
        kind: recipe.kind,
        problemId: problem.id,
        problemLabel: problem.label,
        wrongAttempts: recipe.wrongAttempts,
        frozenSubmissionCount: recipe.frozenSubmissionCount
      };
    case "solved":
      return {
        kind: "solved",
        problemId: problem.id,
        problemLabel: problem.label,
        wrongAttempts: recipe.wrongAttempts,
        solveTime: recipe.solveTime,
        penalty: recipe.solveTime + recipe.wrongAttempts * 20,
        firstToSolve: false
      };
  }
}

function applyFirstToSolveFlags(teams: TeamStanding[]): TeamStanding[] {
  const nextTeams = teams.map((team) => ({
    ...team,
    problems: [...team.problems]
  }));

  for (let problemIndex = 0; problemIndex < problems.length; problemIndex += 1) {
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
        (left, right) =>
          left.cell.solveTime - right.cell.solveTime || left.teamIndex - right.teamIndex
      );

    if (solvedCells.length === 0) {
      throw new Error(
        `The mock contest must include at least one solve for problem ${problems[problemIndex].label}.`
      );
    }

    const firstToSolveTeamIndex = solvedCells[0].teamIndex;

    solvedCells.forEach(({ teamIndex, cell }) => {
      nextTeams[teamIndex].problems[problemIndex] = {
        ...cell,
        firstToSolve: teamIndex === firstToSolveTeamIndex
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
    (left, right) =>
      right.solved - left.solved ||
      left.penalty - right.penalty ||
      left.name.localeCompare(right.name)
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

function buildRecentSubmissions(teams: TeamStanding[]): RecentSubmission[] {
  const pendingEntries = teams.flatMap((team) =>
    team.problems.flatMap((cell) => {
      if (!isPendingCell(cell)) {
        return [];
      }

      return [
        {
          teamName: team.name,
          problemLabel: cell.problemLabel,
          summary: formatPendingSummary(cell),
          kind: cell.kind
        }
      ];
    })
  );

  return pendingEntries.slice(0, 20).map((entry, index) => ({
    id: `sub-${index + 1}`,
    contestMinute: 299 - index * 3,
    teamName: entry.teamName,
    problemLabel: entry.problemLabel,
    summary: entry.summary,
    kind: entry.kind
  }));
}

function formatPendingSummary(
  cell: Extract<ProblemCellState, { kind: "queued" | "frozen-pending" }>
): string {
  const previousPendingSubmissions = Math.max(0, cell.frozenSubmissionCount - 1);
  const mainLabel =
    previousPendingSubmissions > 0 ? `(${previousPendingSubmissions})` : "?";

  return `${mainLabel} +${cell.wrongAttempts}`;
}

function validateMockStandings(teams: TeamStanding[], problems: ProblemMeta[]) {
  let hasPending = false;
  let hasFailed = false;
  let hasUntouched = false;

  problems.forEach((problem, problemIndex) => {
    const solvedCells = teams
      .map((team) => team.problems[problemIndex])
      .filter(isSolvedCell);

    if (solvedCells.length < 2) {
      throw new Error(
        `Problem ${problem.label} needs at least two solves so both star and round balloons appear in the preview.`
      );
    }

    const firstToSolveCells = solvedCells.filter((cell) => cell.firstToSolve);

    if (firstToSolveCells.length !== 1) {
      throw new Error(
        `Problem ${problem.label} must have exactly one first-to-solve balloon.`
      );
    }

    const earliestSolveTime = Math.min(...solvedCells.map((cell) => cell.solveTime));

    if (firstToSolveCells[0].solveTime !== earliestSolveTime) {
      throw new Error(
        `Problem ${problem.label} has an invalid first-to-solve assignment.`
      );
    }
  });

  teams.forEach((team) => {
    team.problems.forEach((cell) => {
      if (isPendingCell(cell)) {
        hasPending = true;
      }

      if (cell.kind === "failed") {
        hasFailed = true;
      }

      if (cell.kind === "untouched") {
        hasUntouched = true;
      }
    });
  });

  if (!hasPending || !hasFailed || !hasUntouched) {
    throw new Error(
      "The mock contest must include pending, failed, and untouched submissions."
    );
  }
}

function countSolvedProblems(problemCells: ProblemCellState[]): number {
  return problemCells.filter(isSolvedCell).length;
}

function calculateTeamPenalty(problemCells: ProblemCellState[]): number {
  return problemCells.reduce(
    (totalPenalty, cell) =>
      totalPenalty + (isSolvedCell(cell) ? cell.penalty : 0),
    0
  );
}

function collectPendingProblemLabels(problemCells: ProblemCellState[]): string[] {
  return problemCells
    .filter(isPendingCell)
    .map((cell) => cell.problemLabel);
}

function buildTeamId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function isSolvedCell(cell: ProblemCellState): cell is SolvedProblemCell {
  return cell.kind === "solved";
}

function isPendingCell(
  cell: ProblemCellState
): cell is Extract<ProblemCellState, { kind: "queued" | "frozen-pending" }> {
  return cell.kind === "queued" || cell.kind === "frozen-pending";
}
