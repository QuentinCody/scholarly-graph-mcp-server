import type {ApiCatalog, WorkflowRecipe} from "@bio-mcp/shared/codemode/catalog";

export const contentEndpoints: ApiCatalog["endpoints"] = ["pdf", "grobid-xml"].map(format => ({
  method: "GET", path: `/openalex/content/works/{id}.${format}`, category: "openalex.content",
  summary: `Download one cached ${format === "pdf" ? "PDF" : "TEI XML"} through the existing Worker key; metered, bounded and losslessly chunked`,
  pathParams: [{name: "id", type: "string", required: true, description: "Canonical OpenAlex Work ID, W followed by digits. Resolve DOI through /openalex/works first."}],
  queryParams: [{name: "max_bytes", type: "number", required: false, description: "Adapter byte cap: default 8388608, maximum 16777216. Applies before and after gzip decompression; oversized files fail without returning partial content."}],
  description: "Requires OPENALEX_API_KEY; consumes provider usage allowance. Check has_content and content_urls first. Returns _openalex_content provenance/checksum, headers and indexed base64 chunks; TEI chunks also have UTF-8 text. Large responses stage to openalex_content_chunks. Content rights remain those of the original work; cached availability is not a license. No Markdown or PDF-to-text conversion is performed.",
}));

export const contentWorkflow: WorkflowRecipe = {
  title: "Discover an OpenAlex work and retrieve one available TEI file",
  description: "One metadata lookup and at most one metered content download. Preserve work metadata and its license; distinguish missing content and errors from empty text. Large content remains available for SQL inspection in the same Code Mode execution.",
  keywords: ["openalex", "content", "fulltext", "tei", "pdf"],
  code: `const work = await api.get('/openalex/works/W3038568908', {select: 'id,doi,title,has_content,content_urls,best_oa_location'});
if (work.__api_error || work.__staged) return {work, next: 'Inspect the metadata response before downloading content.'};
if (!work.has_content?.grobid_xml) return {work, content_available: false};
const id = work.id?.match(/^https:\\/\\/openalex.org\\/(W[0-9]+)$/)?.[1];
if (!id) return {work, error: 'No canonical Work ID returned'};
const content = await api.get('/openalex/content/works/' + id + '.grobid-xml');
if (content.__staged) {
  const preview = await api.query(content.data_access_id, 'SELECT chunk_index, substr(text, 1, 1000) AS text_preview FROM openalex_content_chunks ORDER BY chunk_index LIMIT 1');
  return {work, content, preview, preview_is_complete: false};
}
return {work, content};`,
};
