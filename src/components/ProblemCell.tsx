import type { CSSProperties } from "react";
import { ProblemCellState, ProblemMeta } from "../domain/types";

interface ProblemCellProps {
  cell: ProblemCellState;
  problem: ProblemMeta;
}

export function ProblemCell({ cell, problem }: ProblemCellProps) {
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
    const mainLabel =
      cell.frozenSubmissionCount > 1 ? `(${cell.frozenSubmissionCount})` : "?";

    return (
      <div
        className="problem-cell problem-cell--pending"
        title={`Problem ${cell.problemLabel}: ${cell.kind}`}
      >
        <span className="problem-cell__main">{mainLabel}</span>
        <span className="problem-cell__bottom">+{cell.wrongAttempts}</span>
      </div>
    );
  }

  return (
    <div
      className="problem-cell problem-cell--solved"
      title={`Problem ${cell.problemLabel}: solved`}
    >
      <div
        className={`balloon ${cell.firstToSolve ? "balloon--star" : "balloon--round"}`}
        style={{ "--balloon-color": problem.color } as CSSProperties}
      />
      <span className="balloon__text balloon__text--overlay">
        +{cell.wrongAttempts > 0 ? cell.wrongAttempts : ""}
      </span>
      <span className="problem-cell__bottom problem-cell__bottom--overlay">
        {cell.solveTime}
      </span>
    </div>
  );
}
