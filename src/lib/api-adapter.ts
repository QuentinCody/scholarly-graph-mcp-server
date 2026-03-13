import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import {
    crossrefFetch,
    openAlexFetch,
    openAireFetch,
    orcidFetch,
    rorFetch,
} from "./http";

type Fetcher = (path: string, params?: Record<string, unknown>) => Promise<Response>;

function pickFetcher(requestPath: string, openAlexApiKey?: string): { path: string; fetcher: Fetcher } {
    const segments = requestPath.split("/").filter(Boolean);
    const [source, ...rest] = segments;
    const routedPath = `/${rest.join("/")}`;

    switch (source) {
        case "openalex":
            return {
                path: routedPath,
                fetcher: (p, params) => openAlexFetch(p, params, { apiKey: openAlexApiKey }),
            };
        case "crossref":
            return { path: routedPath, fetcher: crossrefFetch };
        case "orcid":
            return { path: routedPath, fetcher: orcidFetch };
        case "ror":
            return { path: routedPath, fetcher: rorFetch };
        case "openaire":
            return { path: routedPath, fetcher: openAireFetch };
        default:
            throw new Error(
                `Unknown scholarly graph API namespace '${source}'. Use paths starting with /openalex, /crossref, /orcid, /ror, or /openaire.`,
            );
    }
}

export function createScholarlyGraphApiFetch(openAlexApiKey?: string): ApiFetchFn {
    return async (request) => {
        const { path, fetcher } = pickFetcher(request.path, openAlexApiKey);
        const response = await fetcher(path, request.params as Record<string, unknown> | undefined);

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
