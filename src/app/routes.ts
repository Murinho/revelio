const SCOREBOARD_BASE_PATH = "/scoreboard";

export const HOME_PATH = "/";
export const CREATE_CONTEST_PATH = "/create_contest";
export const SCOREBOARD_PREVIEW_CONTEST_ID = "preview";

type HomeRoute = {
  screen: "home";
  path: string;
};

type SetupRoute = {
  screen: "setup";
  path: string;
};

type ScoreboardRoute = {
  screen: "scoreboard";
  path: string;
  contestId: string;
};

type NotFoundRoute = {
  screen: "not-found";
  path: string;
};

export type AppRoute = HomeRoute | SetupRoute | ScoreboardRoute | NotFoundRoute;

export function parseAppRoute(pathname: string): AppRoute {
  const normalizedPath = normalizePathname(pathname);

  if (normalizedPath === HOME_PATH) {
    return {
      screen: "home",
      path: HOME_PATH
    };
  }

  if (normalizedPath === CREATE_CONTEST_PATH) {
    return {
      screen: "setup",
      path: CREATE_CONTEST_PATH
    };
  }

  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const [firstSegment, secondSegment, ...remainingSegments] = pathSegments;

  if (firstSegment?.toLowerCase() === "scoreboard") {
    if (remainingSegments.length > 0) {
      return {
        screen: "not-found",
        path: normalizedPath
      };
    }

    const contestId =
      normalizeContestId(secondSegment ? safeDecodeURIComponent(secondSegment) : "") ??
      SCOREBOARD_PREVIEW_CONTEST_ID;

    return {
      screen: "scoreboard",
      contestId,
      path: buildScoreboardPath(contestId)
    };
  }

  return {
    screen: "not-found",
    path: normalizedPath
  };
}

export function buildScoreboardPath(contestId: string): string {
  const normalizedContestId =
    normalizeContestId(contestId) ?? SCOREBOARD_PREVIEW_CONTEST_ID;

  return `${SCOREBOARD_BASE_PATH}/${encodeURIComponent(normalizedContestId)}`;
}

export function createContestIdCandidate(value: string): string | null {
  return normalizeContestId(value);
}

export function resolveContestId(options: {
  contestUrl: string;
  contestName?: string;
  fallbackContestId?: string | null;
}): string {
  const contestIdFromUrl = extractContestIdFromContestUrl(options.contestUrl);

  if (contestIdFromUrl) {
    return contestIdFromUrl;
  }

  const contestIdFromName = createContestIdCandidate(options.contestName ?? "");

  if (contestIdFromName) {
    return contestIdFromName;
  }

  const fallbackContestId = createContestIdCandidate(
    options.fallbackContestId ?? ""
  );

  return fallbackContestId ?? SCOREBOARD_PREVIEW_CONTEST_ID;
}

export function extractContestIdFromContestUrl(contestUrl: string): string | null {
  const trimmedContestUrl = contestUrl.trim();

  if (!trimmedContestUrl) {
    return null;
  }

  const directContestId = normalizeContestId(trimmedContestUrl);

  if (directContestId && !/[/?#]/.test(trimmedContestUrl)) {
    return directContestId;
  }

  const parsedUrl = parseContestUrl(trimmedContestUrl);

  if (!parsedUrl) {
    return null;
  }

  const contestIdFromQuery =
    parsedUrl.searchParams.get("contestId") ??
    parsedUrl.searchParams.get("contest_id");
  const normalizedContestIdFromQuery = normalizeContestId(contestIdFromQuery ?? "");

  if (normalizedContestIdFromQuery) {
    return normalizedContestIdFromQuery;
  }

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const contestKeywordIndex = pathSegments.findIndex(
    (segment) => segment.toLowerCase() === "contest"
  );

  if (contestKeywordIndex >= 0) {
    return normalizeContestId(pathSegments[contestKeywordIndex + 1] ?? "");
  }

  return null;
}

function normalizePathname(pathname: string): string {
  const trimmedPathname = pathname.trim();

  if (!trimmedPathname) {
    return "/";
  }

  const normalizedPathname = trimmedPathname.replace(/\/{2,}/g, "/");

  if (normalizedPathname.length > 1 && normalizedPathname.endsWith("/")) {
    return normalizedPathname.slice(0, -1);
  }

  return normalizedPathname;
}

function normalizeContestId(contestId: string): string | null {
  const trimmedContestId = contestId.trim();

  if (!trimmedContestId) {
    return null;
  }

  const sanitizedContestId = trimmedContestId
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitizedContestId || null;
}

function parseContestUrl(contestUrl: string): URL | null {
  try {
    return new URL(contestUrl);
  } catch {
    try {
      return new URL(contestUrl, "https://codeforces.com");
    } catch {
      return null;
    }
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
