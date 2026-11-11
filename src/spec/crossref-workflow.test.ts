import {expect, it, vi} from "vitest";
import {crossrefWorkflow} from "./crossref-workflow";

const execute = (get: ReturnType<typeof vi.fn>) => new Function("api", `return (async () => {${crossrefWorkflow.code}})()` )({get});
it("runs a bounded sequence following the latest full request and preserves duplicate observations", async () => {
  const next = {path: "/crossref/works", params: {cursor: "second", rows: 20, filter: "original"}};
  const last = {...next, params: {...next.params, cursor: "third"}};
  const firstPage = {message: {items: [{DOI: "a"}]}, _crossref: {next_request: next}};
  const secondPage = {message: {items: [{DOI: "a"}]}, _crossref: {next_request: last}};
  const get = vi.fn().mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);
  expect(await execute(get)).toEqual({pages: [firstPage, secondPage], next_request: last, completeness: "not_established", snapshot_is_atomic: false});
  expect(get).toHaveBeenCalledTimes(2); expect(get.mock.calls[1]).toEqual([next.path, next.params]);
});
it.each([{__api_error: true, status: 429}, {__staged: true, data_access_id: "fixture"}])("stops on errors or staged metadata requiring retrieval", async page => {
  const get = vi.fn().mockResolvedValue(page);
  expect(await execute(get)).toMatchObject({pages: [page], incomplete: true});
  expect(get).toHaveBeenCalledTimes(1);
});
it("stops when the adapter has no continuation", async () => {
  const get = vi.fn().mockResolvedValue({_crossref: {next_request: null}});
  expect(await execute(get)).toMatchObject({next_request: null, completeness: "not_established"});
  expect(get).toHaveBeenCalledTimes(1);
});
