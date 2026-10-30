import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import { startHttpApp, testLearner } from "../support/http-app.mjs";

function videoMetadata(vid,url,extra={}) {
  const digest=createHash('md5').update(vid).digest('hex');
  const cipher=createCipheriv('aes-128-cbc',Buffer.from(digest.slice(0,16)),Buffer.from(digest.slice(16)));
  return {body:Buffer.concat([cipher.update(Buffer.from(JSON.stringify({mp4:[url],duration:100,...extra})).toString('base64')),cipher.final()]).toString('hex')};
}
async function learners(app) {
  const admin=await app.setup();
  for(const username of ['math.video.first','math.video.second'])await app.createUser(admin,testLearner(username,''));
  const first=await app.login('learning','math.video.first','learner-password-123');
  const second=await app.login('learning','math.video.second','learner-password-123');
  assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}})).status,200);
  const video=(input,auth=first)=>app.request('/api/learning/platform/math/video',{auth,body:input});
  const source=input=>app.request('/api/learning/platform/math',{auth:first,body:input});
  return {admin,first,second,video,source};
}

test("math native playback resolves original media through an authenticated learning route without YYB", async () => {
  const vid = "1234567890abcdef1234567890abcdef_1", url = "https://media.example.test/lesson.mp4";
  const digest = createHash("md5").update(vid).digest("hex");
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(digest.slice(0, 16)), Buffer.from(digest.slice(16)));
  const response = { body: Buffer.concat([cipher.update(Buffer.from(JSON.stringify({ mp4: [url], duration: "50" })).toString("base64")), cipher.final()]).toString("hex") };
  const calls = [];
  const app = await startHttpApp({ requestJson: async source => { calls.push(String(source)); return response; } });
  try {
    const admin = await app.setup();
    await app.createUser(admin, testLearner("math.video", ""));
    const auth = await app.login("learning", "math.video", "learner-password-123");
    const path = "/api/learning/platform/math/video";
    assert.equal((await app.request(path, { body: { vid } })).status, 401);
    assert.equal((await app.request(path, { auth: admin, body: { vid } })).status, 401);
    assert.equal(calls.length, 0);
    const playable = await app.request(path, { auth, body: { vid } });
    assert.equal(playable.status, 200);
    assert.equal(playable.headers.get("cache-control"), "no-store");
    assert.deepEqual(await playable.json(), { url, poster: "", duration: 50 });
    assert.deepEqual(calls, [`https://player.polyv.net/secure/${vid}.json`]);
    assert.equal((await app.request(path, { auth, body: { vid: "../invalid" } })).status, 400);
    assert.equal(calls.length, 1);
  } finally { await app.close(); }
});

test('resolved math URLs persist across learners, refresh on failure and preserve the last successful cache when refresh fails',async()=>{
  const vid='math_cached_vid',calls=[];
  let version=1,offline=false;
  const app=await startHttpApp({
    yybRequest:async()=>assert.fail('VID cache and provider refresh do not need YYB'),
    requestJson:async target=>{calls.push(String(target));if(offline)throw new Error('provider unavailable');return videoMetadata(vid,`https://media.example.test/math-${version}.mp4`);},
  });
  try {
    const {first,second,video}=await learners(app);
    assert.equal((await video({vid})).status,200);
    for(const auth of [first,second,first])assert.equal((await (await video({vid},auth)).json()).url,'https://media.example.test/math-1.mp4');
    assert.equal(calls.length,1);
    const resource=(await app.app.locals.resourceStore.list({platform:'math',kind:'math.media'})).resources[0];
    assert.equal(resource.scope,'volatile');
    const detail=()=>app.app.locals.resourceStore.detail({platform:'math',sourceId:resource.sourceId,key:resource.key});
    assert.deepEqual((await detail()).media.map(row=>row.url),['https://media.example.test/math-1.mp4']);
    version=2;
    assert.equal((await (await video({vid,refresh:true})).json()).url,'https://media.example.test/math-2.mp4');
    assert.equal(calls.length,2);
    assert.equal((await (await video({vid},second)).json()).url,'https://media.example.test/math-2.mp4');
    assert.equal(calls.length,2,'reopening the video reuses the renewed address');
    offline=true;
    assert.equal((await video({vid,refresh:true})).status,502);
    assert.equal((await (await video({vid},second)).json()).url,'https://media.example.test/math-2.mp4');
    assert.equal((await detail()).response.url,'https://media.example.test/math-2.mp4');
    const before=calls.length;
    for(const input of [{vid,refresh:'true'},{vid:'../bad'},{origin:{kind:'other'}},{origin:{kind:'analysis',questionId:0}}])assert.equal((await video(input)).status,400);
    assert.equal(calls.length,before,'invalid refresh input never contacts a provider');
  } finally {await app.close();}
});

