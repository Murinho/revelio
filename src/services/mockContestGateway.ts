import { createConfiguredContestPreview } from "../domain/contestConfiguration";
import { ContestSnapshot } from "../domain/types";
import { mockContestSnapshot } from "../data/mockContestData";
import type { ContestGateway } from "./contestGateway";

export function createMockContestGateway(): ContestGateway {
  return {
    async getContestSnapshot(configuration): Promise<ContestSnapshot> {
      await new Promise((resolve) => setTimeout(resolve, 180));
      return createConfiguredContestPreview(mockContestSnapshot, configuration);
    }
  };
}
