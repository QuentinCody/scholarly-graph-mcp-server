import { restFetch, type RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const OPENALEX_BASE = "https://api.openalex.org";
const CROSSREF_BASE = "https://api.crossref.org";
const ORCID_BASE = "https://pub.orcid.org/v3.0";
const ROR_BASE = "https://api.ror.org/v2";
const OPENAIRE_BASE = "https://api.openaire.eu";

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
    opts?: ScholarlyFetchOptions,
): Promise<Response> {
    return scholarlyFetch(
        OPENALEX_BASE,
        "scholarly-graph-mcp-server/1.0 (bio-mcp; OpenAlex)",
        path,
        params,
        opts,
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
    return scholarlyFetch(
        OPENAIRE_BASE,
        "scholarly-graph-mcp-server/1.0 (bio-mcp; OpenAIRE)",
        path,
        params,
        opts,
    );
}
