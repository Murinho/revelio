import { useEffect, useMemo, useState } from "react";
import { ScoreboardTable } from "./ScoreboardTable";
import { ContestSnapshot } from "../domain/types";
import { applyUnfreezeProgress, buildUnfreezeRevealEvents } from "../domain/unfreezeSimulation";
import "./UnfreezeScreen.css";

interface UnfreezeScreenProps {
  snapshot: ContestSnapshot;
}

const REVEALING_TEAM_VIEWPORT_ANCHOR = 0.68;

export function UnfreezeScreen({ snapshot }: UnfreezeScreenProps) {
  const revealEvents = useMemo(() => buildUnfreezeRevealEvents(snapshot), [snapshot]);
  const [revealCount, setRevealCount] = useState(0);
  const unfreezeProgress = useMemo(
    () => applyUnfreezeProgress(snapshot, revealEvents, revealCount),
    [snapshot, revealCount, revealEvents]
  );
  const unfreezeSnapshot = unfreezeProgress.snapshot;
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
            Go Back
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
            Next Submission
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
        autoFollowHighlightedTeam
        fillViewport
        highlightedTeamId={unfreezeProgress.currentTeamId}
        highlightedTeamViewportAnchor={REVEALING_TEAM_VIEWPORT_ANCHOR}
        lockUserScroll
        problems={unfreezeSnapshot.problems}
        teams={unfreezeSnapshot.teams}
        visibleTeamsAboveHighlighted={5}
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
