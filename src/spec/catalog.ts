import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const scholarlyGraphCatalog: ApiCatalog = {
    name: "Scholarly Graph (OpenAlex + Crossref + ORCID + ROR + OpenAIRE)",
    baseUrl: "https://multi-api.local/scholarly-graph",
    version: "0.1",
    auth: "optional_api_key",
    endpointCount: 16,
    notes:
        "- Multi-API REST server. Prefix every path with /openalex, /crossref, /orcid, /ror, or /openaire.\n" +
        "- Catalog-only v1 scaffold. This server is intentionally thin and will grow category coverage over time.\n" +
        "- OpenAlex and Crossref are the strongest v1 discovery surfaces. ORCID and ROR mainly support identity resolution.\n" +
        "- OpenAIRE endpoints are included as a first-pass namespace and may require refinement after live inspection.\n" +
        "- Preserve DOI, ORCID, ROR, and source-specific IDs in staged tables.",
    endpoints: [
        {
            method: "GET",
            path: "/openalex/works",
            summary: "Search or filter scholarly works in OpenAlex",
            category: "openalex.works",
            queryParams: [
                { name: "search", type: "string", required: false, description: "Free-text search query" },
                { name: "filter", type: "string", required: false, description: "OpenAlex filter expression (e.g. 'from_publication_date:2023-01-01', 'default.search:keyword')" },
                { name: "sort", type: "string", required: false, description: "Sort order (e.g. 'cited_by_count:desc', 'publication_year:desc', 'relevance_score:desc')" },
                { name: "select", type: "string", required: false, description: "Comma-separated fields to return. Valid: id,doi,title,display_name,publication_year,publication_date,type,cited_by_count,is_retracted,is_paratext,primary_location,open_access,authorships,biblio,concepts,topics,keywords,mesh,referenced_works,related_works. AVOID 'authorships' if response size is a concern — it is deeply nested and can trigger auto-staging." },
                { name: "per_page", type: "number", required: false, description: "Results per page (max 200, default 25). Use per_page not per-page." },
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
                { name: "per_page", type: "number", required: false, description: "Results per page (max 200, default 25)" },
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
                { name: "per_page", type: "number", required: false, description: "Results per page (max 200, default 25)" },
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
                { name: "rows", type: "number", required: false, description: "Number of rows to return" },
                { name: "cursor", type: "string", required: false, description: "Crossref cursor" },
            ],
        },
        {
            method: "GET",
            path: "/crossref/works/{doi}",
            summary: "Get Crossref work metadata by DOI",
            category: "crossref.works",
            pathParams: [
                { name: "doi", type: "string", required: true, description: "DOI" },
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
                { name: "query", type: "string", required: false, description: "Project search query" },
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
                { name: "query", type: "string", required: false, description: "Research product search query" },
            ],
        },
    ],
};
