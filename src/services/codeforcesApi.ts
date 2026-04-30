type CodeforcesApiEnvelope<T> =
  | {
      status: "OK";
      result: T;
    }
  | {
      status: "FAILED";
      comment?: string;
    };

export interface CodeforcesApiCredentials {
  apiKey: string;
  apiSecret: string;
}

type CodeforcesParameterValue = boolean | number | string | undefined;

const CODEFORCES_API_BASE_URL = "https://codeforces.com/api";
const CODEFORCES_RATE_LIMIT_MS = 2100;
const CODEFORCES_REQUEST_TIMEOUT_MS = 15000;
const CODEFORCES_API_SIGNATURE_PREFIX_LENGTH = 6;
const CODEFORCES_API_SIGNATURE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

let lastStartedAt = 0;
let requestQueue = Promise.resolve();

export async function requestCodeforcesApi<T>(
  method: string,
  parameters: Record<string, CodeforcesParameterValue>,
  credentials?: CodeforcesApiCredentials
): Promise<T> {
  return enqueueRateLimitedRequest(async () => {
    try {
      return await executeCodeforcesRequest<T>(method, parameters, credentials);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Call limit exceeded")) {
        throw error;
      }

      await delay(CODEFORCES_RATE_LIMIT_MS);
      return executeCodeforcesRequest<T>(method, parameters, credentials);
    }
  });
}

async function executeCodeforcesRequest<T>(
  method: string,
  parameters: Record<string, CodeforcesParameterValue>,
  credentials?: CodeforcesApiCredentials
): Promise<T> {
  const requestParameters = await buildCodeforcesRequestParameters(
    method,
    parameters,
    credentials
  );
  const requestUrl = buildCodeforcesRequestUrl(method, requestParameters);
  const response = await fetchCodeforcesApiEnvelope<T>(requestUrl, method);

  if (response.status === "FAILED") {
    throw new Error(response.comment ?? `Codeforces ${method} failed.`);
  }

  return response.result;
}

function enqueueRateLimitedRequest<T>(run: () => Promise<T>): Promise<T> {
  const scheduledRequest = requestQueue.then(async () => {
    const waitTimeMs = Math.max(
      0,
      CODEFORCES_RATE_LIMIT_MS - (Date.now() - lastStartedAt)
    );

    if (waitTimeMs > 0) {
      await delay(waitTimeMs);
    }

    lastStartedAt = Date.now();
    return run();
  });

  requestQueue = scheduledRequest.then(
    () => undefined,
    () => undefined
  );

  return scheduledRequest;
}

async function buildCodeforcesRequestParameters(
  method: string,
  parameters: Record<string, CodeforcesParameterValue>,
  credentials?: CodeforcesApiCredentials
): Promise<Map<string, string>> {
  const requestParameters = normalizeCodeforcesParameters(parameters);

  const apiKey = credentials?.apiKey.trim() ?? "";
  const apiSecret = credentials?.apiSecret.trim() ?? "";

  if (!apiKey && !apiSecret) {
    return requestParameters;
  }

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Enter both the Codeforces API key and secret to load restricted contest data."
    );
  }

  requestParameters.set("apiKey", apiKey);
  requestParameters.set("time", String(Math.floor(Date.now() / 1000)));

  const signaturePrefix = createCodeforcesApiSignaturePrefix();
  const signatureHash = await createCodeforcesApiSignatureHash(
    signaturePrefix,
    method,
    requestParameters,
    apiSecret
  );

  requestParameters.set("apiSig", `${signaturePrefix}${signatureHash}`);

  return requestParameters;
}

function normalizeCodeforcesParameters(
  parameters: Record<string, CodeforcesParameterValue>
): Map<string, string> {
  const requestParameters = new Map<string, string>();

  Object.entries(parameters).forEach(([parameterName, parameterValue]) => {
    if (parameterValue === undefined || parameterValue === "") {
      return;
    }

    requestParameters.set(parameterName, String(parameterValue));
  });

  return requestParameters;
}

