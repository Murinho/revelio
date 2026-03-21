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

  return (
    <div className="unfreeze-shell">
      <header className="unfreeze-header">
        <h1 className="unfreeze-header__title">{configuration.contestName}</h1>
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
            {completed ? "Unfreeze Complete" : "Unfreeze Next Submission"}
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
