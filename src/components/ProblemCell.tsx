import { ProblemCellState, ProblemMeta } from "../domain/types";
import { SolvedProblemCell } from "./SolvedProblemCell";

interface ProblemCellProps {
  cell: ProblemCellState;
  firstToSolveTwinkleMinute?: number | null;
  problem: ProblemMeta;
}

export function ProblemCell({
  cell,
  firstToSolveTwinkleMinute = null,
  problem
}: ProblemCellProps) {
  if (cell.kind === "untouched") {
    return (
      <div
        className="problem-cell problem-cell--untouched"
        title={`Problem ${cell.problemLabel}: untouched`}
      >
        <span className="problem-cell__main">-</span>
      </div>
    );
  }

  if (cell.kind === "failed") {
    return (
      <div
        className="problem-cell problem-cell--failed"
        title={`Problem ${cell.problemLabel}: failed`}
      >
        <span className="problem-cell__main">X</span>
        <span className="problem-cell__bottom">+{cell.wrongAttempts}</span>
      </div>
    );
  }

  if (cell.kind === "queued" || cell.kind === "frozen-pending") {
    const mainLabel = formatPendingMainLabel(cell.frozenSubmissionCount);
    const bottomLabel = `+${cell.wrongAttempts}`;

    return (
      <div
        className="problem-cell problem-cell--pending"
        title={`Problem ${cell.problemLabel}: ${cell.kind}`}
      >
        <span className="problem-cell__main">{mainLabel}</span>
        <span className="problem-cell__bottom">{bottomLabel}</span>
      </div>
    );
  }

  return (
    <SolvedProblemCell
      cell={cell}
      problem={problem}
      firstToSolveTwinkleMinute={firstToSolveTwinkleMinute}
      bottomLabel={cell.solveTime}
    />
  );
}

function formatPendingMainLabel(frozenSubmissionCount: number): string {
  const previousPendingSubmissions = Math.max(0, frozenSubmissionCount - 1);

  return previousPendingSubmissions > 0
    ? `(${previousPendingSubmissions})`
    : "?";
}
