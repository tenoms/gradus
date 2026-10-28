import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createApp,
  injectMathUser,
  validatePlatformRequest,
} from "../server/app.mjs";
import { encryptMath, decodeMath, ApiError } from "../server/upstream.mjs";
import { createCipheriv, createHash } from "node:crypto";

async function serve(overrides, run) {
  const server = createApp(overrides).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (p, options = {}) =>
    fetch(base + p, {
      ...options,
      headers: { "content-type": "application/json", ...options.headers },
    });
  try {
    await run(request, base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const fixtures = {
  yybRequest: async () => [
    {
      id: 7,
      openid: "private-openid",
      nickname: "测试学习者",
      status: "alive",
    },
  ],
  loginPlatform: async (name) => ({
    connected: true,
    token: `private-${name}-token`,
    stuId: "current-student",
    user:
      name === "math"
        ? {
            ID: 9,
            StuID: "current-student",
            UserNick: "测试",
            Pwd: "private-password",
            Tel: "private-phone",
          }
        : { userId: 8, nickName: "测试", phone: "private-phone" },
  }),
};

test("session hides account identifiers, passwords, phone numbers and platform tokens", async () => {
  await serve(fixtures, async (request) => {
    const accounts = await (await request("/api/auth/accounts")).json();
    assert.equal(accounts.accounts[0].ref, "7");
    assert.equal(JSON.stringify(accounts).includes("private-openid"), false);
    const response = await request("/api/auth/connect", {
      method: "POST",
      body: JSON.stringify({ ref: "7" }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const session = await response.json();
    assert.equal(session.platforms.math.user.StuID, "current-student");
    assert.equal(JSON.stringify(session).includes("private-"), false);
    assert.equal(
      (
        await (
          await request("/api/auth/session", { headers: { cookie } })
        ).json()
      ).authenticated,
      true,
    );
    await request("/api/auth/logout", { method: "POST", headers: { cookie } });
    assert.equal(
      (
        await (
          await request("/api/auth/session", { headers: { cookie } })
        ).json()
      ).authenticated,
      false,
    );
  });
});

test("proxy requires session and rejects external, payment, arbitrary and traversal paths", async () => {
  await serve(fixtures, async (request) => {
    assert.equal(
      (await request("/api/platform/math", { method: "POST", body: "{}" }))
        .status,
      401,
    );
    const logged = await request("/api/auth/connect", {
      method: "POST",
      body: JSON.stringify({ ref: "7" }),
    });
    const cookie = logged.headers.get("set-cookie");
    for (const path of [
      "https://example.com/api/question",
      "/api/../secret",
      "/api/wx/Send",
      "/api/order/create",
      "/api/unknown",
    ]) {
      const response = await request("/api/platform/math", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ path }),
      });
      assert.equal(response.status, 403, path);
    }
  });
});

test("math proxy binds AutoModel actor and decrypts transport independently of browser", async () => {
  let forwarded;
  await serve(
    {
      ...fixtures,
      mathRequest: async (path, input, platform) => {
        forwarded = input;
        assert.equal(platform.token, "private-math-token");
        return { SuccessResponse: true, data: [[{ ID: 1 }]] };
      },
    },
    async (request) => {
      const logged = await request("/api/auth/connect", {
        method: "POST",
        body: JSON.stringify({ ref: "7" }),
      });
      const response = await request("/api/platform/math", {
        method: "POST",
        headers: { cookie: logged.headers.get("set-cookie") },
        body: JSON.stringify({
          path: "/api/Master/AutoModel",
          method: "POST",
          data: {
            command: "GetQuestionNexts2",
            data: JSON.stringify({ BookID: 1, StuID: "other-student" }),
          },
        }),
      });
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(forwarded.data.data).StuID, "current-student");
      assert.equal(JSON.parse(forwarded.data.data).System_Station_ID, 1);
      assert.equal((await response.json()).data[0][0].ID, 1);
    },
  );
});

test("a partially unavailable platform still allows the other learning system", async () => {
  await serve(
    {
      ...fixtures,
      loginPlatform: async (name) => {
        if (name === "computer") throw new ApiError("测试上游不可用");
        return fixtures.loginPlatform(name);
      },
    },
    async (request) => {
      const response = await request("/api/auth/connect", {
        method: "POST",
        body: JSON.stringify({ ref: "7" }),
      });
      const session = await response.json();
      assert.equal(response.status, 200);
      assert.equal(session.platforms.math.connected, true);
      assert.equal(session.platforms.computer.connected, false);
      assert.equal(session.platforms.computer.error, "测试上游不可用");
    },
  );
});

test("source-compatible AES request and response use distinct response request-id key", () => {
  assert.equal(encryptMath("example").length % 4, 0);
  const requestId = "request-test";
  const cipher = createCipheriv(
    "aes-256-cbc",
    Buffer.from(createHash("md5").update(`${requestId}D`).digest("hex")),
    Buffer.from("59b87344b54f3197"),
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify([{ ID: 8 }]), "utf8"),
    cipher.final(),
  ]).toString("base64");
  assert.deepEqual(
    decodeMath({ DES: true, RequestId: requestId, data: encrypted }).data,
    [{ ID: 8 }],
  );
  assert.throws(
    () =>
      validatePlatformRequest("math", {
        path: "/api/Master/AutoModel",
        data: { command: "GetUserService2" },
      }),
    { status: 403 },
  );
  assert.equal(
    injectMathUser({ data: {}, query: { StuID: "other" } }, { stuId: "me" })
      .query.StuID,
    "me",
  );
});

