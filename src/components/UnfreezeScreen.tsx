import { useEffect, useMemo, useState } from "react";
import { ScoreboardTable } from "./ScoreboardTable";
import { ContestSnapshot } from "../domain/types";
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
  const unfreezeSnapshot = useMemo(
    () => applyUnfreezeProgress(snapshot, revealEvents, revealCount),
    [snapshot, revealCount, revealEvents]
  );
  const completed = revealCount >= revealEvents.length;
  const nextReveal = revealEvents[revealCount] ?? null;
  const latestReveal = revealCount > 0 ? revealEvents[revealCount - 1] : null;
  const focusedReveal = latestReveal ?? nextReveal;
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
        focusTeamId={focusedReveal?.teamId ?? null}
        focusRequestKey={
          focusedReveal ? `${revealCount}:${focusedReveal.id}` : `${revealCount}:none`
        }
        highlightedTeamId={focusedReveal?.teamId ?? null}
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
  if (revealEvent.kind === "team-visit") {
    return `${revealEvent.teamName} will be visited and marked in place.`;
  }

  if (revealEvent.verdict === "accepted") {
    return `${revealEvent.teamName} will solve problem ${revealEvent.problemLabel}.`;
  }

  if (revealEvent.result === "failed") {
    return `${revealEvent.teamName} will exhaust problem ${revealEvent.problemLabel}.`;
  }

  return `${revealEvent.teamName} will reveal another wrong try on problem ${revealEvent.problemLabel}.`;
}

function formatCompletedReveal(revealEvent: UnfreezeRevealEvent): string {
  if (revealEvent.kind === "team-visit") {
    return `${revealEvent.teamName} was visited and marked in place.`;
  }

  if (revealEvent.verdict === "accepted") {
    return `${revealEvent.teamName} solved problem ${revealEvent.problemLabel}.`;
  }

  if (revealEvent.result === "failed") {
    return `${revealEvent.teamName} exhausted problem ${revealEvent.problemLabel}.`;
  }

  return `${revealEvent.teamName} revealed a wrong try on problem ${revealEvent.problemLabel}.`;
}
