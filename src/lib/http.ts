import { restFetch, type RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const OPENALEX_BASE = "https://api.openalex.org";
const CROSSREF_BASE = "https://api.crossref.org";
const ORCID_BASE = "https://pub.orcid.org/v3.0";
const ROR_BASE = "https://api.ror.org/v2";
const OPENAIRE_BASE = "https://api.openaire.eu/graph/v3";

interface ScholarlyFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
    accept?: string;
}

function scholarlyFetch(
    baseUrl: string,
    userAgent: string,
    path: string,
    params?: Record<string, unknown>,
    opts?: ScholarlyFetchOptions,
): Promise<Response> {
    const headers: Record<string, string> = {
        Accept: opts?.accept ?? "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(opts?.baseUrl ?? baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent,
    });
}

export function openAlexFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: ScholarlyFetchOptions & { apiKey?: string },
): Promise<Response> {
    // Current OpenAlex docs allow basic anonymous access. Configured credentials
    // travel in the supported header, not query strings or a fictitious mailto.
    const mergedParams: Record<string, unknown> = { ...params };
    const headers = { ...opts?.headers };
    const apiKey = opts?.apiKey?.trim();
    if (apiKey) {
        delete mergedParams.api_key;
        headers.Authorization = `Bearer ${apiKey}`;
    }
    if (path === "/rate-limit" && !apiKey) {
        throw new Error("OpenAlex usage lookup requires OPENALEX_API_KEY in the Worker environment.");
    }

    return scholarlyFetch(
        OPENALEX_BASE,
        "scholarly-graph-mcp-server/1.0 (bio-mcp; OpenAlex)",
        path,
        mergedParams,
        {
            ...opts,
            headers,
            // OpenAlex can be slow for large work searches — give it more time
            timeout: opts?.timeout ?? 60_000,
        },
    );
}

export function crossrefFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: ScholarlyFetchOptions,
): Promise<Response> {
    return scholarlyFetch(
        CROSSREF_BASE,
        "scholarly-graph-mcp-server/1.0 (bio-mcp; Crossref)",
        path,
        params,
        opts,
    );
}

export function orcidFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: ScholarlyFetchOptions,
): Promise<Response> {
    return scholarlyFetch(
        ORCID_BASE,
        "scholarly-graph-mcp-server/1.0 (bio-mcp; ORCID)",
        path,
        params,
        {
            ...opts,
            accept: opts?.accept ?? "application/json",
        },
    );
}

export function rorFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: ScholarlyFetchOptions,
): Promise<Response> {
    return scholarlyFetch(
        ROR_BASE,
        "scholarly-graph-mcp-server/1.0 (bio-mcp; ROR)",
        path,
        params,
        opts,
    );
}

export function openAireFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: ScholarlyFetchOptions,
): Promise<Response> {
    // Preserve the old catalog's keyword spelling while using the v3 contract.
    const { query, ...graphParams } = params ?? {};
    if (query !== undefined && graphParams.search === undefined) {
        graphParams.search = query;
    }
    return scholarlyFetch(
        OPENAIRE_BASE,
        "scholarly-graph-mcp-server/1.0 (bio-mcp; OpenAIRE)",
        path,
        graphParams,
        opts,
    );
}