test("computer wx business routes remain available while math wx login is blocked", async () => {
  await serve(
    {
      ...fixtures,
      computerRequest: async (path) => ({
        code: 200,
        data: [{ id: "chapter", name: "章节" }],
      }),
    },
    async (request) => {
      const logged = await request("/api/auth/connect", {
        method: "POST",
        body: JSON.stringify({ ref: "7" }),
      });
      const response = await request("/api/platform/computer", {
        method: "POST",
        headers: { cookie: logged.headers.get("set-cookie") },
        body: JSON.stringify({
          path: "/api/exam/wx/practice/knowledge",
          query: { majorId: "1" },
        }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data[0].id, "chapter");
    },
  );
});

test("same-origin requests require a matching browser Origin and Host", async () => {
  await serve(fixtures, async (request, base) => {
    const same = await request("/api/auth/connect", {
      method: "POST",
      headers: { origin: base },
      body: JSON.stringify({ ref: "7" }),
    });
    assert.equal(same.status, 200);
    const mismatched = await request("/api/auth/connect", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({ ref: "7" }),
    });
    assert.equal(mismatched.status, 403);
  });
});

test("an expired platform token refreshes once and updates the same browser session", async () => {
  let logins = 0,
    calls = 0;
  await serve(
    {
      ...fixtures,
      loginPlatform: async (name) => {
        logins++;
        return fixtures.loginPlatform(name);
      },
      computerRequest: async () => {
        calls++;
        if (calls === 1) throw new ApiError("登录失效", 401);
        return { code: 200, data: [{ id: "restored" }] };
      },
    },
    async (request) => {
      const logged = await request("/api/auth/connect", {
        method: "POST",
        body: JSON.stringify({ ref: "7" }),
      });
      const cookie = logged.headers.get("set-cookie");
      const response = await request("/api/platform/computer", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ path: "/api/exam/wx/practice/knowledge" }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data[0].id, "restored");
      assert.equal(calls, 2);
      assert.equal(logins, 3);
      assert.equal(
        (
          await (
            await request("/api/auth/session", { headers: { cookie } })
          ).json()
        ).platforms.computer.connected,
        true,
      );
    },
  );
});

test("comment reactions preserve the recipient author while other writes bind the actor", () => {
  const input = {
    path: "/api/sys_comment/give",
    method: "POST",
    data: { ID: 12, Give: 1, StuID: "comment-author" },
    query: {},
  };
  assert.equal(
    injectMathUser(input, { stuId: "current-user" }).data.StuID,
    "comment-author",
  );
  assert.equal(
    injectMathUser(
      { ...input, path: "/api/sys_comment/Add" },
      { stuId: "current-user" },
    ).data.StuID,
    "current-user",
  );
});

