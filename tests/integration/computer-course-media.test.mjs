import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { startHttpApp, testLearner } from '../support/http-app.mjs';
import { platformConfigFixture } from '../support/platform-config.mjs';
import { createTestDatabase } from '../support/database.mjs';
import { createResourceStore } from '../../server/modules/resources/store.mjs';
import { sourceForSession } from '../../server/modules/resources/catalog.mjs';

test('course playback reuses saved URLs across learners and refreshes them only after a reported source failure',async()=>{
  const key='1234567890abcdef',iv='fedcba0987654321';
  const configurationDefaults=platformConfigFixture({computer:{videoKey:key,videoIv:iv}});
  const lessonUrl='https://media.example.test/lesson.mp4?key=lesson-signature';
  let plays=0,unavailable=false,directoryRequests=0,logins=0;
  const app=await startHttpApp({configurationDefaults,
    yybRequest:async()=>{directoryRequests++;return [{id:'7',status:'alive'}];},
    loginPlatform:async()=>{logins++;return {connected:true,token:'source-platform-token',user:{userId:'source-user'}};},
    requestJson:async(url)=>{
      const path=new URL(url).pathname;
      if(path.endsWith('/lessonList'))return {code:200,data:{list:[{id:'lesson-1',lessonName:'课程',mediaId:'media-1',lessonUrl}],total:1,pages:1}};
      assert.equal(path,'/api/exam/wx/course/get_play_info/v2');
      if(unavailable)throw Object.assign(new Error('source unavailable'),{status:502});
      const cipher=createCipheriv('aes-128-cbc',Buffer.from(key),Buffer.from(iv));
      const urlValue=`https://media.example.test/course.m3u8?key=signature-${++plays}&timestamp=${plays}`;
      const encrypted=Buffer.concat([cipher.update(urlValue,'utf8'),cipher.final()]).toString('base64');
      return {code:200,token:'must-not-store',data:{mediaList:[{playURL:encrypted,definition:'HD'}]}};
    },
  });
  try {
    const admin=await app.setup();
    await app.createUser(admin,testLearner('course.media','7'));
    await app.createUser(admin,testLearner('course.other','7'));
    const learner=await app.login('learning','course.media','learner-password-123');
    const other=await app.login('learning','course.other','learner-password-123');
    assert.equal((await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}})).status,200);
    const read=input=>app.request('/api/learning/platform/computer',{auth:learner,body:input});
    assert.equal((await read({path:'/api/exam/wx/lesson/lessonList',query:{courseId:'course-1'}})).status,200);
    const input={path:'/api/exam/wx/course/get_play_info/v2',query:{mediaId:'media-1',format:'m3u8'}};
    const first=await read(input);
    assert.equal(first.status,200);
    const firstUrl=(await first.json()).data.mediaList[0].playURL;
    assert.match(firstUrl,/^https:\/\/media\.example\.test\/course\.m3u8\?key=signature-1/);
    const resources=(await app.app.locals.resourceStore.list({platform:'computer'})).resources;
    const playback=resources.find(row=>row.kind==='computer.media');
    assert.equal(playback.scope,'volatile');
    const detail=await app.app.locals.resourceStore.detail({platform:'computer',sourceId:playback.sourceId,key:playback.key});
    assert.equal(detail.response.data.mediaList[0].playURL,firstUrl,'the saved response contains the decoded playback URL');
    assert.equal(detail.response.token,undefined);
    assert.deepEqual(detail.media.map(row=>row.url),[firstUrl]);
    const media=await app.app.locals.database.query(`SELECT url FROM ${app.app.locals.database.upstream('resource_media')} WHERE platform='computer'`);
    assert.deepEqual(new Set(media.rows.map(row=>row.url)),new Set([lessonUrl,firstUrl]));
    const second=await read(input);
    assert.equal(second.status,200);
    const secondUrl=(await second.json()).data.mediaList[0].playURL;
    assert.equal(secondUrl,firstUrl,'repeated playback uses the saved URL');
    assert.equal(plays,1);
    const before={directoryRequests,logins};
    unavailable=true;
    const shared=await app.request('/api/learning/platform/computer',{auth:other,body:input});
    assert.equal(shared.status,200);
    assert.equal((await shared.json()).data.mediaList[0].playURL,firstUrl);
    assert.deepEqual({directoryRequests,logins},before,'a different Web user needs no source identity or YYB login to use the saved URL');
    assert.equal((await read({...input,refresh:true})).status,502,'an explicitly failed URL must try the source and report its failure');
    const preserved=await app.app.locals.resourceStore.detail({platform:'computer',sourceId:playback.sourceId,key:playback.key});
    assert.equal(preserved.response.data.mediaList[0].playURL,firstUrl,'a failed refresh never replaces the last saved URL');
    unavailable=false;
    const refreshed=await read({...input,refresh:true});
    assert.equal(refreshed.status,200);
    const freshUrl=(await refreshed.json()).data.mediaList[0].playURL;
    assert.notEqual(freshUrl,firstUrl);
    assert.equal(plays,2);
    const updated=await app.app.locals.resourceStore.detail({platform:'computer',sourceId:playback.sourceId,key:playback.key});
    assert.equal(updated.response.data.mediaList[0].playURL,freshUrl);
    assert.deepEqual(updated.media.map(row=>row.url),[freshUrl]);
    assert.equal((await (await read(input)).json()).data.mediaList[0].playURL,freshUrl);
    assert.equal(plays,2,'the refreshed URL is reused on subsequent playback');
  } finally {await app.close();}
});

