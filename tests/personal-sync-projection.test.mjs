import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from './database.mjs';
import {createPrivatePlatformStore} from '../server/private-platform.mjs';

test('local shelf removals survive source updates while newly imported books remain visible',async()=>{
  const database=await createTestDatabase();
  const source={EBookIDs:'book-a,book-b',PaperIDs:'paper-a',AlbumIDs:''};
  const personalSync={records:async(userId,name,collection)=>collection==='profile'?[{_importId:1,sourceRecordId:'bookshelf',scope:'bookshelf',openid:'wechat-a',data:source}]:[]};
  const store=await createPrivatePlatformStore({database,personalSync});
  const profile=()=>store.profile('web-a','math',{ID:'web-a',StuID:'web-a'},'Web 名称');
  try{
    assert.equal((await profile()).EBookIDs,'book-a,book-b');
    await store.put('web-a','math','profile','profile',{EBookIDs:'book-b,local-book'});
    source.EBookIDs='book-a,book-b,new-source-book';
    const next=await profile();
    assert.deepEqual(new Set(next.EBookIDs.split(',')),new Set(['book-b','local-book','new-source-book']));
    assert.equal(next.StuID,'web-a');assert.equal(next.UserNick,'Web 名称');
    assert.equal(next._importShelfRemoved,undefined);
    await store.put('web-a','math','profile','profile',{EBookIDs:next.EBookIDs+',book-a'});
    assert.ok((await profile()).EBookIDs.split(',').includes('book-a'));
  }finally{await database.close();}
});

test('imported note catalog references use stable Web view IDs and Web edits remain an overlay',async()=>{
  const database=await createTestDatabase();
  const notes=[{_importId:12,sourceRecordId:'notes:91',scope:'notes',openid:'wechat-a',data:{ID:91,QuestionID:42,CatalogID:51,Type:'笔记',Content:'源内容'}}];
  const catalogs=[{_importId:21,sourceRecordId:'catalogs:51',scope:'notes',openid:'wechat-b',data:{ID:51,Name:'另一关联的分类',BusType:'笔记'}},{_importId:11,sourceRecordId:'catalogs:51',scope:'notes',openid:'wechat-a',data:{ID:51,Name:'分类',BusType:'笔记'}}];
  const personalSync={records:async(userId,name,collection)=>collection==='sys_user_book_catalog'?catalogs:collection==='sys_user_book_question'||collection==='rel_question_log'?notes:[]};
  const store=await createPrivatePlatformStore({database,personalSync});
  try{
    const note=(await store.list('web-a','math','sys_user_book_question'))[0];
    assert.equal(note.ID,-12);assert.equal(note.CatalogID,-11);
    await store.put('web-a','math','sys_user_book_question',note._key,{Content:'Web 内容'});
    notes[0].data.Content='源更新';
    const result=(await store.list('web-a','math','rel_question_log'))[0];
    assert.equal(result.ID,-12);assert.equal(result.CatalogID,-11);assert.equal(result.Content,'Web 内容');assert.equal(result.QuestionID,42);
  }finally{await database.close();}
});
