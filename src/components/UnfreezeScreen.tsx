import { useMemo, useState } from "react";
import { ScoreboardTable } from "./ScoreboardTable";
import { ContestConfiguration } from "../domain/contestConfiguration";
import { ContestSnapshot } from "../domain/types";
import {
  applyUnfreezeProgress,
  buildUnfreezeRevealEvents
} from "../domain/unfreezeSimulation";
import "./UnfreezeScreen.css";

interface UnfreezeScreenProps {
  configuration: ContestConfiguration;
  snapshot: ContestSnapshot;
}

export function UnfreezeScreen({
  configuration,
  snapshot
}: UnfreezeScreenProps) {
  const revealEvents = useMemo(() => buildUnfreezeRevealEvents(snapshot), [snapshot]);
  const [revealCount, setRevealCount] = useState(0);
  const unfreezeSnapshot = useMemo(
    () => applyUnfreezeProgress(snapshot, revealEvents, revealCount),
    [snapshot, revealCount, revealEvents]
  );
  const completed = revealCount >= revealEvents.length;
  const nextReveal = revealEvents[revealCount] ?? null;
  const latestReveal = revealCount > 0 ? revealEvents[revealCount - 1] : null;

  return (
    <div className="unfreeze-shell">
      <header className="unfreeze-header">
        <h1 className="unfreeze-header__title">{snapshot.regionName}</h1>
        <div className="unfreeze-status">
          <span className="unfreeze-status__badge">
            Reveals {revealCount}/{revealEvents.length}
          </span>
          <p className="unfreeze-status__text">
            {nextReveal
              ? `Next: ${nextReveal.teamName} on problem ${nextReveal.problemLabel}.`
              : "All frozen problem cells have been revealed."}
          </p>
          {latestReveal ? (
            <p className="unfreeze-status__text unfreeze-status__text--muted">
              Last: {latestReveal.teamName}{" "}
              {latestReveal.result === "solved" ? "solved" : "missed"}{" "}
              {latestReveal.problemLabel}.
            </p>
          ) : null}
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
            disabled={revealCount === 0}
          >
            Go Back One Submission
          </button>
          <button
            className="setup-submit-panel__button unfreeze-controls__primary"
            type="button"
            onClick={() =>
              setRevealCount((currentCount) =>
                Math.min(currentCount + 1, revealEvents.length)
              )
            }
            disabled={completed}
          >
            {completed ? "Unfreeze Complete" : "Unfreeze Next Reveal"}
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
        problems={unfreezeSnapshot.problems}
        teams={unfreezeSnapshot.teams}
      />
    </div>
  );
}
