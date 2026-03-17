import { ContestSnapshot } from "../domain/types";
import type { ContestGateway } from "./contestGateway";

export function createHttpContestGateway(apiBaseUrl: string): ContestGateway {
  return {
    async getContestSnapshot(): Promise<ContestSnapshot> {
      const response = await fetch(`${apiBaseUrl}/contest/snapshot`);

      if (!response.ok) {
        throw new Error("Unable to load contest snapshot.");
      }

      return (await response.json()) as ContestSnapshot;
    }
  };
}
