import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createApp,
  injectMathUser,
  validatePlatformRequest,
} from "../../server/app.mjs";
import { ApiError } from "../../server/infrastructure/api-error.mjs";
import { encryptMath, decodeMath } from "../../server/integrations/upstream.mjs";
import { createCipheriv, createHash } from "node:crypto";

import { startHttpApp, testLearner } from "../support/http-app.mjs";

async function serve(overrides, run) {
  const harness = await startHttpApp(overrides);
  let administrator;
  let user;
  async function loginWeb(options = {}) {
    if (!administrator) administrator = await harness.setup();
    if (!user) user = await harness.createUser(administrator, testLearner("proxy.student", "7"));
    const auth = await harness.login("learning", "proxy.student", "learner-password-123");
    const response = await harness.request("/api/learning/auth/session", { auth, ...options });
    return { response, auth, cookie: auth.cookie, userId: auth.userId, setCookie: auth.setCookie };
  }
  try { await run(harness.request, harness.base, loginWeb); }
  finally { await harness.close(); }
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
  await serve(fixtures, async (request, _base, loginWeb) => {
    const { response, cookie, userId, setCookie } = await loginWeb();
    assert.equal(response.status, 200);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    const session = await response.json();
    assert.equal(session.platforms.math.user.StuID, userId);
    assert.equal(JSON.stringify(session).includes("private-"), false);
    assert.equal(
      (
        await (
          await request("/api/learning/auth/session", { headers: { cookie, "X-Study-User": userId } })
        ).json()
      ).authenticated,
      true,
    );
    await request("/api/learning/auth/logout", { method: "POST", headers: { cookie, "X-Study-User": userId } });
    assert.equal(
      (
        await (
          await request("/api/learning/auth/session", { headers: { cookie, "X-Study-User": userId } })
        ).json()
      ).authenticated,
      false,
    );
  });
});

