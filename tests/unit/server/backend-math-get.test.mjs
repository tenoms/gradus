import test from "node:test";
import assert from "node:assert/strict";
import { createUpstreamClient } from "../../../server/integrations/upstream.mjs";
import { readPlatformDefaults } from "../../../server/integrations/platform-config.mjs";

test("math GETs keep the original timestamp cache avoidance for real write readback", async () => {
  const before = Date.now(), calls = [];
  const client = createUpstreamClient(readPlatformDefaults({ env: {}, readLocal: false }), {
    requestJson: async (url, options) => { calls.push({ url: new URL(url), options }); return { code: 0, data: [] }; },
  });
  await client.mathRequest("/api/sys_users_info/GetListByAll", { query: { StuID: "fixture-student", t: 1 } }, { token: "fixture-token" });
  assert.equal(calls[0].url.searchParams.get("StuID"), "fixture-student");
  assert.ok(Number(calls[0].url.searchParams.get("t")) >= before);
  assert.equal(calls[0].url.searchParams.getAll("t").length, 1);
  assert.equal(calls[0].options.method, "GET");
});
