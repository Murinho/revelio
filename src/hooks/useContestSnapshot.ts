import { useEffect, useMemo, useState } from "react";
import { ContestConfiguration } from "../domain/contestConfiguration";
import { ContestSnapshot } from "../domain/types";
import { createContestGateway } from "../services/contestGateway";

interface UseContestSnapshotResult {
  snapshot: ContestSnapshot | null;
  loading: boolean;
  error: string | null;
}

export function useContestSnapshot(
  configuration: ContestConfiguration | null
): UseContestSnapshotResult {
  const [snapshot, setSnapshot] = useState<ContestSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      if (!configuration) {
        setSnapshot(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const gateway = createContestGateway(configuration);
        const nextSnapshot = await gateway.getContestSnapshot(configuration);

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
  }, [configuration]);

  return useMemo(
    () => ({
      snapshot,
      loading,
      error
    }),
    [snapshot, loading, error]
  );
}