test("known own profile writes update session display and entitlement actions reread only the current user", async () => {
  const calls = [];
  await serve(
    {
      ...fixtures,
      mathRequest: async (path, input) => {
        calls.push({ path, input });
        if (input.data.command === "GetUserInfoByStuID")
          return {
            SuccessResponse: true,
            data: [
              [
                {
                  StuID: "current-student",
                  UserNick: "新昵称",
                  VipEndTime: "2030-01-01",
                  Pwd: "must-stay-hidden",
                },
              ],
            ],
          };
        return { SuccessResponse: true, code: 200, data: "操作成功" };
      },
    },
    async (request) => {
      const login = await request("/api/auth/connect", {
        method: "POST",
        body: JSON.stringify({ ref: "7" }),
      });
      const cookie = login.headers.get("set-cookie");
      const write = (path, data) =>
        request("/api/platform/math", {
          method: "POST",
          headers: { cookie },
          body: JSON.stringify({ path, method: "POST", data }),
        });
      await write("/api/sys_users/UpdateUserNickName", {
        StuID: "current-student",
        UserNick: "新昵称",
        HeadImg: "https://example.com/avatar.png",
      });
      await write("/api/sys_users/Inner_sys_users", {
        ID: 9,
        SubjectType: "数二",
        UpdateColumns: "ID,SubjectType",
      });
      let user = (
        await (
          await request("/api/auth/session", { headers: { cookie } })
        ).json()
      ).platforms.math.user;
      assert.equal(user.UserNick, "新昵称");
      assert.equal(user.SubjectType, "数二");
      await write("/api/sys_users/ExperienceVip", {
        StuID: "other-student",
        System_Station_ID: 1,
      });
      user = (
        await (
          await request("/api/auth/session", { headers: { cookie } })
        ).json()
      ).platforms.math.user;
      assert.equal(user.VipEndTime, "2030-01-01");
      assert.equal(user.Pwd, undefined);
      assert.equal(
        JSON.parse(calls.at(-1).input.data.data).StuID,
        "current-student",
      );
    },
  );
});

test("raw business responses remove nonempty authentication fields and retain authorized media credentials", async () => {
  await serve(
    {
      ...fixtures,
      mathRequest: async () => ({
        SuccessResponse: true,
        Token: "sensitive-top-token",
        data: [
          [
            {
              ID: 1,
              Pwd: "sensitive-password",
              password: "sensitive-password",
              access_token: "sensitive-access",
              refresh_token: "sensitive-refresh",
              session_key: "sensitive-session",
              nested: {
                Authorization: "sensitive-bearer",
                PlayToken: "media-play-token",
                PlaySafe: "media-play-safe",
                sign: "media-sign",
                ts: 123,
              },
              playURL:
                "https://example.com/authorized.m3u8?token=media-signature",
            },
          ],
        ],
      }),
    },
    async (request) => {
      const login = await request("/api/auth/connect", {
          method: "POST",
          body: JSON.stringify({ ref: "7" }),
        }),
        cookie = login.headers.get("set-cookie");
      const response = await request("/api/platform/math", {
          method: "POST",
          headers: { cookie },
          body: JSON.stringify({
            path: "/api/Master/AutoModel",
            method: "POST",
            data: { command: "GetUserInfoByStuID", data: "{}" },
          }),
        }),
        body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(JSON.stringify(body).includes("sensitive-"), false);
      assert.equal(body.data[0][0].nested.PlayToken, "media-play-token");
      assert.equal(body.data[0][0].nested.PlaySafe, "media-play-safe");
      assert.equal(body.data[0][0].nested.sign, "media-sign");
      assert.equal(
        body.data[0][0].playURL,
        "https://example.com/authorized.m3u8?token=media-signature",
      );
    },
  );
});
