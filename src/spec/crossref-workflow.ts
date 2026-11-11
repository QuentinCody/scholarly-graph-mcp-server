import type {WorkflowRecipe} from "@bio-mcp/shared/codemode/catalog";

export const crossrefWorkflow: WorkflowRecipe = {
  title: "Crossref bounded cursor retrieval with unchanged filters",
  description: "Retrieve at most two pages, following each new cursor and repeating all parameters. Preserve every observation; mutable results can duplicate or omit works. Staged pages remain queryable and may require retrieving _crossref from the full payload if its metadata is too large to inline. No complete or immutable collection is claimed.",
  keywords: ["crossref", "cursor", "pagination", "rate limit", "works"],
  code: `let request = {path: '/crossref/works', params: {
  filter: 'from-created-date:2026-09-01,until-created-date:2026-09-02',
  select: 'DOI,title,created,indexed', rows: 20, cursor: '*'
}};
const pages = [];
for (let i = 0; i < 2 && request; i++) {
  const page = await api.get(request.path, request.params);
  pages.push(page);
  if (page.__api_error) return {pages, incomplete: true};
  if (!page._crossref) return {pages, incomplete: true, next: 'Retrieve _crossref.next_request from the staged canonical payload before continuing.'};
  request = page._crossref.next_request;
}
return {pages, next_request: request, completeness: 'not_established', snapshot_is_atomic: false};`,
};
