import { useEffect, useLayoutEffect, useRef } from "react";
import { ProblemMeta, TeamStanding } from "../domain/types";
import { formatPenalty, truncateTeamLabel } from "../utils/format";
import { ProblemCell } from "./ProblemCell";

interface ScoreboardTableProps {
  problems: ProblemMeta[];
  teams: TeamStanding[];
  highlightedTeamId?: string | null;
  autoFollowHighlightedTeam?: boolean;
  lockUserScroll?: boolean;
  fillViewport?: boolean;
  visibleTeamsAboveHighlighted?: number;
  highlightedTeamViewportAnchor?: number;
  firstToSolveTwinkleMinute?: number | null;
}

const ROW_REORDER_DURATION_MS = 1500;
const ROW_REORDER_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";
const ROW_REORDER_EASING_POINTS: CubicBezierPoints = [0.65, 0, 0.35, 1];
const TEAM_CENTER_DURATION_MS = 950;
const TEAM_CENTER_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const TEAM_CENTER_EASING_POINTS: CubicBezierPoints = [0.22, 1, 0.36, 1];

export function ScoreboardTable({
  problems,
  teams,
  highlightedTeamId = null,
  autoFollowHighlightedTeam = false,
  lockUserScroll = false,
  fillViewport = false,
  visibleTeamsAboveHighlighted = 0,
  highlightedTeamViewportAnchor,
  firstToSolveTwinkleMinute = null
}: ScoreboardTableProps) {
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const tableElementRef = useRef<HTMLTableElement>(null);
  const rowElementsRef = useRef(new Map<string, HTMLTableRowElement>());
  const previousRowTopsRef = useRef(new Map<string, number>());
  const previousHighlightedTeamIdRef = useRef<string | null>(highlightedTeamId);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const settleCenterFrameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const scrollElement = scrollElementRef.current;
    const tableElement = tableElementRef.current;
    const nextRowTops = new Map<string, number>();
    let hasTableReorder = false;

    teams.forEach((team) => {
      const rowElement = rowElementsRef.current.get(team.id);

      if (!rowElement) {
        return;
      }

      const nextTop = getRowTopWithinScrollViewport(rowElement, tableElement);
      nextRowTops.set(team.id, nextTop);

      const previousTop = previousRowTopsRef.current.get(team.id);

      if (previousTop === undefined) {
        return;
      }

      const deltaY = previousTop - nextTop;

      if (Math.abs(deltaY) < 1) {
        return;
      }

      hasTableReorder = true;
      rowElement.getAnimations().forEach((animation) => animation.cancel());
      // Keep rising rows above the rows they pass for the entire animation.
      const zIndex = deltaY > 0 ? 1 : 0;
      rowElement.animate(
        [
          {
            transform: `translateY(${deltaY}px)`,
            zIndex
          },
          {
            transform: "translateY(0)",
            zIndex
          }
        ],
        {
          duration: ROW_REORDER_DURATION_MS,
          easing: ROW_REORDER_EASING
        }
      );
    });

    if (autoFollowHighlightedTeam && highlightedTeamId && scrollElement && tableElement) {
      const highlightedRowElement = rowElementsRef.current.get(highlightedTeamId);

      if (highlightedRowElement) {
        const centeredScrollTop = getCenteredRowScrollTop(
          scrollElement,
          highlightedRowElement,
          tableElement,
          visibleTeamsAboveHighlighted,
          highlightedTeamViewportAnchor
        );
        const scrollDistance = centeredScrollTop - scrollElement.scrollTop;
        const previousHighlightedTeamId = previousHighlightedTeamIdRef.current;

        if (Math.abs(scrollDistance) >= 1) {
          stopScrollAnimation(scrollAnimationFrameRef);

          if (
            previousRowTopsRef.current.size === 0 ||
            previousHighlightedTeamId === null
          ) {
            scrollElement.scrollTop = centeredScrollTop;
            scheduleImmediateRecenter(
              scrollElement,
              highlightedRowElement,
              tableElement,
              visibleTeamsAboveHighlighted,
              highlightedTeamViewportAnchor,
              settleCenterFrameRef
            );
          } else {
            animateScrollTop(
              scrollElement,
              centeredScrollTop,
              hasTableReorder ? ROW_REORDER_DURATION_MS : TEAM_CENTER_DURATION_MS,
              hasTableReorder ? ROW_REORDER_EASING_POINTS : TEAM_CENTER_EASING_POINTS,
              scrollAnimationFrameRef
            );
          }
        }
      }
    }

    previousRowTopsRef.current = nextRowTops;
    previousHighlightedTeamIdRef.current = highlightedTeamId;
  }, [
    autoFollowHighlightedTeam,
    highlightedTeamId,
    highlightedTeamViewportAnchor,
    teams,
    visibleTeamsAboveHighlighted
  ]);

  useEffect(() => {
    if (!lockUserScroll) {
      return;
    }

    const scrollElement = scrollElementRef.current;

    if (!scrollElement) {
      return;
    }

    function preventUserScroll(event: WheelEvent | TouchEvent) {
      event.preventDefault();
    }

    scrollElement.addEventListener("wheel", preventUserScroll, {
      passive: false
    });
    scrollElement.addEventListener("touchmove", preventUserScroll, {
      passive: false
    });

    return () => {
      scrollElement.removeEventListener("wheel", preventUserScroll);
      scrollElement.removeEventListener("touchmove", preventUserScroll);
    };
  }, [lockUserScroll]);

  useEffect(() => {
    return () => {
      stopScrollAnimation(scrollAnimationFrameRef);
      stopAnimationFrame(settleCenterFrameRef);
    };
  }, []);

  useEffect(() => {
    if (!autoFollowHighlightedTeam || !highlightedTeamId) {
      return;
    }

    const activeHighlightedTeamId = highlightedTeamId;

    function handleResize() {
      const scrollElement = scrollElementRef.current;
      const tableElement = tableElementRef.current;
      const highlightedRowElement = rowElementsRef.current.get(activeHighlightedTeamId);

      if (!scrollElement || !tableElement || !highlightedRowElement) {
        return;
      }

      stopScrollAnimation(scrollAnimationFrameRef);
      scrollElement.scrollTop = getCenteredRowScrollTop(
        scrollElement,
        highlightedRowElement,
        tableElement,
        visibleTeamsAboveHighlighted,
        highlightedTeamViewportAnchor
      );
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [
    autoFollowHighlightedTeam,
    highlightedTeamId,
    highlightedTeamViewportAnchor,
    visibleTeamsAboveHighlighted
  ]);

  function getRankCellClass(rank: number) {
    if (rank === 1) {
      return "scoreboard-table__cell--rank-first";
    }

    if (rank === 2) {
      return "scoreboard-table__cell--rank-second";
    }

    if (rank === 3) {
      return "scoreboard-table__cell--rank-third";
    }

    return "";
  }

  function getTeamPrimaryLabel(team: TeamStanding) {
    return team.organization ? `[${team.organization}] ${team.name}` : team.name;
  }

  function getTeamMetaLabel(team: TeamStanding) {
    if (team.members && team.members.length > 0) {
      return team.members.join(" / ");
    }

    return null;
  }

  return (
    <div
      className={`scoreboard-shell ${fillViewport ? "scoreboard-shell--fill" : ""}`.trim()}
    >
      <div
        className={`scoreboard-scroll ${
          fillViewport ? "scoreboard-scroll--fill" : ""
        } ${lockUserScroll ? "scoreboard-scroll--locked" : ""}`.trim()}
        ref={scrollElementRef}
      >
        <table className="scoreboard-table" ref={tableElementRef}>
          <thead>
            <tr>
              <th className="scoreboard-table__head scoreboard-table__head--rank">#</th>
              <th className="scoreboard-table__head scoreboard-table__head--team">Team</th>
              <th className="scoreboard-table__head scoreboard-table__head--score">Score</th>
              {problems.map((problem) => (
                <th
                  className="scoreboard-table__head scoreboard-table__head--problem"
                  key={problem.id}
                >
                  {problem.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr
                key={team.id}
                className={`scoreboard-table__row ${
                  team.id === highlightedTeamId ? "scoreboard-table__row--active" : ""
                }`.trim()}
                ref={(rowElement) => {
                  if (rowElement) {
                    rowElementsRef.current.set(team.id, rowElement);
                    return;
                  }

                  rowElementsRef.current.delete(team.id);
                }}
              >
                <td
                  className={`scoreboard-table__cell scoreboard-table__cell--rank ${getRankCellClass(
                    team.rank
                  )}`.trim()}
                >
                  <span className="rank-value">{team.rank}</span>
                </td>
                <td className="scoreboard-table__cell scoreboard-table__cell--team">
                  <div className="team-cell">
                    <strong className="team-cell__name" title={getTeamPrimaryLabel(team)}>
                      {truncateTeamLabel(getTeamPrimaryLabel(team))}
                    </strong>
                    {getTeamMetaLabel(team) ? (
                      <span className="team-cell__meta">{getTeamMetaLabel(team)}</span>
                    ) : null}
                  </div>
                </td>
                <td className="scoreboard-table__cell scoreboard-table__cell--score">
                  <div className="score-cell">
                    <strong className="score-cell__solved">{team.solved}</strong>
                    <span className="score-cell__penalty">{formatPenalty(team.penalty)}</span>
                  </div>
                </td>
                {team.problems.map((cell, index) => (
                  <td
                    className="scoreboard-table__cell scoreboard-table__cell--problem"
                    key={`${team.id}-${cell.problemId}`}
                  >
                    <ProblemCell
                      cell={cell}
                      firstToSolveTwinkleMinute={firstToSolveTwinkleMinute}
                      problem={problems[index]}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CubicBezierPoints = [
  x1: number,
  y1: number,
  x2: number,
  y2: number
];

function getRowTopWithinScrollViewport(
  rowElement: HTMLTableRowElement,
  tableElement: HTMLTableElement | null
): number {
  return rowElement.offsetTop + (tableElement?.offsetTop ?? 0);
}

function getCenteredRowScrollTop(
  scrollElement: HTMLDivElement,
  rowElement: HTMLTableRowElement,
  tableElement: HTMLTableElement | null,
  visibleTeamsAboveHighlighted: number,
  viewportAnchor?: number
): number {
  const rowTop = getRowTopWithinScrollViewport(rowElement, tableElement);
  const rowHeight = rowElement.getBoundingClientRect().height;
  const rowSpacing = getRowSpacing(rowElement);
  const stickyHeaderHeight = getStickyHeaderHeight(tableElement);
  const desiredTopByVisibleRows =
    stickyHeaderHeight + Math.max(0, visibleTeamsAboveHighlighted) * rowSpacing;
  const desiredTopByViewport =
    viewportAnchor === undefined
      ? desiredTopByVisibleRows
      : stickyHeaderHeight +
        Math.max(0, scrollElement.clientHeight - stickyHeaderHeight - rowHeight) *
          clamp(viewportAnchor, 0, 1);
  const desiredRowTop = clamp(
    Math.max(desiredTopByVisibleRows, desiredTopByViewport),
    stickyHeaderHeight,
    Math.max(stickyHeaderHeight, scrollElement.clientHeight - rowHeight)
  );
  const targetScrollTop =
    rowTop - desiredRowTop;

  return clamp(
    targetScrollTop,
    0,
    Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight)
  );
}

function animateScrollTop(
  scrollElement: HTMLDivElement,
  targetScrollTop: number,
  durationMs: number,
  easingPoints: CubicBezierPoints,
  animationFrameRef: React.MutableRefObject<number | null>
) {
  const startScrollTop = scrollElement.scrollTop;
  const scrollDistance = targetScrollTop - startScrollTop;

  if (Math.abs(scrollDistance) < 1) {
    scrollElement.scrollTop = targetScrollTop;
    return;
  }

  const ease = createCubicBezierEasing(...easingPoints);
  const animationStart = performance.now();

  const step = (now: number) => {
    const progress = Math.min(1, (now - animationStart) / durationMs);
    scrollElement.scrollTop =
      startScrollTop + scrollDistance * ease(progress);

    if (progress < 1) {
      animationFrameRef.current = requestAnimationFrame(step);
      return;
    }

    scrollElement.scrollTop = targetScrollTop;
    animationFrameRef.current = null;
  };

  animationFrameRef.current = requestAnimationFrame(step);
}

function scheduleImmediateRecenter(
  scrollElement: HTMLDivElement,
  rowElement: HTMLTableRowElement,
  tableElement: HTMLTableElement,
  visibleTeamsAboveHighlighted: number,
  viewportAnchor: number | undefined,
  animationFrameRef: React.MutableRefObject<number | null>
) {
  stopAnimationFrame(animationFrameRef);

  animationFrameRef.current = requestAnimationFrame(() => {
    scrollElement.scrollTop = getCenteredRowScrollTop(
      scrollElement,
      rowElement,
      tableElement,
      visibleTeamsAboveHighlighted,
      viewportAnchor
    );
    animationFrameRef.current = null;
  });
}

function stopScrollAnimation(
  animationFrameRef: React.MutableRefObject<number | null>
) {
  if (animationFrameRef.current === null) {
    return;
  }

  cancelAnimationFrame(animationFrameRef.current);
  animationFrameRef.current = null;
}

function stopAnimationFrame(
  animationFrameRef: React.MutableRefObject<number | null>
) {
  if (animationFrameRef.current === null) {
    return;
  }

  cancelAnimationFrame(animationFrameRef.current);
  animationFrameRef.current = null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getStickyHeaderHeight(tableElement: HTMLTableElement | null): number {
  const headerRow =
    tableElement?.tHead?.rows.item(0);

  return headerRow?.getBoundingClientRect().height ?? 0;
}

function getRowSpacing(rowElement: HTMLTableRowElement): number {
  const previousRowElement = rowElement.previousElementSibling;

  if (previousRowElement instanceof HTMLTableRowElement) {
    return Math.max(1, rowElement.offsetTop - previousRowElement.offsetTop);
  }

  return rowElement.getBoundingClientRect().height;
}

function createCubicBezierEasing(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (progress: number) => number {
  const sampleCurveX = (t: number) =>
    ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t;
  const sampleCurveY = (t: number) =>
    ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t;
  const sampleCurveDerivativeX = (t: number) =>
    (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t + 3 * x1;

  return (progress: number) => {
    if (progress <= 0) {
      return 0;
    }

    if (progress >= 1) {
      return 1;
    }

    let t = progress;

    for (let iteration = 0; iteration < 6; iteration += 1) {
      const currentX = sampleCurveX(t) - progress;
      const currentSlope = sampleCurveDerivativeX(t);

      if (Math.abs(currentX) < 1e-6 || Math.abs(currentSlope) < 1e-6) {
        break;
      }

      t -= currentX / currentSlope;
    }

    return sampleCurveY(clamp(t, 0, 1));
  };
}
