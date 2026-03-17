import {
  ContestSnapshot,
  ProblemCellState,
  ProblemMeta,
  TeamStanding
} from "../domain/types";

function untouched(problem: ProblemMeta): ProblemCellState {
  return {
    kind: "untouched",
    problemId: problem.id,
    problemLabel: problem.label
  };
}

function queued(
  problem: ProblemMeta,
  wrongAttempts: number,
  frozenSubmissionCount: number
): ProblemCellState {
  return {
    kind: "queued",
    problemId: problem.id,
    problemLabel: problem.label,
    wrongAttempts,
    frozenSubmissionCount
  };
}

function frozenPending(
  problem: ProblemMeta,
  wrongAttempts: number,
  frozenSubmissionCount: number
): ProblemCellState {
  return {
    kind: "frozen-pending",
    problemId: problem.id,
    problemLabel: problem.label,
    wrongAttempts,
    frozenSubmissionCount
  };
}

function failed(problem: ProblemMeta, wrongAttempts: number): ProblemCellState {
  return {
    kind: "failed",
    problemId: problem.id,
    problemLabel: problem.label,
    wrongAttempts
  };
}

function solved(
  problem: ProblemMeta,
  wrongAttempts: number,
  penalty: number,
  firstToSolve = false
): ProblemCellState {
  return {
    kind: "solved",
    problemId: problem.id,
    problemLabel: problem.label,
    wrongAttempts,
    penalty,
    firstToSolve
  };
}

const problems: ProblemMeta[] = [
  { id: "A", label: "A", color: "#f5f7fb" },
  { id: "B", label: "B", color: "#ff9326" },
  { id: "C", label: "C", color: "#ff5d4d" },
  { id: "D", label: "D", color: "#ffde3c" },
  { id: "E", label: "E", color: "#a8ff35" },
  { id: "F", label: "F", color: "#34db64" },
  { id: "G", label: "G", color: "#2452ff" },
  { id: "H", label: "H", color: "#34d6ff" },
  { id: "I", label: "I", color: "#f845ff" },
  { id: "J", label: "J", color: "#a51bda" },
  { id: "K", label: "K", color: "#5aff4b" },
  { id: "L", label: "L", color: "#ffd35c" }
];

function buildTeam(
  rank: number,
  name: string,
  organization: string,
  solvedCount: number,
  penalty: number,
  marked: boolean,
  pendingProblemLabels: string[],
  cells: ProblemCellState[],
  movement?: number
): TeamStanding {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    rank,
    name,
    organization,
    solved: solvedCount,
    penalty,
    marked,
    movement,
    pendingProblemLabels,
    problems: cells
  };
}

