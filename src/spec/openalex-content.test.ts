import {expect, it, vi} from "vitest";
import {contentWorkflow} from "./openalex-content";
import {scholarlyGraphCatalog} from "./catalog";

const work = {id: "https://openalex.org/W3038568908", doi: "https://doi.org/10.1/fixture", has_content: {grobid_xml: true}, best_oa_location: {license: "cc-by"}};
const run = (get: ReturnType<typeof vi.fn>, query = vi.fn()) => new Function("api", `return (async () => {${contentWorkflow.code}})()`)({get, query});
it("discovers both content formats with credential and byte-limit guidance", () => {
  const endpoints = scholarlyGraphCatalog.endpoints.filter(endpoint => endpoint.category === "openalex.content");
  expect(endpoints.map(endpoint => endpoint.path)).toEqual(["/openalex/content/works/{id}.pdf", "/openalex/content/works/{id}.grobid-xml"]);
  expect(scholarlyGraphCatalog.endpointCount).toBe(scholarlyGraphCatalog.endpoints.length);
});
it("executes metadata-to-content composition retaining license context", async () => {
  const content = {chunks: [{text: "<TEI>native</TEI>"}]};
  const get = vi.fn().mockResolvedValueOnce(work).mockResolvedValueOnce(content);
  expect(await run(get)).toEqual({work, content});
  expect(get.mock.calls[1][0]).toBe("/openalex/content/works/W3038568908.grobid-xml");
  expect(get).toHaveBeenCalledTimes(2);
});
it("uses staged SQL in the same execution and labels previews as partial", async () => {
  const content = {__staged: true, data_access_id: "fixture"};
  const get = vi.fn().mockResolvedValueOnce(work).mockResolvedValueOnce(content);
  const query = vi.fn().mockResolvedValue({rows: [{text_preview: "<TEI>"}]});
  expect(await run(get, query)).toEqual({work, content, preview: {rows: [{text_preview: "<TEI>"}]}, preview_is_complete: false});
  expect(query).toHaveBeenCalledWith("fixture", expect.stringContaining("FROM openalex_content_chunks ORDER BY chunk_index LIMIT 1"));
});
it.each([{...work, has_content: {grobid_xml: false}}, {__api_error: true}, {__staged: true}, {...work, id: "not-a-canonical-work"}])("stops before paid retrieval when metadata is unavailable or unsuitable", async metadata => {
  const get = vi.fn().mockResolvedValueOnce(metadata);
  expect(await run(get)).toMatchObject({work: metadata}); expect(get).toHaveBeenCalledTimes(1);
});
it("returns a content error without claiming empty text", async () => {
  const content = {__api_error: true, status: 404};
  expect(await run(vi.fn().mockResolvedValueOnce(work).mockResolvedValueOnce(content))).toEqual({work, content});
});
