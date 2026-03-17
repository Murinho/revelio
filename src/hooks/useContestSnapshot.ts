import { useEffect, useMemo, useState } from "react";
import { ContestSnapshot } from "../domain/types";
import { createContestGateway } from "../services/contestGateway";

interface UseContestSnapshotResult {
  snapshot: ContestSnapshot | null;
  loading: boolean;
  error: string | null;
}

const gateway = createContestGateway();

export function useContestSnapshot(): UseContestSnapshotResult {
  const [snapshot, setSnapshot] = useState<ContestSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      setLoading(true);
      setError(null);

      try {
        const nextSnapshot = await gateway.getContestSnapshot();

        if (active) {
          setSnapshot(nextSnapshot);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unknown error while loading the contest."
          );
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
  }, []);

  return useMemo(
    () => ({
      snapshot,
      loading,
      error
    }),
    [snapshot, loading, error]
  );
}