test('Tencent playback snapshots are reused and failed business responses cannot replace the saved address',async()=>{
  let calls=0,failure;
  const app=await startHttpApp({
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'source-token',user:{userId:'source-user'}}),
    computerRequest:async()=>{calls++;return failure || {code:200,data:[{url:'https://media.example.test/tencent.mp4?key=valid'}]};},
  });
  try {
    const admin=await app.setup();
    await app.createUser(admin,testLearner('course.tencent','7'));
    const auth=await app.login('learning','course.tencent','learner-password-123');
    await app.request('/api/admin/resource-sync',{auth:admin,method:'PUT',body:{revision:0,enabled:true}});
    const body={path:'/api/exam/wx/course/vod/get_play_info',query:{mediaId:'tencent-media',format:'m3u8'}};
    const read=input=>app.request('/api/learning/platform/computer',{auth,body:input});
    assert.equal((await read(body)).status,200);
    assert.equal((await read(body)).status,200);
    assert.equal(calls,1);
    for(const invalid of [{code:403,msg:'没有播放权限',data:null},{code:200,data:{mediaList:[]}}]) {
      failure=invalid;
      assert.equal((await read({...body,refresh:true})).status,502);
      const saved=await read(body);
      assert.equal(saved.status,200);
      assert.equal((await saved.json()).data[0].url,'https://media.example.test/tencent.mp4?key=valid');
    }
    for(const invalid of [{...body,refresh:'true'},{path:'/api/exam/wx/course/courseList',refresh:true},{...body,method:'POST',refresh:true}])
      assert.equal((await read(invalid)).status,400);
    assert.equal(calls,3,'invalid refresh requests and cached reads never contact the source');
  } finally {await app.close();}
});

test('saved playback lookup isolates platform domains, media IDs, providers and formats while ignoring YYB identities',async()=>{
  const database=await createTestDatabase();
  try {
    const store=await createResourceStore(database),config=platformConfigFixture();
    const request={path:'/api/exam/wx/course/get_play_info/v2',method:'GET',query:{mediaId:'same-media',format:'m3u8'},data:{}};
    const source=sourceForSession('computer',{account:{ref:'old-source'},yybBaseUrl:'https://old-yyb.example'},config);
    await store.save({...source,webUserId:'old-web-user'},{kind:'computer.media',request},{code:200,data:{url:'https://media.example.test/saved.m3u8'}},{scope:'volatile'});
    assert.equal((await store.findPlayback({config,request})).response.data.url,'https://media.example.test/saved.m3u8');
    for(const patch of [{baseUrl:'https://other.example.test'},{appId:'other-app'},{tenantCode:'99'}]) {
      const other={...config,computer:{...config.computer,...patch}};
      assert.equal(await store.findPlayback({config:other,request}),null,JSON.stringify(patch));
    }
    for(const changed of [
      {...request,query:{mediaId:'different-media',format:'m3u8'}},
      {...request,query:{mediaId:'same-media',format:'mp4'}},
      {...request,path:'/api/exam/wx/course/vod/get_play_info'},
    ])assert.equal(await store.findPlayback({config,request:changed}),null);
    const trailing={...config,computer:{...config.computer,baseUrl:config.computer.baseUrl+'/'}};
    assert.ok(await store.findPlayback({config:trailing,request}));
  } finally {await database.close();}
});
