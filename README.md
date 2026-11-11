# Scholarly Graph MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream Scholarly Graph API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The server is deployed and ready at:

```
https://scholarly-graph-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "scholarly-graph": {
      "command": "npx",
      "args": ["mcp-remote", "https://scholarly-graph-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8819/mcp` (start it with `./scripts/dev-servers.sh scholarly-graph`):

```json
{
  "mcpServers": {
    "scholarly-graph-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8819/mcp"]
    }
  }
}
```

## Tools

OpenAlex's [current authentication guidance](https://help.openalex.org/api/authentication/) permits basic anonymous access. Configure `OPENALEX_API_KEY` as a Worker secret for production workloads and account usage lookup. Configured keys are sent as Bearer headers; the adapter no longer invents a contact email. `api.get('/openalex/rate-limit')` reports usage with the upstream's echoed credential removed. Preserve response `meta` fields for request costs and pagination.

For work discovery, choose one of `search`, `search.exact` (unstemmed; supports wildcards), or `search.semantic`. Proximity example: `{ search: '"climate change"~5', per_page: 1 }`. Semantic search has a 50-result cap, uses up to 2,000 query characters, and permits one request/second; use it for discovery rather than exhaustive review recall. The current standard page maximum is 100. See [keyword search](https://help.openalex.org/api/searching/) and [semantic search](https://help.openalex.org/api/semantic-search/).

OpenAIRE paths use the [Graph API v3 contract](https://graph.openaire.eu/docs/apis/graph-api/). For example, `api.get('/openaire/projects', { search: 'cancer', pageSize: 1 })` returns `{header, results}`. Use `cursor: '*'` and then `header.nextCursor` for deep paging; stop when the cursor stops advancing. The previous `query` parameter remains a compatibility alias for `search`. Project funding/year filters and research-product type, peer-review, and aggregate-statistics filters are discoverable in the catalog.

- `scholarly_graph_search` — discover available API operations and bounded workflows through the Code Mode catalog
- `scholarly_graph_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `scholarly_graph_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `scholarly_graph_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.

All four tool families also register the `mcp_` alias. Code Mode still composes API calls in one execution and queries staged responses with `api.query()`; large SQL/schema/tool results also stage through the existing Durable Object storage.

## Crossref pagination and rate limits

The adapter follows Crossref's [July 2026 limits](https://community.crossref.org/t/refining-rest-api-limits-for-improved-stability-and-reliability/16137) and [August cursor changes](https://community.crossref.org/t/changes-to-cursors-filtering-and-sorting-in-the-rest-api/16246). Search the catalog for `crossref cursor` for a bounded two-page recipe. Follow `_crossref.next_request`: it contains the latest cursor and all original parameters. Native fields remain intact. A short page stops continuation, but mutable results can duplicate or omit records; `_crossref.completeness` remains `not_established`.

`_crossref.headers` retains rate and Retry-After headers. The Worker paces list and single-record requests separately, honors slower reported limits and 429 cooldowns, and returns an explicit error when a wait exceeds the call budget. This is per-isolate pacing, not coordination across Workers or other clients. Supply `mailto` only with a real contact address. The adapter does not invent one or automatically retry 429 responses.

Crossref reads accept bodyless GET requests and `rows` from 0 to 1000. Cursor requests cannot combine `offset` or publication-date sorts (`issued`, `published`, `published-print`, `published-online`). Responses over 4 MiB require fewer rows or selected fields. Responses above the normal staging threshold retain the complete envelope in storage; if long continuation metadata cannot fit inline, retrieve `_crossref.next_request` from the staged `payloads` record before continuing.

For a raw Code Mode DOI lookup, encode the complete DOI as one path segment:
`api.get('/crossref/works/' + encodeURIComponent('10.1136/bmj.n71'))`.
Generated endpoint helpers encode their DOI argument automatically. Keep the
returned DOI when joining OpenAlex and Crossref; a title match alone is weaker evidence.

## OpenAlex content

Code Mode can retrieve one cached file with `/openalex/content/works/{id}.pdf` or `.grobid-xml`, using `OPENALEX_API_KEY`. Discover candidates with `has_content.pdf:true` or `has_content.grobid_xml:true` in the metadata filter, and retain `has_content`, `content_urls` and `best_oa_location`. Downloads consume the provider's usage allowance. See [OpenAlex fulltext access](https://help.openalex.org/access/fulltext/).

The adapter follows the [official client's authentication flow](https://github.com/ourresearch/openalex-official/blob/main/src/openalex_cli/api_client.py): Bearer authentication at the content host, then one signed redirect to the documented R2 storage account without forwarding the key. Credentials, signed URLs and upstream error bodies are excluded from returned errors. A changed storage host requires revalidation. Downloads have a 30-second deadline and an 8 MiB default byte cap; `max_bytes` can increase it to 16 MiB. The cap applies to compressed and decompressed bytes. Errors return no partial file and trigger no automatic retry.

Results contain `_openalex_content` identity, byte count and SHA-256, quota headers, and ordered `chunks`. Decode each chunk's `base64` separately, concatenate in `chunk_index` order, then verify the checksum. XML chunks also provide UTF-8 `text`; concatenating these preserves the decoded XML. Large results use the existing `openalex_content_chunks` staged table. Search `openalex content` for a recipe that retrieves one TEI document and queries a bounded preview within the same Code Mode execution.

Quota headers preserve the provider's USD cost, limit, remaining and prepaid
amounts separately from legacy credit counts. Values stay native strings; absent
headers remain null. On a signed redirect, these are the content service's headers,
not the storage response's. No conversion between dollars and credits is inferred.

Only format prefixes are checked; the adapter does not validate PDF structure, parse XML or extract article text. GROBID errors and legacy XML shapes are retained. File availability does not establish license rights; use the work's original license. These are single-file API reads, not an archive sync.

## Selected live acceptance — October 3, 2026

The local Worker under Wrangler 4.85 passes the live contract harness (nine checks;
the generic harness does not trigger staging). Separate acceptance runs exercise
265 MCP calls across current Crossref pages, OpenAlex content and OpenAIRE v3.
Three Crossref cursor pages and a staged 100-record page match native responses.
The OpenAlex DOI for the PRISMA 2020 statement resolves to the same Crossref record.
Its 965,446-byte PDF and 170,388-byte TEI are recovered completely through staged
SQL, matching independently retrieved native bytes and SHA-256. Both aliases,
60,000-character staged SQL results, query errors and schema reads pass.

Both published catalog recipes execute successfully, including the in-program
content SQL preview. OpenAIRE project and publication searches match native
records, and publication cursor continuation returns the next record. These are
selected live checks, not exhaustive source coverage or production deployment.
The tested content service returned HTTP 200 directly; the signed-storage hop has
provider-documentation and fixture coverage, not a live redirect observation.

## Development

```bash
./scripts/dev-servers.sh scholarly-graph            # run locally (port 8819)
pnpm --filter scholarly-graph-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from OpenAlex, Crossref, ORCID, ROR, OpenAIRE and stays under the terms of that source: OpenAlex/ROR CC0; ORCID public CC0; Crossref facts open, abstracts copyrighted.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
