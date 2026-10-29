import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedOperation, stripSharedPersonalState } from '../server/shared-account-policy.mjs';

// These commands are used by the notebook, history, discussion, enrolment and weekly exam screens.
const privateMathCommands = [
  'GetSysUserQuestionBookList', 'GetUserCourseQrcodeBookListPager1', 'GetUserCourseQrcodeBookListPager11',
  'GetUserCourseQrcodePhotoBookListPager1', 'GetUserCourseQrcodeBookList2',
  'GetUserCommentGiveList_lt', 'GetUserReplyCommentList_lt', 'GetUserReplyCommentNoReadCount_ltmath',
  'GeKstUserPaperInfo', 'GetKsPaperQuestionAndksUserRecordListNew', 'GetDryAppliInfoStuID',
];

test('shared math readers route actual notebook, history, reply and exam identities to Web ownership', () => {
  for (const command of privateMathCommands) {
    const input = { path:'/api/Master/AutoModel', method:'POST', data:{command,data:JSON.stringify({StuID:'shared-source-student'})}, query:{} };
    assert.equal(sharedOperation('math',input),'private',command);
  }
  for (const command of ['GetBookPaperListOfVip','GetBookListCountAndLookCount_New','GetQuestionInfoByResolve']) {
    assert.equal(sharedOperation('math',{path:'/api/Master/AutoModel',method:'POST',data:{command,data:'{}'},query:{}}),'resource',command);
  }
});

test('mixed course question resources cannot retain the source student answer or grading records', () => {
  const result = stripSharedPersonalState({data:[{
    QuestionID:42,QuestionTitle:'资源题目',Answer:'A',
    _c_course_users_record:{ID:90,StuID:'source-student',Score:7,MyAnswer:'B'},
    _c_paper_student_record:{ID:91,StuID:'source-student',TeacherComment:'原学生评语',Score:6},
    IsFavorite:1,IsMistake:1,MyScore:7,
  }]});
  assert.equal(result.data[0].QuestionTitle,'资源题目');
  assert.equal(result.data[0].Answer,'A');
  assert.equal(result.data[0]._c_course_users_record,undefined);
  assert.equal(result.data[0]._c_paper_student_record,undefined);
  assert.equal(result.data[0].IsFavorite,undefined);
  assert.equal(result.data[0].IsMistake,undefined);
  assert.equal(result.data[0].MyScore,undefined);
  assert.equal(JSON.stringify(result).includes('source-student'),false);
});
