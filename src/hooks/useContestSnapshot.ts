import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { ContestConfiguration } from "../domain/contestConfiguration";
import { ContestSnapshot } from "../domain/types";
import {
  buildCodeforcesContestSnapshot,
  CodeforcesSubmission,
  extractCodeforcesContestId,
  loadCodeforcesContestSubmissions
} from "../services/codeforcesContestGateway";
import { createContestGateway } from "../services/contestGateway";
import {
  createLiveSubmissionTracker,
  revealReadyLiveSubmissions,
  updateLiveSubmissionTracker
} from "../services/liveSubmissionTracker";

interface UseContestSnapshotOptions {
  elapsedSeconds?: number;
  live?: boolean;
}

interface UseContestSnapshotResult {
  snapshot: ContestSnapshot | null;
  loading: boolean;
  error: string | null;
}

const LIVE_SCOREBOARD_POLL_INTERVAL_MS = 5_000;

export function useContestSnapshot(
  configuration: ContestConfiguration | null,
  options: UseContestSnapshotOptions = {}
): UseContestSnapshotResult {
  const [snapshot, setSnapshot] = useState<ContestSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsedSeconds = options.elapsedSeconds ?? 0;
  const live = options.live ?? false;
  const elapsedSecondsRef = useRef(elapsedSeconds);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    if (!configuration) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const activeConfiguration = configuration;
    const codeforcesContestId = extractCodeforcesContestId(
      activeConfiguration.contestUrl
    );

    if (live && codeforcesContestId !== null) {
      return subscribeToLiveCodeforcesSnapshot({
        configuration: activeConfiguration,
        contestId: codeforcesContestId,
        elapsedSecondsRef,
        setSnapshot,
        setLoading,
        setError
      });
    }

    let active = true;

    async function loadSnapshot() {
      setLoading(true);
      setError(null);

      try {
        const gateway = createContestGateway(activeConfiguration);
        const nextSnapshot = await gateway.getContestSnapshot(activeConfiguration);

        if (active) {
          setSnapshot(nextSnapshot);
        }
      } catch (loadError) {
        if (active) {
          setError(formatSnapshotError(loadError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSnapshot();

    return () => {
      active = false;
    };
  }, [configuration, live]);

  return useMemo(
    () => ({
      snapshot,
      loading,
      error
    }),
    [snapshot, loading, error]
  );
}

function subscribeToLiveCodeforcesSnapshot({
  configuration,
  contestId,
  elapsedSecondsRef,
  setSnapshot,
  setLoading,
  setError
}: {
  configuration: ContestConfiguration;
  contestId: number;
  elapsedSecondsRef: MutableRefObject<number>;
  setSnapshot: Dispatch<SetStateAction<ContestSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
}): () => void {
  let active = true;
  let polling = false;
  let hasLoadedSnapshot = false;
  let pollIntervalId: number | null = null;
  let clockIntervalId: number | null = null;
  let revealTimeoutId: number | null = null;
  let latestSubmissions: CodeforcesSubmission[] = [];
  let lastSnapshotFreezeHiddenSubmissions = shouldHideFrozenSubmissions(
    configuration,
    elapsedSecondsRef.current
  );
  const tracker = createLiveSubmissionTracker();

  const rebuildSnapshot = (snapshotElapsedSeconds = elapsedSecondsRef.current) => {
    if (!active) {
      return;
    }

    const freezeHiddenSubmissions = shouldHideFrozenSubmissions(
      configuration,
      snapshotElapsedSeconds
    );

    setSnapshot(
      buildCodeforcesContestSnapshot(configuration, contestId, latestSubmissions, {
        elapsedSeconds: snapshotElapsedSeconds,
        freezeHiddenSubmissions,
        pendingSubmissionIds: tracker.pendingSubmissionIds,
        revealedSubmissionIds: tracker.revealedSubmissionIds,
        updatedAt: new Date()
      })
    );
    setError(null);
    setLoading(false);
    hasLoadedSnapshot = true;
    lastSnapshotFreezeHiddenSubmissions = freezeHiddenSubmissions;
  };

  const scheduleNextReveal = () => {
    if (revealTimeoutId !== null) {
      window.clearTimeout(revealTimeoutId);
      revealTimeoutId = null;
    }

    if (!active || tracker.revealAtMsBySubmissionId.size === 0) {
      return;
    }

    let nextRevealAtMs = Number.POSITIVE_INFINITY;
    for (const revealAtMs of tracker.revealAtMsBySubmissionId.values()) {
      nextRevealAtMs = Math.min(nextRevealAtMs, revealAtMs);
    }
    revealTimeoutId = window.setTimeout(() => {
      revealTimeoutId = null;
      if (!active) {
        return;
      }
      revealReadyLiveSubmissions(tracker, performance.now());
      rebuildSnapshot();
      scheduleNextReveal();
    }, Math.max(0, nextRevealAtMs - performance.now()));
  };

  const refreshSnapshotMode = () => {
    if (!hasLoadedSnapshot) {
      return;
    }

    const nextFreezeHiddenSubmissions = shouldHideFrozenSubmissions(
      configuration,
      elapsedSecondsRef.current
    );

    if (nextFreezeHiddenSubmissions !== lastSnapshotFreezeHiddenSubmissions) {
      rebuildSnapshot(elapsedSecondsRef.current);
    }
  };

  const pollCodeforcesStatus = async () => {
    if (polling) {
      return;
    }

    polling = true;

    if (!hasLoadedSnapshot) {
      setLoading(true);
    }

    try {
      const submissions = await loadCodeforcesContestSubmissions(
        contestId,
        configuration.codeforces
      );

      if (!active) {
        return;
      }

      latestSubmissions = submissions;
      updateLiveSubmissionTracker(
        tracker,
        latestSubmissions,
        elapsedSecondsRef.current,
        configuration.includedParticipantTypes,
        Math.max(1, Math.floor(configuration.durationMinutes * 60)),
        performance.now()
      );
      rebuildSnapshot();
      scheduleNextReveal();
    } catch (loadError) {
      if (!active) {
        return;
      }

      if (!hasLoadedSnapshot) {
        setError(formatSnapshotError(loadError));
        setLoading(false);
      }
    } finally {
      polling = false;
    }
  };

  void pollCodeforcesStatus();
  pollIntervalId = window.setInterval(
    pollCodeforcesStatus,
    LIVE_SCOREBOARD_POLL_INTERVAL_MS
  );
  clockIntervalId = window.setInterval(refreshSnapshotMode, 1000);

  return () => {
    active = false;

    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId);
    }

    if (clockIntervalId !== null) {
      window.clearInterval(clockIntervalId);
    }

    if (revealTimeoutId !== null) {
      window.clearTimeout(revealTimeoutId);
    }
  };
}

function formatSnapshotError(loadError: unknown): string {
  return loadError instanceof Error
    ? loadError.message
    : "Unknown error while loading the contest.";
}

function shouldHideFrozenSubmissions(
  configuration: ContestConfiguration,
  elapsedSeconds: number
): boolean {
  const durationSeconds = Math.max(
    1,
    Math.floor(configuration.durationMinutes * 60)
  );
  const freezeDurationSeconds = Math.min(
    durationSeconds,
    Math.max(0, Math.floor(configuration.freezeDurationMinutes * 60))
  );

  if (freezeDurationSeconds <= 0) {
    return false;
  }

  return elapsedSeconds >= durationSeconds - freezeDurationSeconds;
}