const teams: TeamStanding[] = [
  buildTeam(1, "Ooga Booga", "UFMG", 8, 786, true, [], [
    solved(problems[0], 0, 82, true),
    solved(problems[1], 1, 36),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 113, true),
    solved(problems[5], 0, 96),
    solved(problems[6], 0, 140),
    untouched(problems[7]),
    solved(problems[8], 1, 150, true),
    solved(problems[9], 0, 79),
    solved(problems[10], 1, 227),
    untouched(problems[11])
  ]),
  buildTeam(2, "Testigos de German", "UP GDL", 6, 461, false, ["I", "K"], [
    solved(problems[0], 0, 128),
    solved(problems[1], 1, 40),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 14),
    solved(problems[5], 0, 99),
    solved(problems[6], 0, 160),
    untouched(problems[7]),
    queued(problems[8], 0, 1),
    solved(problems[9], 0, 20),
    frozenPending(problems[10], 0, 2),
    untouched(problems[11])
  ]),
  buildTeam(3, "Helicoptero", "UNC", 6, 474, false, ["H", "I", "K"], [
    solved(problems[0], 1, 75, true),
    solved(problems[1], 1, 76),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 14),
    solved(problems[5], 1, 106),
    untouched(problems[6]),
    frozenPending(problems[7], 1, 2),
    queued(problems[8], 0, 1),
    solved(problems[9], 0, 24),
    frozenPending(problems[10], 0, 3),
    untouched(problems[11])
  ]),
  buildTeam(4, "E so fazer", "UnB", 6, 580, false, ["K"], [
    solved(problems[0], 1, 172),
    solved(problems[1], 1, 40),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 18),
    solved(problems[5], 0, 76),
    untouched(problems[6]),
    untouched(problems[7]),
    solved(problems[8], 0, 230),
    solved(problems[9], 0, 24),
    frozenPending(problems[10], 0, 3),
    untouched(problems[11])
  ]),
  buildTeam(
    5,
    "Los Tralalelitos dicen FLAMENGOOO",
    "UnB",
    6,
    631,
    false,
    ["K"],
    [
      solved(problems[0], 2, 198),
      solved(problems[1], 1, 43),
      untouched(problems[2]),
      untouched(problems[3]),
      solved(problems[4], 0, 10),
      solved(problems[5], 1, 84),
      untouched(problems[6]),
      untouched(problems[7]),
      solved(problems[8], 0, 218),
      solved(problems[9], 0, 18),
      frozenPending(problems[10], 0, 4),
      untouched(problems[11])
    ],
    2
  ),
  buildTeam(6, "Los Catastróficos", "UBA", 6, 774, false, ["G"], [
    solved(problems[0], 1, 231),
    solved(problems[1], 0, 91),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 14),
    solved(problems[5], 1, 202),
    frozenPending(problems[6], 0, 5),
    untouched(problems[7]),
    solved(problems[8], 0, 154),
    solved(problems[9], 0, 42),
    untouched(problems[10]),
    untouched(problems[11])
  ], 1),
  buildTeam(7, "e sempre o XOR", "UDESC", 5, 397, false, ["A", "H"], [
    frozenPending(problems[0], 2, 3),
    solved(problems[1], 0, 35),
    untouched(problems[2]),
    failed(problems[3], 3),
    solved(problems[4], 0, 16),
    solved(problems[5], 0, 167),
    solved(problems[6], 1, 88),
    frozenPending(problems[7], 0, 4),
    untouched(problems[8]),
    solved(problems[9], 0, 11),
    untouched(problems[10]),
    untouched(problems[11])
  ], 3),
  buildTeam(8, "3f9f", "UFCG", 5, 397, false, ["A", "I"], [
    frozenPending(problems[0], 2, 3),
    solved(problems[1], 0, 22),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 16),
    solved(problems[5], 1, 120),
    solved(problems[6], 1, 173),
    untouched(problems[7]),
    frozenPending(problems[8], 1, 3),
    solved(problems[9], 0, 26),
    untouched(problems[10]),
    untouched(problems[11])
  ]),
  buildTeam(9, "Corman", "UBA", 5, 430, false, ["A", "I"], [
    frozenPending(problems[0], 1, 5),
    solved(problems[1], 0, 48),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 15),
    solved(problems[5], 1, 131),
    untouched(problems[6]),
    untouched(problems[7]),
    queued(problems[8], 0, 1),
    solved(problems[9], 0, 23),
    solved(problems[10], 1, 173),
    untouched(problems[11])
  ]),
  buildTeam(10, "hmmmmmmmmmmm?", "ESCOM IPN", 5, 449, false, ["C"], [
    solved(problems[0], 1, 204),
    solved(problems[1], 0, 60),
    frozenPending(problems[2], 0, 5),
    untouched(problems[3]),
    solved(problems[4], 0, 19),
    solved(problems[5], 0, 101),
    untouched(problems[6]),
    untouched(problems[7]),
    untouched(problems[8]),
    solved(problems[9], 0, 25),
    untouched(problems[10]),
    untouched(problems[11])
  ]),
  buildTeam(11, "para la pda elegimos wf", "UNR", 5, 462, false, ["I"], [
    solved(problems[0], 0, 230),
    solved(problems[1], 0, 80),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 24),
    solved(problems[5], 0, 89),
    untouched(problems[6]),
    untouched(problems[7]),
    frozenPending(problems[8], 0, 2),
    solved(problems[9], 0, 19),
    untouched(problems[10]),
    untouched(problems[11])
  ]),
  buildTeam(12, "las4s e pelados", "UFPE", 5, 482, false, ["L"], [
    solved(problems[0], 1, 233),
    solved(problems[1], 0, 62),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 76, true),
    solved(problems[5], 0, 138),
    untouched(problems[6]),
    untouched(problems[7]),
    untouched(problems[8]),
    solved(problems[9], 0, 23),
    untouched(problems[10]),
    frozenPending(problems[11], 0, 5)
  ]),
  buildTeam(13, "Red-Black Tree", "UNR", 5, 551, false, ["G", "L"], [
    untouched(problems[0]),
    solved(problems[1], 0, 135),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 16),
    solved(problems[5], 0, 155),
    frozenPending(problems[6], 0, 2),
    untouched(problems[7]),
    solved(problems[8], 0, 216),
    solved(problems[9], 0, 29),
    untouched(problems[10]),
    frozenPending(problems[11], 0, 5)
  ]),
  buildTeam(14, "SaleEnOdeUno", "UNI FIIS", 5, 619, false, ["A", "I"], [
    queued(problems[0], 0, 1),
    solved(problems[1], 0, 103),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 1, 36),
    solved(problems[5], 2, 156),
    solved(problems[6], 0, 205),
    untouched(problems[7]),
    frozenPending(problems[8], 0, 2),
    solved(problems[9], 1, 39),
    untouched(problems[10]),
    untouched(problems[11])
  ]),
  buildTeam(15, "Igloo Zone", "UP Bonaterra", 5, 624, false, ["A", "F"], [
    frozenPending(problems[0], 0, 2),
    solved(problems[1], 2, 192),
    untouched(problems[2]),
    untouched(problems[3]),
    solved(problems[4], 0, 16),
    frozenPending(problems[5], 3, 2),
    solved(problems[6], 0, 161),
    untouched(problems[7]),
    solved(problems[8], 0, 204),
    solved(problems[9], 0, 11),
    untouched(problems[10]),
    untouched(problems[11])
  ])
];

