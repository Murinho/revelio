import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { ContestConfiguration } from "../domain/contestConfiguration";
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
  initialized: boolean;
  knownEligibleSubmissionIds: Set<number>;
  pendingSubmissionIds: Set<number>;
  revealedSubmissionIds: Set<number>;
  revealAtBySubmissionId: Map<number, number>;
}

const LIVE_SCOREBOARD_POLL_INTERVAL_MS = 10_000;
const LIVE_SUBMISSION_REVEAL_DELAY_MS = 5_000;

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
  let revealTimeoutId: number | null = null;
  let latestSubmissions: CodeforcesSubmission[] = [];
  let lastPolledElapsedSeconds = elapsedSecondsRef.current;
  const tracker = createLiveSubmissionTracker();

  const clearRevealTimeout = () => {
    if (revealTimeoutId === null) {
      return;
    }

    window.clearTimeout(revealTimeoutId);
    revealTimeoutId = null;
  };

  const rebuildSnapshot = () => {
    if (!active) {
      return;
    }

    markDueReveals(tracker, Date.now());

    setSnapshot(
      buildCodeforcesContestSnapshot(configuration, contestId, latestSubmissions, {
        elapsedSeconds: lastPolledElapsedSeconds,
        freezeHiddenSubmissions: false,
        pendingSubmissionIds: tracker.pendingSubmissionIds,
        revealedSubmissionIds: tracker.revealedSubmissionIds,
        updatedAt: new Date()
      })
    );
    setError(null);
    setLoading(false);
    hasLoadedSnapshot = true;
    scheduleNextReveal();
  };

  const scheduleNextReveal = () => {
    clearRevealTimeout();

    const nextRevealAt = getNextRevealAt(tracker);

    if (nextRevealAt === null) {
      return;
    }

    revealTimeoutId = window.setTimeout(
      rebuildSnapshot,
      Math.max(0, nextRevealAt - Date.now())
    );
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
        Date.now()
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

  return () => {
    active = false;
    clearRevealTimeout();

    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId);
    }
  };
}

function createLiveSubmissionTracker(): LiveSubmissionTracker {
  return {
    initialized: false,
    knownEligibleSubmissionIds: new Set(),
    pendingSubmissionIds: new Set(),
    revealedSubmissionIds: new Set(),
    revealAtBySubmissionId: new Map()
  };
}

function updateLiveSubmissionTracker(
  tracker: LiveSubmissionTracker,
  submissions: CodeforcesSubmission[],
  elapsedSeconds: number,
  nowMs: number
) {
  markDueReveals(tracker, nowMs);

  submissions
    .filter((submission) => isCodeforcesSubmissionEligible(submission, elapsedSeconds))
    .sort(compareSubmissionsChronologically)
    .forEach((submission) => {
      const verdictStatus = getCodeforcesSubmissionVerdictStatus(submission.verdict);
      const hasFinalVerdict = verdictStatus !== "pending";
      const isKnown = tracker.knownEligibleSubmissionIds.has(submission.id);

      if (!isKnown) {
        tracker.knownEligibleSubmissionIds.add(submission.id);

        if (!tracker.initialized && hasFinalVerdict) {
          tracker.revealedSubmissionIds.add(submission.id);
          return;
        }

        tracker.pendingSubmissionIds.add(submission.id);

        if (hasFinalVerdict) {
          tracker.revealAtBySubmissionId.set(
            submission.id,
            nowMs + LIVE_SUBMISSION_REVEAL_DELAY_MS
          );
        }

        return;
      }

      if (
        tracker.pendingSubmissionIds.has(submission.id) &&
        hasFinalVerdict &&
        !tracker.revealAtBySubmissionId.has(submission.id)
      ) {
        tracker.revealAtBySubmissionId.set(
          submission.id,
          nowMs + LIVE_SUBMISSION_REVEAL_DELAY_MS
        );
      }
    });

  tracker.initialized = true;
}

function markDueReveals(tracker: LiveSubmissionTracker, nowMs: number) {
  tracker.revealAtBySubmissionId.forEach((revealAt, submissionId) => {
    if (revealAt > nowMs) {
      return;
    }

    tracker.revealedSubmissionIds.add(submissionId);
    tracker.pendingSubmissionIds.delete(submissionId);
    tracker.revealAtBySubmissionId.delete(submissionId);
  });
}

function getNextRevealAt(tracker: LiveSubmissionTracker): number | null {
  const revealTimes = [...tracker.revealAtBySubmissionId.values()];

  if (revealTimes.length === 0) {
    return null;
  }

  return Math.min(...revealTimes);
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
