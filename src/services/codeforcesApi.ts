interface CodeforcesApiEnvelope<T> {
  status: "OK" | "FAILED";
  comment?: string;
  result: T;
}

const CODEFORCES_API_BASE_URL = "https://codeforces.com/api";
const CODEFORCES_RATE_LIMIT_MS = 2100;
const CODEFORCES_REQUEST_TIMEOUT_MS = 15000;

let jsonpCallbackCounter = 0;
let lastStartedAt = 0;
let requestQueue = Promise.resolve();

export async function requestCodeforcesApi<T>(
  method: string,
  parameters: Record<string, boolean | number | string | undefined>
): Promise<T> {
  return enqueueRateLimitedRequest(async () => {
    try {
      return await executeCodeforcesRequest<T>(method, parameters);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Call limit exceeded")) {
        throw error;
      }

      await delay(CODEFORCES_RATE_LIMIT_MS);
      return executeCodeforcesRequest<T>(method, parameters);
    }
  });
}

async function executeCodeforcesRequest<T>(
  method: string,
  parameters: Record<string, boolean | number | string | undefined>
): Promise<T> {
  const requestUrl = new URL(`${CODEFORCES_API_BASE_URL}/${method}`);

  Object.entries(parameters).forEach(([parameterName, parameterValue]) => {
    if (parameterValue === undefined || parameterValue === "") {
      return;
    }

    requestUrl.searchParams.set(parameterName, String(parameterValue));
  });

  const response = await jsonpRequest<CodeforcesApiEnvelope<T>>(requestUrl);

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

function jsonpRequest<T>(requestUrl: URL): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const callbackName = `__revelioCodeforcesJsonp_${Date.now()}_${jsonpCallbackCounter}`;
    jsonpCallbackCounter += 1;
    const scriptElement = document.createElement("script");

    function cleanup() {
      delete window[callbackName];
      scriptElement.remove();
      if (timeoutHandle !== undefined) {
        window.clearTimeout(timeoutHandle);
      }
    }

    window[callbackName] = (payload: T) => {
      cleanup();
      resolve(payload);
    };

    scriptElement.async = true;
    scriptElement.onerror = () => {
      cleanup();
      reject(new Error("Unable to reach the Codeforces API."));
    };

    requestUrl.searchParams.set("jsonp", callbackName);
    scriptElement.src = requestUrl.toString();

    const timeoutHandle = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while waiting for the Codeforces API."));
    }, CODEFORCES_REQUEST_TIMEOUT_MS);

    document.head.append(scriptElement);
  });
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

declare global {
  interface Window {
    [callbackName: string]: unknown;
  }
}
