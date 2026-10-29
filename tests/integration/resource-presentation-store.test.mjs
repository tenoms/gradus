import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from '../support/database.mjs';
import {createResourceStore} from '../../server/modules/resources/store.mjs';

test('resource labels prefer question or chapter content, associate known local content and safely shorten long Chinese text',async()=>{
  const database=await createTestDatabase();
  try{
    const store=await createResourceStore(database),math={id:'presentation-math',platform:'math',scope:'public',accountRef:''},computer={id:'presentation-computer',platform:'computer',scope:'public',accountRef:''};
    const save=(from,kind,path,response,context={})=>store.save(from,{kind,scope:'public',request:{path,method:'GET',query:context,data:{}},context},response);
    const stem='判断函数在原点连续时左右极限是否存在。'.repeat(30);
    const question=await save(math,'math.question','/api/question_list/GetQuestionByQuestionNew',{data:[{ID:42,QuestionTxt:`<p>${stem}</p>`,CourseName:'不应遮住题干的课程名称',_book_list:{Name:'高等数学'}}]},{ID:42});
    const analysis=await save(math,'math.analysis','/api/question_list/GetQuestionByIDSoleDes',{data:[{ID:7,Title:'',Content:'解析正文'}]},{ID:42});
    const chapter=await save(math,'math.course.chapters','/api/c_course_list/GetCourseListAll',{data:[{ID:9,ChapterName:'极限与连续',CourseName:'高等数学基础课程'}]});
    await save(computer,'computer.lessons','/api/exam/wx/lesson/lessonList',{data:[{id:'lesson-one',lessonName:'进程与线程',chapterName:'进程管理',courseName:'操作系统基础',mediaId:'media-one'}]});
    const courses=await save(computer,'computer.courses','/api/exam/wx/course/courseList',{data:{courseList:[{id:'os-course',courseName:'操作系统基础精讲'},{id:'ds-course',courseName:'数据结构基础精讲'}]}});
    const books=await save(math,'math.books','/api/book/GetList',{data:[{ID:'book-1',BookName:'高等数学'},{ID:'book-2',BookName:'线性代数'}]});
    const products=await save(math,'math.products','/api/c_course_product/GetProductByStuID2',{data:[{ID:'product-1',ProductName:'高等数学课程'},{ID:'product-2',ProductName:'线性代数课程'}]});
    const media=await save(computer,'computer.media','/api/exam/wx/course/get_play_info/v2',{data:{url:'https://media.example/video.m3u8'}},{mediaId:'media-one'});
    const rows=(await store.list()).resources;
    for(const selected of [question,analysis]){
      const row=rows.find(item=>item.key===selected.key);
      assert.match(row.title,/判断函数在原点连续/);assert.doesNotMatch(row.title,/<p>|不应遮住/);
      assert.ok(row.title.length<=180);assert.ok(!row.title.includes('\ufffd'));
      assert.equal((await store.detail(selected)).title,row.title);
    }
    assert.equal(rows.find(item=>item.key===chapter.key).title,'极限与连续');
    assert.equal(rows.find(item=>item.key===media.key).title,'进程与线程');
    assert.equal(rows.find(item=>item.kind==='computer.lessons').title,'进程与线程');
    for(const [selected,title]of [[courses,'课程目录（2项）'],[books,'数学教辅（2项）'],[products,'课程目录（2项）']])assert.equal(rows.find(item=>item.key===selected.key).title,title,'a directory title must not borrow its first member as a parent');
    const courseRow=rows.find(item=>item.key===courses.key);assert.equal(courseRow.subtitle,'操作系统基础精讲、数据结构基础精讲');
    assert.equal((await store.list({q:'判断函数在原点连续'})).pagination.total,2);
    const other=await save({...math,id:'other-domain'},'math.analysis','/api/question_list/GetQuestionByIDSoleDes',{data:[]},{ID:42});
    assert.equal((await store.detail(other)).title,'题目解析','related names never cross resource domains');
  }finally{await database.close();}
});
