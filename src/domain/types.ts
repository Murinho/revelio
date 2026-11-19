export type ContestPhase = "frozen" | "revealing" | "complete";

export type ProblemCellState =
  | UntouchedProblemCell
  | QueuedProblemCell
  | FrozenPendingProblemCell
  | FailedProblemCell
  | SolvedProblemCell;

export interface ContestSnapshot {
  contestName: string;
  regionName: string;
  phase: ContestPhase;
  durationLabel: string;
  freezeLabel: string;
  problems: ProblemMeta[];
  teams: TeamStanding[];
  recentSubmissions: RecentSubmission[];
  updatedAtLabel: string;
}

export interface ProblemMeta {
  id: string;
  label: string;
  color: string;
}

export interface TeamStanding {
  id: string;
  rank: number;
  name: string;
  organization?: string;
  members?: string[];
  solved: number;
  penalty: number;
  marked: boolean;
  movement?: number;
  pendingProblemLabels: string[];
  problems: ProblemCellState[];
}

export interface RecentSubmission {
  id: string;
  teamId?: string;
  contestMinute: number;
  teamName: string;
  problemLabel: string;
  summary: string;
  kind: "queued" | "frozen-pending";
  status?: "pending" | "accepted" | "rejected" | "compilation-error";
}

export interface PendingRevealOutcome {
  result: "solved" | "failed";
  hiddenWrongAttempts: number;
  finalWrongAttempts: number;
  solveTime: number | null;
  penalty: number | null;
  lastHiddenContestMinute: number | null;
  hiddenSubmissions: HiddenSubmission[];
}

export interface HiddenSubmission {
  id: string;
  contestMinute: number | null;
  // Preserve exact ordering through frozen snapshots and submission reveals.
  relativeTimeSeconds?: number;
  submissionId?: number;
  result: "rejected" | "accepted" | "compilation-error";
}

interface BaseProblemCell {
  kind: string;
  problemId: string;
  problemLabel: string;
}

export interface UntouchedProblemCell extends BaseProblemCell {
  kind: "untouched";
}

export interface QueuedProblemCell extends BaseProblemCell {
  kind: "queued";
  wrongAttempts: number;
  frozenSubmissionCount: number;
  pendingContestMinute?: number;
  revealOutcome?: PendingRevealOutcome;
}

export interface FrozenPendingProblemCell extends BaseProblemCell {
  kind: "frozen-pending";
  wrongAttempts: number;
  frozenSubmissionCount: number;
  pendingContestMinute?: number;
  revealOutcome?: PendingRevealOutcome;
}

export type PendingProblemCell = QueuedProblemCell | FrozenPendingProblemCell;

export interface FailedProblemCell extends BaseProblemCell {
  kind: "failed";
  wrongAttempts: number;
}

export interface SolvedProblemCell extends BaseProblemCell {
  kind: "solved";
  wrongAttempts: number;
  solveTime: number;
  solveTimeSeconds?: number;
  solveSubmissionId?: number;
  penalty: number;
  firstToSolve: boolean;
}