test("proxy requires session and rejects external, payment, arbitrary and traversal paths", async () => {
  await serve(fixtures, async (request, _base, loginWeb) => {
    assert.equal(
      (await request("/api/learning/platform/math", { method: "POST", body: "{}" }))
        .status,
      401,
    );
    const { response: logged, cookie, userId, setCookie } = await loginWeb();
    for (const path of [
      "https://example.com/api/question",
      "/api/../secret",
      "/api/wx/Send",
      "/api/order/create",
      "/api/unknown",
    ]) {
      const response = await request("/api/learning/platform/math", {
        method: "POST",
        headers: { cookie, "X-Study-User": userId },
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
    async (request, _base, loginWeb) => {
      const { response: logged, cookie, userId, setCookie } = await loginWeb();
      const response = await request("/api/learning/platform/math", {
        method: "POST",
        headers: { cookie, "X-Study-User": userId },
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

test("an unavailable resource source does not prevent local learning or invalidate Web login", async()=>{
 await serve({...fixtures,loginPlatform:async(name)=>{if(name==='computer')throw new ApiError('测试来源不可用',503);return fixtures.loginPlatform(name);},mathRequest:async()=>({SuccessResponse:true,data:[]})},async(request,_base,loginWeb)=>{
  const {response,cookie,userId}=await loginWeb();const session=await response.json();assert.equal(session.platforms.math.available,true);assert.equal(session.platforms.computer.available,true);
  const unavailable=await request('/api/learning/platform/computer',{headers:{cookie,'X-Study-User':userId},body:{path:'/api/exam/wx/practice/knowledge'}});assert.equal(unavailable.status,503);
  assert.equal((await(await request('/api/learning/auth/session',{headers:{cookie,'X-Study-User':userId}})).json()).authenticated,true);
 });
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
    injectMathUser({ data: {}, query: { StuID: "other" } }, { stuId: "me" }, 7)
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
    async (request, _base, loginWeb) => {
      const { response: logged, cookie, userId, setCookie } = await loginWeb();
      const response = await request("/api/learning/platform/computer", {
        method: "POST",
        headers: { cookie, "X-Study-User": userId },
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
  await serve(fixtures, async (request, base, loginWeb) => {
    const { auth } = await loginWeb();
    const same = await request("/api/learning/auth/session", {
      auth,
      method: "GET",
      headers: { origin: base },
    });
    assert.equal(same.status, 200);
    const mismatched = await request("/api/learning/auth/session", {
      auth,
      method: "GET",
      headers: { origin: "http://127.0.0.1:5173" },
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
    async (request, _base, loginWeb) => {
      const { response: logged, cookie, userId, setCookie } = await loginWeb();
        const response = await request("/api/learning/platform/computer", {
        method: "POST",
        headers: { cookie, "X-Study-User": userId },
        body: JSON.stringify({ path: "/api/exam/wx/practice/knowledge" }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data[0].id, "restored");
      assert.equal(calls, 2);
      assert.equal(logins, 2);
      assert.equal(
        (
          await (
            await request("/api/learning/auth/session", { headers: { cookie, "X-Study-User": userId } })
          ).json()
        ).platforms.computer.available,
        true,
      );
    },
  );
});

test("personal writes bind the current actor and configured station", () => {
  const input = {
    path: "/api/rel_question_log/Inner_rel_question_log",
    method: "POST",
    data: { ID: 12, StuID: "requested-user" },
    query: {},
  };
  assert.equal(
    injectMathUser(input, { stuId: "current-user" }, 7).data.StuID,
    "current-user",
  );
  assert.equal(injectMathUser(input, { stuId: "current-user" }, 7).data.System_Station_ID, 7);
  assert.throws(() => injectMathUser(input, { stuId: "current-user" }), { status: 503 });
});

test("known own profile writes update session display without entitlement checks", async () => {
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
    async (request, _base, loginWeb) => {
      const { response: login, cookie, userId, setCookie } = await loginWeb();
      const write = (path, data) =>
        request("/api/learning/platform/math", {
          method: "POST",
          headers: { cookie, "X-Study-User": userId },
          body: JSON.stringify({ path, method: "POST", data }),
        });
      await write("/api/sys_users/UpdateUserNickName", {
        StuID: "current-student",
        UserNick: "新昵称",
        HeadImg: "https://example.com/avatar.png",
      });
      await write("/api/sys_users/Inner_sys_users", {
        ID: userId,
        SubjectType: "数二",
        UpdateColumns: "ID,SubjectType",
      });
      let user = (
        await (
          await request("/api/learning/auth/session", { headers: { cookie, "X-Study-User": userId } })
        ).json()
      ).platforms.math.user;
      assert.equal(user.UserNick, "新昵称");
      assert.equal(user.SubjectType, "数二");
      assert.equal(user.Pwd, undefined);
      assert.equal(calls.some(call => call.input.data.command === "GetUserInfoByStuID"), false);
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
    async (request, _base, loginWeb) => {
      const { response: login, cookie, userId } = await loginWeb();
      const response = await request("/api/learning/platform/math", {
          method: "POST",
          headers: { cookie, "X-Study-User": userId },
          body: JSON.stringify({
            path: "/api/Master/AutoModel",
            method: "POST",
            data: { command: "GetBookPaperListOfVip", data: "{}" },
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

test("successful computer own profile writes update only the known nickname and avatar session fields", async()=>{await serve({...fixtures,computerRequest:async()=>({code:200,data:null})},async (request,_base,loginWeb)=>{const {cookie,userId}=await loginWeb();await request('/api/learning/platform/computer',{method:'POST',headers:{cookie,"X-Study-User":userId},body:JSON.stringify({path:'/api/user/wx/user/updateUserInfo',method:'PUT',data:{name:'账户验证',previewUrl:'https://example.test/avatar.png',phone:'must-not-enter-session'}})});const user=(await(await request('/api/learning/auth/session',{headers:{cookie,"X-Study-User":userId}})).json()).platforms.computer.user;assert.equal(user.nickName,'账户验证');assert.equal(user.previewUrl,'https://example.test/avatar.png');assert.equal(user.phone,undefined);});});

test("computer image similarity keeps the source Tenant 2 while ordinary attachments stay Tenant 1",async()=>{const calls=[];await serve({...fixtures,requestJson:async(url,options)=>{calls.push({url,options});return {code:200,data:{previewUrl:'https://example.test/fixture.png'}};}},async (request,_base,loginWeb)=>{const {cookie,userId}=await loginWeb();for(const path of ['/api/exam/wx/searchExercise/text/similarity','/api/user/v1/attachment/upload/']){const response=await request('/api/learning/platform/computer/upload?path='+encodeURIComponent(path),{method:'POST',headers:{cookie,'X-Study-User':userId,'content-type':'multipart/form-data; boundary=fixture'},body:'--fixture\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\nfixture\r\n--fixture--\r\n'});assert.equal(response.status,200);}assert.deepEqual(calls.map(call=>call.options.headers['Tenant-Code']),['2','1']);assert.ok(calls.every(call=>Buffer.isBuffer(call.options.body)));});});