test('question explanation direct URLs reuse the saved analysis and refresh only the original question file',async()=>{
  const calls=[];
  let version=1,wrongFile=false;
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'source-token',stuId:'source-student',user:{StuID:'source-student'}}),
    requestJson:async()=>assert.fail('direct explanation URLs do not use a video provider'),
    mathRequest:async(path,input)=>{
      calls.push({path,input});
      assert.equal(input.method,'GET');
      assert.ok(['/api/question_list/GetQuestionByIDSoleDes','/api/question_files/GetListByPage'].includes(path));
      if(path.endsWith('/GetListByPage'))assert.equal(input.query.ID,'91');
      return {SuccessResponse:true,data:[{ID:wrongFile?92:91,QuestionID:42,BusType:'视频解析',FileUrl:`https://media.example.test/explanation-${version}.mp4`}]};
    },
  });
  try {
    const {video,source,second}=await learners(app);
    assert.equal((await source({path:'/api/question_list/GetQuestionByIDSoleDes',query:{ID:42,SortDesc:'Sort'}})).status,200);
    const origin={kind:'analysis',questionId:42,itemId:91};
    const input={url:'https://untrusted.example.test/not-the-saved-video.mp4',origin};
    assert.equal((await (await video(input)).json()).url,'https://media.example.test/explanation-1.mp4');
    assert.equal(calls.length,1,'the first playback uses the trusted saved explanation without another YYB request');
    version=2;
    assert.equal((await (await video({...input,refresh:true})).json()).url,'https://media.example.test/explanation-2.mp4');
    assert.equal(calls.length,2);
    assert.equal((await (await video(input,second)).json()).url,'https://media.example.test/explanation-2.mp4');
    assert.equal(calls.length,2);
    wrongFile=true;
    assert.equal((await video({...input,refresh:true})).status,502,'a different question file cannot replace the selected explanation');
    assert.equal((await (await video(input)).json()).url,'https://media.example.test/explanation-2.mp4');
  } finally {await app.close();}
});

test('course, special and product media refresh through fixed source reads and keep a stable cache when VID or credentials change',async()=>{
  let version=1;
  const sourceCalls=[],providerCalls=[];
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'source-token',stuId:'source-student',user:{StuID:'source-student'}}),
    requestJson:async target=>{const vid=new URL(target).pathname.split('/').at(-1).replace('.json','');providerCalls.push(vid);return videoMetadata(vid,`https://media.example.test/${vid}.mp4`,{seed:1,hls:[`https://media.example.test/${vid}.m3u8`]});},
    mathRequest:async(path,input)=>{
      sourceCalls.push({path,input});
      if(path==='/api/c_course_list/GetCalendarDetailListV2') {
        assert.equal(input.query.StuID,'source-student');
        assert.equal(String(input.query.ID),'10');
        return {SuccessResponse:true,data:[{ID:81,BusID:12,BusType:2,Data:{ID:12,VideoUrl:`https://media.example.test/course-${version}.mp4`}}]};
      }
      if(path==='/api/c_course_product/GetProductByStuIDAndProductID') {
        assert.equal(input.query.StuID,'source-student');
        assert.equal(input.query.CourseProductID,'7');
        return {SuccessResponse:true,data:[{ID:7,Json:`product_vid_${version}`,playsafe:`token-${version}`}]};
      }
      assert.equal(path,'/api/Master/AutoModel');
      assert.equal(input.data.command,'GetSpecialVideoListBySpecialID');
      assert.equal(JSON.parse(input.data.data).StuID,'source-student');
      return {SuccessResponse:true,data:[[{ID:22,VideoUrl:`https://media.example.test/special-${version}.mp4`}]]};
    },
  });
  try {
    const {video,source,second}=await learners(app);
    const course={origin:{kind:'course',calendarId:10,productId:7,itemId:12}};
    assert.equal((await source({path:'/api/c_course_list/GetCalendarDetailListV2',query:{StuID:'web-actor',ID:10,ProductID:7,SortDesc:'Sort'}})).status,200);
    assert.equal((await (await video(course)).json()).url,'https://media.example.test/course-1.mp4');
    assert.equal(sourceCalls.length,1);
    const special={origin:{kind:'special',specialId:20,itemId:22}};
    assert.equal((await (await video(special)).json()).url,'https://media.example.test/special-1.mp4');
    const product={vid:'old_vid',origin:{kind:'product',productId:7}};
    assert.equal((await video(product)).status,200,'an uncached VID can be resolved without reading its source row');
    const before=sourceCalls.length;
    version=2;
    assert.equal((await (await video({...course,refresh:true})).json()).url,'https://media.example.test/course-2.mp4');
    assert.equal((await (await video({...special,refresh:true})).json()).url,'https://media.example.test/special-2.mp4');
    const renewed=await (await video({...product,refresh:true})).json();
    assert.match(renewed.url,/product_vid_2\.m3u8\?token=token-2/);
    assert.equal(sourceCalls.length,before+3);
    assert.equal((await (await video(product,second)).json()).url,renewed.url,'the old VID and row credentials cannot defeat the renewed origin cache');
    assert.deepEqual(providerCalls,['old_vid','product_vid_2']);
  } finally {await app.close();}
});

