import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { ProblemMeta, SolvedProblemCell as SolvedCell } from "../domain/types";

const TWINKLE_CLASS = "problem-cell--first-to-solve-twinkle";

interface SolvedProblemCellProps {
  cell: SolvedCell;
  problem: ProblemMeta;
  firstToSolveTwinkleMinute?: number | null;
  bottomLabel: number;
  verdictLabel?: string;
}

export function SolvedProblemCell({
  cell,
  problem,
  firstToSolveTwinkleMinute = null,
  bottomLabel,
  verdictLabel = "solved"
}: SolvedProblemCellProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const wasFirstToSolveRef = useRef(false);
  const previousMinuteRef = useRef(firstToSolveTwinkleMinute);

  useLayoutEffect(() => {
    const element = elementRef.current;
    const revealed = cell.firstToSolve && !wasFirstToSolveRef.current;
    const minuteChanged = firstToSolveTwinkleMinute !== null &&
      firstToSolveTwinkleMinute !== previousMinuteRef.current;
    wasFirstToSolveRef.current = cell.firstToSolve;
    previousMinuteRef.current = firstToSolveTwinkleMinute;

    if (!element) return;
    if (!cell.firstToSolve) {
      element.classList.remove(TWINKLE_CLASS);
      return;
    }
    if (!revealed && !minuteChanged) return;

    // Restart even if the verdict arrived just before the minute boundary.
    // Keep the cell mounted so queue and scoreboard row motion is uninterrupted.
    element.classList.remove(TWINKLE_CLASS);
    void element.offsetWidth;
    element.classList.add(TWINKLE_CLASS);
  }, [cell.firstToSolve, firstToSolveTwinkleMinute]);

  return (
    <div
      ref={elementRef}
      className={`problem-cell problem-cell--solved ${
        cell.firstToSolve ? "problem-cell--first-to-solve" : ""
      }`.trim()}
      title={`Problem ${cell.problemLabel}: ${verdictLabel}`}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget &&
            event.animationName === "first-to-solve-cell-background-twinkle") {
          event.currentTarget.classList.remove(TWINKLE_CLASS);
        }
      }}
    >
      <div
        className={`balloon ${cell.firstToSolve ? "balloon--star" : "balloon--round"}`}
        style={{ "--balloon-color": problem.color } as CSSProperties}
      />
      <span className="balloon__text balloon__text--overlay">
        +{cell.wrongAttempts > 0 ? cell.wrongAttempts : ""}
      </span>
      <span className="problem-cell__bottom problem-cell__bottom--overlay">
        {bottomLabel}
      </span>
    </div>
  );
}