function buildCodeforcesRequestUrl(
  method: string,
  requestParameters: Map<string, string>
): URL {
  const requestUrl = new URL(`${CODEFORCES_API_BASE_URL}/${method}`);

  requestParameters.forEach((parameterValue, parameterName) => {
    requestUrl.searchParams.set(parameterName, parameterValue);
  });

  return requestUrl;
}

async function fetchCodeforcesApiEnvelope<T>(
  requestUrl: URL,
  method: string
): Promise<CodeforcesApiEnvelope<T>> {
  const abortController = new AbortController();
  const timeoutHandle = window.setTimeout(() => {
    abortController.abort();
  }, CODEFORCES_REQUEST_TIMEOUT_MS);
  let httpResponse: Response;

  try {
    httpResponse = await fetch(requestUrl, {
      signal: abortController.signal
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error("Timed out while waiting for the Codeforces API.");
    }

    throw new Error(
      "Unable to reach the Codeforces API. Check your network connection and try again."
    );
  } finally {
    window.clearTimeout(timeoutHandle);
  }

  const responseText = await httpResponse.text();
  const apiResponse = parseCodeforcesApiEnvelope<T>(responseText, method);

  if (!httpResponse.ok && apiResponse.status !== "FAILED") {
    throw new Error(
      `Codeforces ${method} returned HTTP ${httpResponse.status}.`
    );
  }

  return apiResponse;
}

function parseCodeforcesApiEnvelope<T>(
  responseText: string,
  method: string
): CodeforcesApiEnvelope<T> {
  try {
    return JSON.parse(responseText) as CodeforcesApiEnvelope<T>;
  } catch {
    throw new Error(`Codeforces ${method} returned an invalid API response.`);
  }
}

async function createCodeforcesApiSignatureHash(
  signaturePrefix: string,
  method: string,
  requestParameters: Map<string, string>,
  apiSecret: string
): Promise<string> {
  const signatureBase = `${signaturePrefix}/${method}?${serializeCodeforcesSignatureParameters(
    requestParameters
  )}#${apiSecret}`;
  const cryptoProvider = globalThis.crypto;

  if (!cryptoProvider?.subtle) {
    throw new Error(
      "This browser cannot sign Codeforces API requests. Open Revelio from localhost or HTTPS and try again."
    );
  }

  const signatureBytes = await cryptoProvider.subtle.digest(
    "SHA-512",
    new TextEncoder().encode(signatureBase)
  );

  return Array.from(new Uint8Array(signatureBytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function serializeCodeforcesSignatureParameters(
  requestParameters: Map<string, string>
): string {
  return [...requestParameters.entries()]
    .sort(
      ([leftName, leftValue], [rightName, rightValue]) =>
        compareLexicographically(leftName, rightName) ||
        compareLexicographically(leftValue, rightValue)
    )
    .map(([parameterName, parameterValue]) => `${parameterName}=${parameterValue}`)
    .join("&");
}

function compareLexicographically(leftValue: string, rightValue: string): number {
  if (leftValue < rightValue) {
    return -1;
  }

  if (leftValue > rightValue) {
    return 1;
  }

  return 0;
}

function createCodeforcesApiSignaturePrefix(): string {
  const randomBytes = new Uint8Array(CODEFORCES_API_SIGNATURE_PREFIX_LENGTH);
  const cryptoProvider = globalThis.crypto;

  if (cryptoProvider?.getRandomValues) {
    cryptoProvider.getRandomValues(randomBytes);

    return Array.from(randomBytes)
      .map(
        (byte) =>
          CODEFORCES_API_SIGNATURE_ALPHABET[
            byte % CODEFORCES_API_SIGNATURE_ALPHABET.length
          ]
      )
      .join("");
  }

  return Array.from({ length: CODEFORCES_API_SIGNATURE_PREFIX_LENGTH }, () =>
    CODEFORCES_API_SIGNATURE_ALPHABET[
      Math.floor(Math.random() * CODEFORCES_API_SIGNATURE_ALPHABET.length)
    ]
  ).join("");
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}
