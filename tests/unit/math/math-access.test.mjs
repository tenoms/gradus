import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { mergeMathLibraryCatalog } from "../../../src/features/math/library/math-library.ts";
import { mathResponseData, mathResponseError } from "../../../src/features/math/api/math-response.ts";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const source = await readFile(new URL("../../../src/features/math/api/math.ts", import.meta.url), "utf8");
const output = compile(source)
  .replace(/(['"])(?:\.\.\/)+shared\/config\/public\.mjs\1/g, JSON.stringify(new URL("../../../src/shared/config/public.mjs", import.meta.url).href))
  .replace(/import \{ catalogResource, platformRequest, studyFetch \} from ["']\.\.\/\.\.\/\.\.\/shared\/api\/client["'];?/, "const catalogResource=(_key,load)=>load();const platformRequest=(...args)=>globalThis.__mathContentRequest(...args); const studyFetch=()=>{throw new Error('unexpected upload')};")
  .replace(/import \{ mergeMathLibraryCatalog \} from ["']\.\.\/library\/math-library["'];?/, "const {mergeMathLibraryCatalog}=globalThis.__mathContentFixture;")
  .replace(/import \{ mathResponseData, mathResponseError \} from ["']\.\/math-response["'];?/, "const {mathResponseData,mathResponseError}=globalThis.__mathContentFixture;");
globalThis.__mathContentFixture = { mergeMathLibraryCatalog, mathResponseData, mathResponseError };
const adapter = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
globalThis.__mathContentFixture.mathCommand = adapter.mathCommand;
globalThis.__mathContentFixture.mathRows = adapter.mathRows;
const qrOutput = compile(await readFile(new URL("../../../src/features/math/library/math-access.ts", import.meta.url), "utf8"))
  .replace(/import \{ mathCommand, mathRows \} from ["']\.\.\/api\/math["'];?/, "const {mathCommand,mathRows}=globalThis.__mathContentFixture;");
const qr = await import(`data:text/javascript;base64,${Buffer.from(qrOutput).toString("base64")}`);

test("the library keeps all returned books without fetching course grants or allocations", async () => {
  const seen = [];
  const books = [{ ID: 721, Name: "配套教材", IsActCode: 1 }, { ID: 2170, Name: "测评资料" }, { ID: 4893, Name: "另一教材" }];
  globalThis.__mathContentRequest = async (platform, request) => {
    seen.push(request.data.command);
    return { SuccessResponse: true, data: request.data.command === "GetBookPaperListOfVip" ? books : [{ ID: 9900, Name: "历年试卷", BusType: "试卷" }] };
  };
  const result = adapter.mathRows(await adapter.mathApi.books());
  assert.deepEqual(result.map(row => row.ID), [721, 2170, 4893, 9900]);
  assert.deepEqual(seen.sort(), ["GetBookListCountAndLookCount_New", "GetBookPaperListOfVip"]);
  assert.equal(books.length, 3);
});

test("browser math requests leave the authoritative station to the server", async () => {
  const requests = [];
  globalThis.__mathContentRequest = async (_platform, request) => { requests.push(request); return { SuccessResponse: true, data: [] }; };
  await adapter.mathApi.books();
  await adapter.mathApi.analysis(42);
  for (const request of requests) {
    assert.equal(Object.hasOwn(request.query || {}, "System_Station_ID"), false);
    assert.equal(Object.hasOwn(request.data?.data ? JSON.parse(request.data.data) : request.data || {}, "System_Station_ID"), false);
  }
});

test("math saves forward keepalive without changing ordinary POST requests", async () => {
  const calls = [];
  globalThis.__mathContentRequest = async (...args) => {
    calls.push(args);
    return { SuccessResponse: true, data: 19 };
  };
  const path = "/api/c_course_users_record/Inner_c_course_users_record";
  const progress = { CourseID: 10, CalendarID: 20, ProductID: 30, BusType: 2, BusID: 40, BusValue: 27 };
  assert.equal(adapter.mathData(await adapter.mathPost(path, progress, { keepalive: true })), 19);
  await adapter.mathPost("/api/sys_user_record/Inner_sys_user_record", { Type: "笔记" });
  assert.deepEqual(calls, [
    ["math", { path, method: "POST", data: progress }, { keepalive: true }],
    ["math", { path: "/api/sys_user_record/Inner_sys_user_record", method: "POST", data: { Type: "笔记" } }],
  ]);
});

test("QR lookup requests content directly and preserves every returned row", async () => {
  const seen = [];
  const rows = [{ ID: 1, IsLogin: 1 }, { ID: 2, IsActCode: 1 }];
  globalThis.__mathContentRequest = async (platform, request) => {
    seen.push(request);
    return { SuccessResponse: true, data: rows };
  };
  assert.deepEqual(await qr.resolveMathBookQrcode("fixture-code"), rows);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, "/api/Master/Model");
  assert.equal(seen[0].data.command, "GetCourseQrcodeInfo");
  assert.deepEqual(JSON.parse(seen[0].data.data), { qrcode: "fixture-code" });
});
