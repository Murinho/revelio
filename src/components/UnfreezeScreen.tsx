import { useEffect, useMemo, useState } from "react";
import { ScoreboardTable } from "./ScoreboardTable";
import { ContestSnapshot, TeamStanding } from "../domain/types";
import {
  applyUnfreezeProgress,
  buildUnfreezeRevealEvents,
  UnfreezeRevealEvent
} from "../domain/unfreezeSimulation";
import "./UnfreezeScreen.css";

interface UnfreezeScreenProps {
  snapshot: ContestSnapshot;
}

export function UnfreezeScreen({ snapshot }: UnfreezeScreenProps) {
  const revealEvents = useMemo(() => buildUnfreezeRevealEvents(snapshot), [snapshot]);
  const [revealCount, setRevealCount] = useState(0);
  const unfreezeProgress = useMemo(
    () => applyUnfreezeProgress(snapshot, revealEvents, revealCount),
    [snapshot, revealCount, revealEvents]
  );
  const unfreezeSnapshot = unfreezeProgress.snapshot;
  const completed = revealCount >= revealEvents.length;
  const nextReveal = revealEvents[revealCount] ?? null;
  const latestReveal = revealCount > 0 ? revealEvents[revealCount - 1] : null;
  const currentTeam =
    unfreezeSnapshot.teams.find((team) => team.id === unfreezeProgress.currentTeamId) ?? null;
  const canStepBackward = revealCount > 0;
  const canStepForward = revealCount < revealEvents.length;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableEventTarget(event.target)
      ) {
        return;
      }

      if (event.key === "ArrowRight" && canStepForward) {
        event.preventDefault();
        setRevealCount((currentCount) =>
          Math.min(currentCount + 1, revealEvents.length)
        );
      }

      if (event.key === "ArrowLeft" && canStepBackward) {
        event.preventDefault();
        setRevealCount((currentCount) => Math.max(currentCount - 1, 0));
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canStepBackward, canStepForward, revealEvents.length]);

  return (
    <div className="unfreeze-shell">
      <header className="unfreeze-header">
        <h1 className="unfreeze-header__title">{snapshot.regionName}</h1>
        <div className="unfreeze-status">
          <span className="unfreeze-status__badge">
            Steps {revealCount}/{revealEvents.length}
          </span>
          <p className="unfreeze-status__text">
            {currentTeam
              ? `Current: ${formatCurrentTeam(currentTeam)}`
              : "Current: all teams have already been checked."}
          </p>
          <p className="unfreeze-status__text">
            {nextReveal
              ? `Next: ${formatUpcomingReveal(nextReveal)}`
              : "All teams have been visited and all frozen submissions have been revealed."}
          </p>
          {latestReveal ? (
            <p className="unfreeze-status__text unfreeze-status__text--muted">
              Last: {formatCompletedReveal(latestReveal)}
            </p>
          ) : null}
          <p className="unfreeze-status__text unfreeze-status__text--muted">
            Keyboard: <kbd>Right Arrow</kbd> next step, <kbd>Left Arrow</kbd> go back.
          </p>
        </div>
        <div className="unfreeze-controls">
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setRevealCount((currentCount) =>
                Math.max(currentCount - 1, 0)
              )
            }
            disabled={!canStepBackward}
          >
            Go Back One Step
          </button>
          <button
            className="setup-submit-panel__button unfreeze-controls__primary"
            type="button"
            onClick={() =>
              setRevealCount((currentCount) =>
                Math.min(currentCount + 1, revealEvents.length)
              )
            }
            disabled={!canStepForward}
          >
            {completed ? "Unfreeze Complete" : "Unfreeze Next Step"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setRevealCount(0)}
            disabled={revealCount === 0}
          >
            Reset Unfreeze
          </button>
        </div>
      </header>

      <ScoreboardTable
        highlightedTeamId={unfreezeProgress.currentTeamId}
        problems={unfreezeSnapshot.problems}
        teams={unfreezeSnapshot.teams}
      />
    </div>
  );
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const editableAncestor = target.closest("input, textarea, select, [contenteditable='true']");
  return editableAncestor !== null;
}

function formatUpcomingReveal(revealEvent: UnfreezeRevealEvent): string {
  if (revealEvent.kind === "advance") {
    return revealEvent.nextCurrentTeamName
      ? `${revealEvent.teamName} has no pending submissions, so the process moves to ${revealEvent.nextCurrentTeamName}.`
      : `${revealEvent.teamName} has no pending submissions, so the reveal will finish.`;
  }

  if (revealEvent.verdict === "accepted" && revealEvent.positionsGained > 0) {
    return `${revealEvent.teamName} will solve problem ${revealEvent.problemLabel} and climb ${formatPlaceCount(
      revealEvent.positionsGained
    )}.`;
  }

  if (revealEvent.verdict === "accepted") {
    return `${revealEvent.teamName} will solve problem ${revealEvent.problemLabel}.`;
  }

  if (revealEvent.result === "failed") {
    return `${revealEvent.teamName} will exhaust problem ${revealEvent.problemLabel}.`;
  }

  return `${revealEvent.teamName} will reveal another submission on problem ${revealEvent.problemLabel}, leaving ${formatPendingCount(
    revealEvent.frozenSubmissionCount
  )}.`;
}

function formatCompletedReveal(revealEvent: UnfreezeRevealEvent): string {
  if (revealEvent.kind === "advance") {
    return revealEvent.nextCurrentTeamName
      ? `${revealEvent.teamName} had no pending submissions, so the process moved to ${revealEvent.nextCurrentTeamName}.`
      : `${revealEvent.teamName} had no pending submissions, so the reveal finished.`;
  }

  if (revealEvent.verdict === "accepted" && revealEvent.positionsGained > 0) {
    return `${revealEvent.teamName} solved problem ${revealEvent.problemLabel} and climbed ${formatPlaceCount(
      revealEvent.positionsGained
    )} to rank ${revealEvent.nextRank}.`;
  }

  if (revealEvent.verdict === "accepted") {
    return `${revealEvent.teamName} solved problem ${revealEvent.problemLabel}.`;
  }

  if (revealEvent.result === "failed") {
    return `${revealEvent.teamName} exhausted problem ${revealEvent.problemLabel}.`;
  }

  return `${revealEvent.teamName} revealed another submission on problem ${revealEvent.problemLabel}, leaving ${formatPendingCount(
    revealEvent.frozenSubmissionCount
  )}.`;
}

function formatCurrentTeam(team: TeamStanding): string {
  if (team.pendingProblemLabels.length === 0) {
    return `${team.name} has no pending submissions.`;
  }

  return `${team.name} is being checked on ${team.pendingProblemLabels.join(", ")}.`;
}

function formatPendingCount(count: number): string {
  return `${count} pending submission${count === 1 ? "" : "s"}`;
}

function formatPlaceCount(count: number): string {
  return `${count} place${count === 1 ? "" : "s"}`;
}
