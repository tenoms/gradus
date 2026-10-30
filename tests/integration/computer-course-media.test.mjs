import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { startHttpApp, testLearner } from '../support/http-app.mjs';
import { platformConfigFixture } from '../support/platform-config.mjs';

test('progressive sync stores decoded course playback URLs and lesson media references without replaying signed snapshots',async()=>{
  const key='1234567890abcdef',iv='fedcba0987654321';
  const configurationDefaults=platformConfigFixture({computer:{videoKey:key,videoIv:iv}});
  const lessonUrl='https://media.example.test/lesson.mp4?key=lesson-signature';
  let plays=0,unavailable=false;
  const app=await startHttpApp({configurationDefaults,
    yybRequest:async()=>[{id:'7',status:'alive'}],
    loginPlatform:async()=>({connected:true,token:'source-platform-token',user:{userId:'source-user'}}),
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
    const learner=await app.login('learning','course.media','learner-password-123');
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
    assert.notEqual(secondUrl,firstUrl,'a new playback obtains a fresh signed URL');
    assert.equal(plays,2);
    unavailable=true;
    assert.equal((await read(input)).status,502,'source failure never silently replays an older signed URL');
    const preserved=await app.app.locals.resourceStore.detail({platform:'computer',sourceId:playback.sourceId,key:playback.key});
    assert.equal(preserved.response.data.mediaList[0].playURL,secondUrl,'the last successful snapshot remains available for inspection');
    assert.deepEqual(preserved.media.map(row=>row.url),[secondUrl]);
  } finally {await app.close();}
});
