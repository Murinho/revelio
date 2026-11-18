import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreboardTable } from "./ScoreboardTable";
import { ContestSnapshot } from "../domain/types";
import { applyUnfreezeProgress, buildUnfreezeRevealEvents } from "../domain/unfreezeSimulation";
import "./UnfreezeScreen.css";

interface UnfreezeScreenProps {
  snapshot: ContestSnapshot;
  onMainMenu: () => void;
}

const REVEALING_TEAM_VIEWPORT_ANCHOR = 0.68;

export function UnfreezeScreen({ snapshot, onMainMenu }: UnfreezeScreenProps) {
  const confirmationDialogRef = useRef<HTMLDialogElement>(null);
  const [confirmationAction, setConfirmationAction] = useState<"exit" | "reset">("exit");
  const isResetConfirmation = confirmationAction === "reset";
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
        confirmationDialogRef.current?.open ||
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
            onClick={() => {
              setConfirmationAction("reset");
              confirmationDialogRef.current?.showModal();
            }}
            disabled={revealCount === 0}
          >
            Reset Unfreeze
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setConfirmationAction("exit");
              confirmationDialogRef.current?.showModal();
            }}
          >
            Back to Main Menu
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

      <dialog
        className="panel unfreeze-confirmation-dialog"
        ref={confirmationDialogRef}
        aria-labelledby="unfreeze-confirmation-title"
        aria-describedby="unfreeze-confirmation-description"
      >
        <h2 id="unfreeze-confirmation-title" className="unfreeze-confirmation-dialog__title">
          {isResetConfirmation ? "Reset unfreeze?" : "Go back to the main menu?"}
        </h2>
        <p id="unfreeze-confirmation-description" className="unfreeze-confirmation-dialog__description">
          {isResetConfirmation
            ? "All revelator progress will be lost. You’ll start again from the bottom of the scoreboard."
            : "All revelator progress will be lost. When you return, you’ll start again from the bottom of the scoreboard."}
        </p>
        <form method="dialog" className="unfreeze-confirmation-dialog__actions">
          <button className="secondary-button" type="submit" autoFocus>
            Cancel
          </button>
          <button
            className="setup-submit-panel__button"
            type="button"
            onClick={() => {
              if (isResetConfirmation) {
                setRevealCount(0);
                confirmationDialogRef.current?.close();
              } else {
                onMainMenu();
              }
            }}
          >
            {isResetConfirmation ? "Reset Unfreeze" : "Go to Main Menu"}
          </button>
        </form>
      </dialog>
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
