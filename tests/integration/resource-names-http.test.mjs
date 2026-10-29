import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startHttpApp} from '../support/http-app.mjs';

const source=(name,platform='math')=>({id:createHash('sha256').update(name).digest('hex'),platform,scope:'public',accountRef:''});
const resourcePath=row=>`/api/admin/resources/${row.platform}/${row.sourceId}/${row.key}`;
async function read(app,path,auth){const response=await app.request(path,{auth});assert.equal(response.status,200);return response.json();}
async function save(app,from,kind,path,response,context={}){
  return app.app.locals.resourceStore.save(from,{kind,scope:'public',request:{path,method:'GET',query:context,data:{}},context},response);
}

test('resource HTTP names reflect saved course, chapter and question content even when legacy titles are paths',async()=>{
  const app=await startHttpApp();
  try{
    const admin=await app.setup(),math=source('name-http-math'),computer=source('name-http-computer','computer');
    const question=await save(app,math,'math.question','/api/question_list/GetQuestionByQuestionNew',{data:[{QuestionID:42,BookID:7,QuestionTxt:'<p>函数在原点连续的必要条件是什么？</p>',QuestionPage:23,_book_list:{Name:'高等数学（上册）'}}]},{ID:42});
    const course=await save(app,computer,'computer.courses','/api/exam/wx/course/courseList',{code:200,data:{courseList:[{id:'course-os',courseName:'操作系统基础精讲'},{id:'course-ds',courseName:'数据结构核心考点'}]}});
    const lessons=await save(app,computer,'computer.lessons','/api/exam/wx/lesson/lessonList',{code:200,data:[{id:'process',courseId:'course-os',lessonName:'进程与线程',chapterName:'进程管理'},{id:'sync',courseId:'course-os',lessonName:'同步与互斥',chapterName:'进程管理'}]},{courseId:'course-os'});
    const catalog=await save(app,math,'math.catalog','/api/Master/AutoModel',{data:[{ID:1,BookID:7,BookName:'高等数学（上册）',ChapterName:'函数与极限',BookChapter:'第一章'},{ID:2,BookID:7,BookName:'高等数学（上册）',ChapterName:'导数与微分',BookChapter:'第二章'}]},{BookID:7});
    const database=app.app.locals.database;
    await database.query(`UPDATE ${database.upstream('resources')} SET title=request->>'path'`);
    const page=await read(app,'/api/admin/resources',admin);
    for(const row of page.resources){
      assert.ok(row.title&&!row.title.includes('/api/'),'directory names must not fall back to paths');
      assert.ok(row.typeLabel&&/[\u3400-\u9fff]/.test(row.typeLabel),'types have readable Chinese labels');
      assert.equal('response' in row,false,'list metadata does not copy complete responses');
    }
    const current=page.resources.find(row=>row.key===question.key);
    assert.match(current.title,/函数在原点连续/);
    assert.doesNotMatch(current.title,/<\/?p>/);
    assert.match(`${current.title} ${current.subtitle}`,/高等数学/);
    const matches=await read(app,'/api/admin/resources?q='+encodeURIComponent('函数在原点连续'),admin);
    assert.deepEqual(matches.resources.map(row=>row.key),[question.key]);
    for(const saved of [course,lessons,catalog]){
      const item=page.resources.find(row=>row.key===saved.key);
      assert.notEqual(item.title,'进程与线程');assert.notEqual(item.title,'函数与极限');
      assert.match(`${item.title} ${item.subtitle}`,/目录|课程|课时|章节|2/,'multi-item responses retain catalogue semantics');
    }
    assert.match(page.resources.find(row=>row.key===catalog.key).title,/高等数学/,'chapter directories retain the parent book name');
    assert.ok(page.facets.kinds.every(kind=>kind.label&&/[\u3400-\u9fff]/.test(kind.label)));
    const detail=await read(app,resourcePath(question),admin);
    assert.equal(detail.path,'/api/question_list/GetQuestionByQuestionNew');
    assert.equal(detail.source.id,math.id);
    assert.equal(detail.response.data[0].QuestionTxt,'<p>函数在原点连续的必要条件是什么？</p>');
  }finally{await app.close();}
});

test('readable source labels distinguish public domains and content naming ignores nested account identities',async()=>{
  const app=await startHttpApp();
  try{
    const admin=await app.setup(),one=source('label-one'),two=source('label-two');
    await save(app,one,'math.books','/api/book/GetList',{data:[{ID:1,Name:'数学复习资料'}]});
    const unknown=await save(app,two,'observed','/api/unknown-content',{data:{result:true,_sys_users:{Name:'账号昵称不应成为资源名'},_wx_users:{Nickname:'另一账号昵称'}}});
    const page=await read(app,'/api/admin/resources',admin);
    assert.equal(new Set(page.facets.sources.map(item=>item.label)).size,2);
    for(const from of page.facets.sources){assert.match(from.label,/考研数学/);assert.doesNotMatch(from.label,/[a-f0-9]{8}/);}
    const row=page.resources.find(item=>item.key===unknown.key);
    assert.doesNotMatch(`${row.title} ${row.subtitle}`,/账号昵称|unknown-content|\/api\//);
    const detail=await read(app,resourcePath(unknown),admin);
    assert.equal(detail.source.id,two.id);
    assert.match(detail.source.label,/考研数学/);
  }finally{await app.close();}
});
