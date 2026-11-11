import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import {crossrefWorkflow} from "./crossref-workflow";
import {contentEndpoints, contentWorkflow} from "./openalex-content";

export const scholarlyGraphCatalog: ApiCatalog = {
    workflows: [crossrefWorkflow, contentWorkflow],
    name: "Scholarly Graph (OpenAlex + Crossref + ORCID + ROR + OpenAIRE)",
    baseUrl: "https://multi-api.local/scholarly-graph",
    version: "0.1",
    auth: "OpenAlex: OPENALEX_API_KEY recommended for production and required for quota lookup/content downloads; basic anonymous metadata queries supported",
    endpointCount: 21,
    notes:
        "- Multi-API REST server. Prefix every path with /openalex, /crossref, /orcid, /ror, or /openaire.\n" +
        "- Citations identify this multi-source gateway. Retain provider names and source record identifiers when combining results; licensing depends on each upstream, not a blanket OpenAlex license.\n" +
        "- OpenAIRE routes use Graph API v3. Search responses contain {header, results}; header.nextCursor continues cursor paging. Pages start at 1, pageSize is 1–100. Offset paging is limited to 10,000 results; use cursor='*' for deeper traversal and stop when nextCursor does not advance.\n" +
        "- OpenAlex and Crossref are the strongest v1 discovery surfaces. ORCID and ROR mainly support identity resolution.\n" +
        "- OpenAlex credentials: configure OPENALEX_API_KEY on the Worker; it is sent as a Bearer header. Content downloads require the key and consume its usage allowance. Basic metadata access uses the smaller keyless budget. Never put credentials in scripts.\n" +
        "- OpenAlex quota: /openalex/rate-limit reports account usage. Preserve the upstream meta block, including cost and cursor information.\n" +
        "- OpenAlex text search: use search= (not default.search). Boolean AND/OR/NOT, quoted phrases and proximity such as \"climate change\"~5 are supported. Wildcards require search.exact. Only one search mode per request. Keep complete URLs under about 4KB; split large OR queries and deduplicate work IDs.\n" +
        "- Crossref: follow _crossref.next_request with all original parameters. Cursors change each page; results may contain duplicates or omissions as metadata changes. Prefer narrow created-date windows. Cursor sorting by issued/published/published-print/published-online is unsupported.\n" +
        "- Crossref _crossref.headers retains rate-limit and Retry-After headers. Pacing is per Worker isolate, not a global quota guarantee; respect 429 responses across clients. Optional mailto must be your real contact address. Reads are bodyless GET, rows 0–1000, with a 4 MiB response bound; reduce rows/select on oversized responses.\n" +
        "- Preserve DOI, ORCID, ROR, and source-specific IDs in staged tables.",
    endpoints: [
        ...contentEndpoints,
        {
            method: "GET",
            path: "/openalex/rate-limit",
            summary: "Read the configured OpenAlex account's usage and remaining budget (requires OPENALEX_API_KEY)",
            category: "openalex.usage",
            example: "return await api.get('/openalex/rate-limit');",
        },
        {
            method: "GET",
            path: "/openalex/works",
            summary: "Search or filter scholarly works in OpenAlex",
            category: "openalex.works",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Free-text search query. NOTE: ranks by text+citation relevance and is topically NOISY — a broad term (e.g. 'breast cancer') sorted by citations pulls in unrelated highly-cited papers. For precision, resolve a concept/topic id via /openalex/concepts or /openalex/topics and use filter=concepts.id:<id> / filter=topics.id:<id> instead." },
                { name: "search.exact", type: "string", required: false, description: "Unstemmed search. Use for wildcards, e.g. machin*; at least 3 characters before wildcard, no leading wildcard. Choose only one of search, search.exact, search.semantic." },
                { name: "search.semantic", type: "string", required: false, description: "Meaning-based search, at most 2000 input characters and 50 results; 1 request/second. Cannot combine with keyword search or cited_by_count/country_code filters. Use for discovery, not exhaustive review recall." },
                { name: "filter", type: "string", required: false, description: "OpenAlex filter expression. Comma-combine for AND. Examples: 'from_publication_date:2023-01-01', 'concepts.id:C<id>' and 'topics.id:T<id>' (resolve the id first via /openalex/concepts?search=... or /openalex/topics?search=...), 'primary_topic.id:T<id>'. Concept/topic filtering is far more precise than free-text 'search' for a subject area." },
                { name: "sort", type: "string", required: false, description: "Sort order (e.g. 'cited_by_count:desc', 'publication_year:desc', 'relevance_score:desc')" },
                { name: "select", type: "string", required: false, description: "Comma-separated fields to return. Valid: id,doi,title,display_name,publication_year,publication_date,type,cited_by_count,is_retracted,is_paratext,primary_location,best_oa_location,has_content,content_urls,open_access,authorships,biblio,concepts,topics,keywords,mesh,referenced_works,related_works. AVOID 'authorships' if response size is a concern — it is deeply nested and can trigger auto-staging." },
                { name: "per_page", type: "number", required: false, description: "Results per page (max 100, default 25). Use per_page not per-page." },
                { name: "cursor", type: "string", required: false, description: "Pagination cursor (use '*' for first page)" },
            ],
        },
        {
            method: "GET",
            path: "/openalex/works/{id}",
            summary: "Get a single work by OpenAlex ID or DOI",
            category: "openalex.works",
            pathParams: [
                { name: "id", type: "string", required: true, description: "OpenAlex work ID (e.g. 'W2741809807') or DOI (e.g. 'https://doi.org/10.1038/...')" },
            ],
        },
        {
            method: "GET",
            path: "/openalex/authors",
            summary: "Search authors in OpenAlex by name. Returns h-index, citations, works count, institutions.",
            category: "openalex.authors",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Author name search (e.g. 'Daniel Drucker'). Topic keyword searches return empty — use name-based queries." },
                { name: "filter", type: "string", required: false, description: "OpenAlex filter expression (e.g. 'last_known_institutions.id:I27837315')" },
                { name: "sort", type: "string", required: false, description: "Sort order (e.g. 'cited_by_count:desc')" },
                { name: "select", type: "string", required: false, description: "Comma-separated fields. Valid: id,orcid,display_name,display_name_alternatives,relevance_score,works_count. NOTE: cited_by_count, h_index, summary_stats, last_known_institutions are NOT valid select fields — omit 'select' entirely to get full author objects with all fields." },
                { name: "per_page", type: "number", required: false, description: "Results per page (max 100, default 25)" },
            ],
        },
        {
            method: "GET",
            path: "/openalex/institutions",
            summary: "Search institutions in OpenAlex by name",
            category: "openalex.institutions",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Institution name search (e.g. 'Harvard University'). Topic keyword searches return empty — use name-based queries." },
                { name: "filter", type: "string", required: false, description: "OpenAlex filter expression (e.g. 'country_code:US', 'type:education')" },
                { name: "sort", type: "string", required: false, description: "Sort order (e.g. 'cited_by_count:desc')" },
                { name: "select", type: "string", required: false, description: "Comma-separated fields. Valid: id,ror,display_name,relevance_score,works_count,cited_by_count,country_code,type. Omit to get full objects." },
                { name: "per_page", type: "number", required: false, description: "Results per page (max 100, default 25)" },
            ],
        },
        {
            method: "GET",
            path: "/openalex/concepts",
            summary: "Search OpenAlex concepts (subject areas) by name to resolve a concept id for filter=concepts.id:<id>",
            category: "openalex.concepts",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Concept name search (e.g. 'breast cancer'). Take the top result's id (format 'C<number>'), then filter works with filter=concepts.id:<id>." },
                { name: "filter", type: "string", required: false, description: "OpenAlex filter expression (e.g. 'level:0', 'ancestors.id:C<id>')" },
                { name: "select", type: "string", required: false, description: "Comma-separated fields. Valid: id,display_name,level,description,works_count,cited_by_count,ancestors,related_concepts." },
                { name: "per_page", type: "number", required: false, description: "Results per page (max 100, default 25)" },
            ],
        },
        {
            method: "GET",
            path: "/openalex/topics",
            summary: "Search OpenAlex topics (the newer, finer-grained subject taxonomy) by name to resolve a topic id for filter=topics.id:<id>",
            category: "openalex.topics",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Topic name search (e.g. 'breast cancer therapy'). Take the top result's id (format 'T<number>'), then filter works with filter=topics.id:<id> or filter=primary_topic.id:<id>." },
                { name: "filter", type: "string", required: false, description: "OpenAlex filter expression (e.g. 'domain.id:<id>', 'field.id:<id>')" },
                { name: "select", type: "string", required: false, description: "Comma-separated fields. Valid: id,display_name,description,works_count,cited_by_count,domain,field,subfield,keywords." },
                { name: "per_page", type: "number", required: false, description: "Results per page (max 100, default 25)" },
            ],
        },
        {
            method: "GET",
            path: "/crossref/works",
            summary: "Search Crossref works by query, filter, or bibliographic fields",
            category: "crossref.works",
            queryParams: [
                { name: "query", type: "string", required: false, description: "Crossref query string" },
                { name: "filter", type: "string", required: false, description: "Crossref filter string" },
                { name: "rows", type: "number", required: false, description: "Rows per page, 0–1000 (0 requests metadata only)" },
                { name: "cursor", type: "string", required: false, description: "Start with *. Use the latest message.next-cursor and repeat every original parameter; _crossref.next_request supplies a continuation. Results are mutable." },
                { name: "sort", type: "string", required: false, description: "Native sort field. Cursors cannot sort by issued, published, published-print or published-online." },
                { name: "order", type: "string", required: false, description: "Sort direction: asc or desc" },
                { name: "select", type: "string", required: false, description: "Comma-separated native fields; retain DOI for identity checks" },
                { name: "mailto", type: "string", required: false, description: "Your real contact email for the polite pool. Limits can be shared by email across clients." },
            ],
        },
        {
            method: "GET",
            path: "/crossref/works/{doi}",
            summary: "Get Crossref work metadata by DOI",
            category: "crossref.works",
            description: "For raw api.get paths, encode the entire DOI with encodeURIComponent, including its slash: api.get('/crossref/works/' + encodeURIComponent('10.1136/bmj.n71')). Generated endpoint helpers encode path parameters automatically. Preserve the returned DOI when joining providers.",
            pathParams: [
                { name: "doi", type: "string", required: true, description: "Complete DOI, for example 10.1136/bmj.n71. Encode it as one path segment when calling raw api.get." },
            ],
        },
        {
            method: "GET",
            path: "/crossref/funders",
            summary: "Search Crossref funders",
            category: "crossref.funders",
            queryParams: [
                { name: "query", type: "string", required: false, description: "Funder search string" },
                { name: "rows", type: "number", required: false, description: "Number of rows to return" },
            ],
        },
        {
            method: "GET",
            path: "/crossref/funders/{id}",
            summary: "Get Crossref funder by identifier",
            category: "crossref.funders",
            pathParams: [
                { name: "id", type: "string", required: true, description: "Crossref funder ID" },
            ],
        },
        {
            method: "GET",
            path: "/orcid/{orcid}/record",
            summary: "Get a public ORCID record",
            category: "orcid.record",
            pathParams: [
                { name: "orcid", type: "string", required: true, description: "ORCID iD" },
            ],
        },
        {
            method: "GET",
            path: "/orcid/{orcid}/works",
            summary: "Get works section for a public ORCID record",
            category: "orcid.works",
            pathParams: [
                { name: "orcid", type: "string", required: true, description: "ORCID iD" },
            ],
        },
        {
            method: "GET",
            path: "/orcid/search",
            summary: "Search ORCID public records",
            category: "orcid.search",
            queryParams: [
                { name: "q", type: "string", required: true, description: "ORCID search query" },
            ],
        },
        {
            method: "GET",
            path: "/ror/organizations",
            summary: "Search ROR organizations",
            category: "ror.organizations",
            queryParams: [
                { name: "query", type: "string", required: false, description: "ROR search query" },
                { name: "affiliation", type: "string", required: false, description: "Affiliation matching input" },
            ],
        },
        {
            method: "GET",
            path: "/ror/organizations/{id}",
            summary: "Get a ROR organization by ID",
            category: "ror.organizations",
            pathParams: [
                { name: "id", type: "string", required: true, description: "ROR ID" },
            ],
        },
        {
            method: "GET",
            path: "/openaire/projects",
            summary: "Search OpenAIRE projects",
            category: "openaire.projects",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Keyword search across project content" },
                { name: "fundingShortName", type: "string", required: false, description: "Funder short name, e.g. EC" },
                { name: "fromStartYear", type: "number", required: false, description: "Earliest project start year" },
                { name: "page", type: "number", required: false, description: "Page number (starts at 1); do not combine with cursor", default: 1 },
                { name: "pageSize", type: "number", required: false, description: "Results per page (1–100)", default: 10 },
                { name: "cursor", type: "string", required: false, description: "Start with *; continue using header.nextCursor" },
                { name: "sortBy", type: "string", required: false, description: "Project sort directive, default relevance DESC" },
            ],
        },
        {
            method: "GET",
            path: "/openaire/projects/{id}",
            summary: "Get a single OpenAIRE project",
            category: "openaire.projects",
            pathParams: [
                { name: "id", type: "string", required: true, description: "OpenAIRE project ID" },
            ],
        },
        {
            method: "GET",
            path: "/openaire/research-products",
            summary: "Search OpenAIRE research products",
            category: "openaire.research-products",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Keyword search across research product content" },
                { name: "type", type: "string", required: false, description: "Research product type, e.g. publication, dataset, software, other" },
                { name: "isPeerReviewed", type: "boolean", required: false, description: "Filter by peer-review status" },
                { name: "includeStats", type: "boolean", required: false, description: "Include aggregate citation and product-type counts in header" },
                { name: "page", type: "number", required: false, description: "Page number (starts at 1); do not combine with cursor", default: 1 },
                { name: "pageSize", type: "number", required: false, description: "Results per page (1–100)", default: 10 },
                { name: "cursor", type: "string", required: false, description: "Start with *; continue using header.nextCursor" },
                { name: "sortBy", type: "string", required: false, description: "Research product sort directive, e.g. citationCount DESC" },
            ],
        },
    ],
};
