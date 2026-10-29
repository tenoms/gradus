import assert from "node:assert/strict";
import { once } from "node:events";
import { createTestDatabase } from "./database.mjs";
import { createApp } from "../../server/app.mjs";
import { platformConfigFixture } from "./platform-config.mjs";

export const testAdmin = { username: "admin", password: "administration-123", displayName: "管理员" };
export const testLearner = (username, yybRef, extra = {}) => ({ username, password: "learner-password-123", displayName: username, yybRef, ...extra });

/** Test clients obtain both cookie and principal from the public authentication response. */
export async function startHttpApp(overrides = {}) {
  const database = overrides.database || await createTestDatabase();
  const app = await createApp({ configurationDefaults: platformConfigFixture(), configurationEnv: {}, ...overrides, database });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { auth, body, method = body === undefined ? "GET" : "POST", headers, ...options } = {}) {
    return fetch(base + route, {
      ...options, method,
      headers: { "content-type": "application/json", ...(auth ? { cookie: auth.cookie, "X-Study-User": auth.userId } : {}), ...headers },
      ...(body === undefined ? {} : { body: typeof body === "string" || body instanceof Buffer ? body : JSON.stringify(body) }),
    });
  }
  async function credentials(response, expectedStatus) {
    assert.equal(response.status, expectedStatus);
    const session = await response.json();
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie, "authentication must issue its own cookie");
    assert.ok(session.user?.id, "authentication must expose the current principal");
    return { cookie: setCookie.split(";")[0], setCookie, userId: session.user.id, session, space: session.space };
  }
  return {
    app, base, request,
    setup: (input = testAdmin) => request("/api/system/setup", { body: input }).then(response => credentials(response, 201)),
    login: (space, username = testAdmin.username, password = testAdmin.password) => request(`/api/${space}/auth/login`, { body: { username, password } }).then(response => credentials(response, 200)),
    async createUser(auth, input) {
      const response = await request("/api/admin/users", { auth, body: input });
      assert.equal(response.status, 201);
      return (await response.json()).user;
    },
    async close() { await new Promise(resolve => server.close(resolve)); await app.locals.close(); },
  };
}
