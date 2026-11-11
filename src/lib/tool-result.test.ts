import {beforeEach, expect, it, vi} from "vitest";
import {scholarlyResponse} from "./tool-result";
const stage = vi.hoisted(() => vi.fn());
vi.mock("@bio-mcp/shared/staging/utils", () => ({shouldStage: (bytes: number) => bytes > 30 * 1024, stageToDoAndRespond: stage}));
beforeEach(() => { stage.mockReset().mockResolvedValue({dataAccessId: "fixture", _staging: {data_access_id: "fixture", tables_created: ["payloads"], total_rows: 1}}); });
const response = (text: string, failed = false) => ({content: [{type: "text" as const, text}], structuredContent: {success: !failed, data: {text}, _meta: {citation: {result_hash: "original"}}}});
it("preserves small complete responses and makes structured failures explicit", async () => {
  const small = response("small");
  expect(await scholarlyResponse(async () => small, {}, "sql", {})).toEqual(small);
  expect(await scholarlyResponse(async () => response("failure", true), {}, "sql", {})).toEqual({...response("failure", true), isError: true});
  expect(stage).not.toHaveBeenCalled();
});
it.each([false, true])("stages the whole multibyte response with error status %s and request scope", async failed => {
  const original = response("α".repeat(20000), failed);
  const env = {SCHOLARLY_GRAPH_DATA_DO: {} as DurableObjectNamespace};
  const scope = {sessionId: "test"};
  const result = await scholarlyResponse(async () => original, env, "sql", scope);
  expect(stage.mock.calls[0][0]).toEqual({...original, ...(failed ? {isError: true} : {})});
  expect(stage.mock.calls[0][6]).toBe(scope);
  expect(result.structuredContent).toEqual({success: !failed, staged: true, data: undefined, data_access_id: "fixture",
    _staging: {data_access_id: "fixture", tables_created: ["payloads"], total_rows: 1}, _meta: original.structuredContent._meta});
  expect(result.isError === true).toBe(failed);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30000);
});
it("returns a bounded error if execution or staging fails", async () => {
  const failed = await scholarlyResponse(async () => {throw new Error("private detail");}, {}, "sql", {});
  expect(failed).toEqual({content: [{type: "text", text: "SCHOLARLY_GRAPH response could not be returned."}], structuredContent: {success: false, error: {code: "RESPONSE_ERROR", message: "SCHOLARLY_GRAPH response could not be returned."}}, isError: true});
  stage.mockRejectedValue(new Error("private staging detail"));
  expect(await scholarlyResponse(async () => response("x".repeat(40000)), {SCHOLARLY_GRAPH_DATA_DO: {} as DurableObjectNamespace}, "sql", {})).toEqual(failed);
});