export const mockContestSnapshot: ContestSnapshot = {
  contestName: "Revelio",
  regionName: "Latin America Championship",
  phase: "revealing",
  durationLabel: "5:00:00",
  freezeLabel: "Frozen during the final hour",
  problems,
  teams,
  updatedAtLabel: "Updated from mock contest feed",
  recentSubmissions: [
    {
      id: "sub-1",
      contestMinute: 289,
      teamName: "SaleEnOdeUno",
      problemLabel: "A",
      summary: "? +0",
      kind: "queued"
    },
    {
      id: "sub-2",
      contestMinute: 287,
      teamName: "Champan en lata",
      problemLabel: "A",
      summary: "(8) +1",
      kind: "frozen-pending"
    },
    {
      id: "sub-3",
      contestMinute: 286,
      teamName: "Los Catastróficos",
      problemLabel: "G",
      summary: "(5) +0",
      kind: "frozen-pending"
    },
    {
      id: "sub-4",
      contestMinute: 284,
      teamName: "E so fazer",
      problemLabel: "K",
      summary: "(3) +0",
      kind: "frozen-pending"
    },
    {
      id: "sub-5",
      contestMinute: 283,
      teamName: "Red-Black Tree",
      problemLabel: "L",
      summary: "(5) +0",
      kind: "frozen-pending"
    },
    {
      id: "sub-6",
      contestMinute: 281,
      teamName: "Igloo Zone",
      problemLabel: "A",
      summary: "(2) +0",
      kind: "frozen-pending"
    },
    {
      id: "sub-7",
      contestMinute: 280,
      teamName: "Corman",
      problemLabel: "A",
      summary: "(5) +1",
      kind: "frozen-pending"
    },
    {
      id: "sub-8",
      contestMinute: 279,
      teamName: "las4s e pelados",
      problemLabel: "L",
      summary: "(5) +0",
      kind: "frozen-pending"
    }
  ]
};
