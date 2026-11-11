import { afterEach, describe, expect, it, vi } from "vitest";
import { createScholarlyGraphApiFetch } from "./api-adapter";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAlex current authentication and search", () => {
  it("keeps basic anonymous access without inventing a contact address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await createScholarlyGraphApiFetch()({ method: "GET", path: "/openalex/works", params: { search: "dna", per_page: 1 } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.openalex.org/works?search=dna&per_page=1");
    expect(new Headers(options.headers).has("Authorization")).toBe(false);
    expect(JSON.stringify(options)).not.toContain("example.com");
  });

  it("uses the configured header credential and preserves quota and cost responses", async () => {
    const payload = { daily_budget: 1, remaining_budget: 0.9 };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...payload, api_key: "fixture-key" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createScholarlyGraphApiFetch("fixture-key")({ method: "GET", path: "/openalex/rate-limit", params: { api_key: "caller-value" } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.openalex.org/rate-limit");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer fixture-key");
    expect(result).toEqual({ status: 200, data: payload });
    expect(JSON.stringify(result)).not.toContain("fixture-key");
  });

  it("explains missing configuration for account usage without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createScholarlyGraphApiFetch()({ method: "GET", path: "/openalex/rate-limit" })).rejects.toThrow("OPENALEX_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["/openalex//rate-limit", "//openalex/rate-limit", "/openalex/rate-limit?extra=true"])("redacts echoed credentials for equivalent routed path %s", async (path) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ api_key: "fixture-key", rate_limit: { remaining: 1 } })));
    const result = await createScholarlyGraphApiFetch("fixture-key")({ method: "GET", path });
    expect(result.data).toEqual({ rate_limit: { remaining: 1 } });
  });

  it.each([
    ["search", '"climate change"~5'],
    ["search.exact", "machin*"],
    ["search.semantic", "predicting drug toxicity from molecular structure"],
  ])("preserves %s query syntax and returned meta", async (parameter, value) => {
    const payload = { meta: { count: 1, cost_usd: 0.001, next_cursor: "next" }, results: [{ id: "W1" }] };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createScholarlyGraphApiFetch("fixture-key")({ method: "GET", path: "/openalex/works", params: { [parameter]: value, per_page: 1 } });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get(parameter)).toBe(value);
    expect(result.data).toEqual(payload);
  });
});

describe("OpenAIRE Graph v3 routing", () => {
  it.each(["projects", "research-products"])("routes %s searches with keyword and cursor paging", async (entity) => {
    const payload = { header: { numFound: 2, nextCursor: "next-token" }, results: [{ id: "example-id" }] };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createScholarlyGraphApiFetch()({ method: "GET", path: `/openaire/${entity}`, params: { search: "cancer", pageSize: 1, cursor: "*" } });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(`https://api.openaire.eu/graph/v3/${entity}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: "cancer", pageSize: "1", cursor: "*" });
    expect(result).toEqual({ status: 200, data: payload });
  });

  it.each([
    [{ query: "old keyword" }, "old keyword"],
    [{ query: "old keyword", search: "explicit keyword" }, "explicit keyword"],
  ])("supports the previous query parameter without overriding explicit search", async (params, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await createScholarlyGraphApiFetch()({ method: "GET", path: "/openaire/projects", params });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("search")).toBe(expected);
    expect(url.searchParams.has("query")).toBe(false);
  });

  it("preserves provider project identifiers for single-record retrieval", async () => {
    const id = "corda__h2020::2f32bdaa3c76066bd8267f3ac90ba898";
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id }));
    vi.stubGlobal("fetch", fetchMock);
    await createScholarlyGraphApiFetch()({ method: "GET", path: `/openaire/projects/${id}` });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.openaire.eu/graph/v3/projects/${id}`);
  });
});