test('step explanation URLs share the same cache-first policy without mixing videos when step IDs are missing',async()=>{
  let version=1;
  const calls=[];
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'source-token',stuId:'source-student',user:{StuID:'source-student'}}),
    requestJson:async()=>assert.fail('direct step videos do not use Polyv'),
    mathRequest:async(path,input)=>{
      calls.push(path);
      assert.equal(path,'/api/Master/AutoModel');
      assert.equal(input.data.command,'GetQuestionInfoByResolve');
      return {SuccessResponse:true,data:[[{ID:11,Files:`https://media.example.test/step-a-${version}.mp4`},{ID:12,Files:`https://media.example.test/step-b-${version}.mp4`}]]};
    },
  });
  try {
    const {video,source,second}=await learners(app);
    await source({path:'/api/Master/AutoModel',method:'POST',data:{command:'GetQuestionInfoByResolve',data:JSON.stringify({QuestionID:42})}});
    const origin={kind:'resolve',questionId:42};
    const a={origin,url:'https://media.example.test/step-a-1.mp4'},b={origin,url:'https://media.example.test/step-b-1.mp4'};
    assert.equal((await (await video(a)).json()).url,a.url);
    assert.equal((await (await video(b)).json()).url,b.url,'two anonymous steps cannot share one question-only playback cache');
    assert.equal(calls.length,1,'both saved direct links are reused without another source read');
    const identified={origin:{...origin,itemId:11},url:a.url};
    assert.equal((await (await video(identified)).json()).url,a.url);
    version=2;
    assert.equal((await (await video({...identified,refresh:true})).json()).url,'https://media.example.test/step-a-2.mp4');
    assert.equal(calls.length,2);
    assert.equal((await (await video(identified,second)).json()).url,'https://media.example.test/step-a-2.mp4');
    assert.equal(calls.length,2);
  } finally {await app.close();}
});

test('a direct explanation already saved in the question-files list plays while YYB is unavailable',async()=>{
  let sourceCalls=0;
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'source-token',stuId:'source-student',user:{StuID:'source-student'}}),
    requestJson:async()=>assert.fail('a saved direct explanation needs no provider request'),
    mathRequest:async path=>{
      sourceCalls++;
      assert.equal(sourceCalls,1,'playing the saved question-files list must not contact an unavailable YYB source');
      assert.equal(path,'/api/question_files/GetListByAll');
      return {SuccessResponse:true,data:[{ID:91,QuestionID:42,BusType:'视频解析',FileUrl:'https://media.example.test/saved-explanation.mp4'}]};
    },
  });
  try {
    const {video,source,second}=await learners(app);
    assert.equal((await source({path:'/api/question_files/GetListByAll',query:{QuestionID:42}})).status,200);
    const response=await video({origin:{kind:'analysis',questionId:42,itemId:91}},second);
    assert.equal(response.status,200);
    assert.equal((await response.json()).url,'https://media.example.test/saved-explanation.mp4');
    assert.equal(sourceCalls,1);
  } finally {await app.close();}
});
