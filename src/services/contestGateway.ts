import { ContestConfiguration } from "../domain/contestConfiguration";
import { ContestSnapshot } from "../domain/types";
import {
  createCodeforcesContestGateway,
  extractCodeforcesContestId
} from "./codeforcesContestGateway";
import { createHttpContestGateway } from "./httpContestGateway";
import { createMockContestGateway } from "./mockContestGateway";

export interface ContestGateway {
  getContestSnapshot(configuration: ContestConfiguration): Promise<ContestSnapshot>;
}

export function createContestGateway(
  configuration: ContestConfiguration
): ContestGateway {
  const apiBaseUrl = import.meta.env.VITE_REVELIO_API_BASE_URL as
    | string
    | undefined;

  if (apiBaseUrl) {
    return createHttpContestGateway(apiBaseUrl);
  }

  if (extractCodeforcesContestId(configuration.contestUrl) !== null) {
    return createCodeforcesContestGateway();
  }

  return createMockContestGateway();
}
