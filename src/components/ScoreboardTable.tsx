import { useEffect, useLayoutEffect, useRef } from "react";
import { ProblemMeta, TeamStanding } from "../domain/types";
import { formatPenalty } from "../utils/format";
import { ProblemCell } from "./ProblemCell";

interface ScoreboardTableProps {
  problems: ProblemMeta[];
  teams: TeamStanding[];
  focusTeamId?: string | null;
  focusRequestKey?: string | null;
  highlightedTeamId?: string | null;
}

const ROW_REORDER_DURATION_MS = 820;
const ROW_REORDER_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

export function ScoreboardTable({
  problems,
  teams,
  focusTeamId = null,
  focusRequestKey = null,
  highlightedTeamId = null
}: ScoreboardTableProps) {
  const rowElementsRef = useRef(new Map<string, HTMLTableRowElement>());
  const previousRowTopsRef = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const nextRowTops = new Map<string, number>();

    teams.forEach((team) => {
      const rowElement = rowElementsRef.current.get(team.id);

      if (!rowElement) {
        return;
      }

      const nextTop = rowElement.getBoundingClientRect().top;
      nextRowTops.set(team.id, nextTop);

      const previousTop = previousRowTopsRef.current.get(team.id);

      if (previousTop === undefined) {
        return;
      }

      const deltaY = previousTop - nextTop;

      if (Math.abs(deltaY) < 1) {
        return;
      }

      rowElement.getAnimations().forEach((animation) => animation.cancel());
      rowElement.animate(
        [
          {
            transform: `translateY(${deltaY}px)`
          },
          {
            transform: "translateY(0)"
          }
        ],
        {
          duration: ROW_REORDER_DURATION_MS,
          easing: ROW_REORDER_EASING
        }
      );
    });

    previousRowTopsRef.current = nextRowTops;
  }, [teams]);

  useEffect(() => {
    if (!focusTeamId) {
      return;
    }

    const rowElement = rowElementsRef.current.get(focusTeamId);

    if (!rowElement) {
      return;
    }

    let firstFrameId = 0;
    let secondFrameId = 0;

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        centerRowInView(rowElement);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [focusRequestKey, focusTeamId]);

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
    <div className="scoreboard-shell">
      <div className="scoreboard-scroll">
        <table className="scoreboard-table">
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
                    <strong className="team-cell__name">{getTeamPrimaryLabel(team)}</strong>
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
                    <ProblemCell cell={cell} problem={problems[index]} />
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

function centerRowInView(rowElement: HTMLTableRowElement) {
  const scrollContainer = findClosestVerticalScrollContainer(rowElement);

  if (!scrollContainer) {
    rowElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });
    return;
  }

  const rowTopWithinContainer =
    getAbsoluteOffsetTop(rowElement) - getAbsoluteOffsetTop(scrollContainer);
  const unclampedTargetScrollTop =
    rowTopWithinContainer - (scrollContainer.clientHeight - rowElement.offsetHeight) / 2;
  const maxScrollTop =
    scrollContainer.scrollHeight - scrollContainer.clientHeight;

  scrollContainer.scrollTo({
    top: clamp(unclampedTargetScrollTop, 0, Math.max(0, maxScrollTop)),
    behavior: "smooth"
  });
}

function findClosestVerticalScrollContainer(element: HTMLElement): HTMLElement | null {
  let currentElement = element.parentElement;

  while (currentElement) {
    const computedStyles = window.getComputedStyle(currentElement);
    const canScrollVertically =
      /(auto|scroll|overlay)/.test(computedStyles.overflowY) &&
      currentElement.scrollHeight > currentElement.clientHeight + 1;

    if (canScrollVertically) {
      return currentElement;
    }

    currentElement = currentElement.parentElement;
  }

  const documentScroller = document.scrollingElement;

  if (
    documentScroller instanceof HTMLElement &&
    documentScroller.scrollHeight > documentScroller.clientHeight + 1
  ) {
    return documentScroller;
  }

  return null;
}

function getAbsoluteOffsetTop(element: HTMLElement): number {
  let totalOffsetTop = 0;
  let currentElement: HTMLElement | null = element;

  while (currentElement) {
    totalOffsetTop += currentElement.offsetTop;
    currentElement = currentElement.offsetParent as HTMLElement | null;
  }

  return totalOffsetTop;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
