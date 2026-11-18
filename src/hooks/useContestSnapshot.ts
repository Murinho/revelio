import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { ContestConfiguration, ScoreboardParticipantType } from "../domain/contestConfiguration";
import { ContestSnapshot } from "../domain/types";
import {
  buildCodeforcesContestSnapshot,
  CodeforcesSubmission,
  extractCodeforcesContestId,
  getCodeforcesSubmissionVerdictStatus,
  isCodeforcesSubmissionEligible,
  loadCodeforcesContestSubmissions
} from "../services/codeforcesContestGateway";
import { createContestGateway } from "../services/contestGateway";

interface UseContestSnapshotOptions {
  elapsedSeconds?: number;
  live?: boolean;
}

interface UseContestSnapshotResult {
  snapshot: ContestSnapshot | null;
  loading: boolean;
  error: string | null;
}

interface LiveSubmissionTracker {
  knownEligibleSubmissionIds: Set<number>;
  pendingSubmissionIds: Set<number>;
  revealedSubmissionIds: Set<number>;
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
  let latestSubmissions: CodeforcesSubmission[] = [];
  let lastPolledElapsedSeconds = elapsedSecondsRef.current;
  let lastSnapshotFreezeHiddenSubmissions = shouldHideFrozenSubmissions(
    configuration,
    lastPolledElapsedSeconds
  );
  const tracker = createLiveSubmissionTracker();

  const rebuildSnapshot = (snapshotElapsedSeconds = lastPolledElapsedSeconds) => {
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
      const pollElapsedSeconds = elapsedSecondsRef.current;
      const submissions = await loadCodeforcesContestSubmissions(
        contestId,
        configuration.codeforces
      );

      if (!active) {
        return;
      }

      latestSubmissions = submissions;
      lastPolledElapsedSeconds = pollElapsedSeconds;
      updateLiveSubmissionTracker(
        tracker,
        latestSubmissions,
        pollElapsedSeconds,
        configuration.includedParticipantTypes
      );
      rebuildSnapshot();
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
  };
}

function createLiveSubmissionTracker(): LiveSubmissionTracker {
  return {
    knownEligibleSubmissionIds: new Set(),
    pendingSubmissionIds: new Set(),
    revealedSubmissionIds: new Set()
  };
}

function updateLiveSubmissionTracker(
  tracker: LiveSubmissionTracker,
  submissions: CodeforcesSubmission[],
  elapsedSeconds: number,
  includedParticipantTypes: readonly ScoreboardParticipantType[]
) {
  submissions
    .filter((submission) =>
      isCodeforcesSubmissionEligible(submission, elapsedSeconds, includedParticipantTypes)
    )
    .sort(compareSubmissionsChronologically)
    .forEach((submission) => {
      const verdictStatus = getCodeforcesSubmissionVerdictStatus(submission.verdict);
      const hasFinalVerdict = verdictStatus !== "pending";
      const isKnown = tracker.knownEligibleSubmissionIds.has(submission.id);

      if (!isKnown) {
        tracker.knownEligibleSubmissionIds.add(submission.id);

        if (hasFinalVerdict) {
          tracker.revealedSubmissionIds.add(submission.id);
          return;
        }

        tracker.pendingSubmissionIds.add(submission.id);
        return;
      }

      if (tracker.pendingSubmissionIds.has(submission.id) && hasFinalVerdict) {
        tracker.pendingSubmissionIds.delete(submission.id);
        tracker.revealedSubmissionIds.add(submission.id);
      }
    });
}

function compareSubmissionsChronologically(
  leftSubmission: CodeforcesSubmission,
  rightSubmission: CodeforcesSubmission
): number {
  return (
    (leftSubmission.relativeTimeSeconds ?? 0) -
      (rightSubmission.relativeTimeSeconds ?? 0) ||
    leftSubmission.id - rightSubmission.id
  );
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
