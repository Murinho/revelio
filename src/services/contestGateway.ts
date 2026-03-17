import { ContestSnapshot } from "../domain/types";
import { createHttpContestGateway } from "./httpContestGateway";
import { createMockContestGateway } from "./mockContestGateway";

export interface ContestGateway {
  getContestSnapshot(): Promise<ContestSnapshot>;
}

export function createContestGateway(): ContestGateway {
  const apiBaseUrl = import.meta.env.VITE_REVELIO_API_BASE_URL as
    | string
    | undefined;

  if (apiBaseUrl) {
    return createHttpContestGateway(apiBaseUrl);
  }

  return createMockContestGateway();
}
