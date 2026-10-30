/** Resource transport and private study state are deliberately separate. */
export function mathParameters(input) {
  if (!input.data?.command) return { ...input.query, ...input.data };
  try { return typeof input.data.data === 'string' ? JSON.parse(input.data.data) : input.data.data || {}; }
  catch { return {}; }
}
const computerWrites = /\/(?:submitExam|submit\/sheet\/index|random\/answer\/submit|examination\/exercise\/reset|personal\/(?:collectExercise|incorrectExercise|addExerciseNote|exerciseRedo|addMajorCustom|deleteMajor)|user\/(?:updateUserInfo|modelInfo\/update|addTargetSchool)|lessonHistory\/add\/|banner\/click\/save|actSign\/content\/(?:submit|delete|likes|cancel\/likes|comment\/add))(?:\/|$)/i;
const computerPrivateReads = /\/(?:personal\/(?!OtherExamExercise)|practice\/(?:answerRecord|exerciseRecord|examinationRecord|basic\/progress\/stat)|user\/(?:detail|targetSchool)|actSign\/task\/undo\/list)(?:\/|$)/i;
const mathPrivateCommands = /(?:GetUser(?:Info|Last|Log|Record|CourseQrcode|Comment|ReplyComment|QuestionOrder|Problem|QA|Capacity|Integral|Extrapolation|Frist)|GetSysUser(?:Book|QuestionBook|Record|Behavior|Client)|GetRelQuestionLog|GetQuestionLogInfo|GetCatalogHistory|GetBookList(?:SysUser|CountAndLook)|Get(?:My|AnswerUser|AnswerTeacher|NewAnswerTeacher|TeacherWait|TeacherProblem|TeacherQuestion)|Get(?:ExamStatistics|ExamUser|UserExam|MajorComputing(?:LastLog|UserError)|PaperPastPerformance|PaperRecordCounts|ProductLastTimeLog|CourseProductRecordCounts|CoursePacketLastStudy|SysGiveAuto)|getUserQA)/i;
const mathPrivatePaths = /\/api\/(?:rel_question_log|sys_user_(?:book_catalog|book_question|record)|choice_question_exercise(?:_log)?|sys_users_(?:info|function_allocation|dryrun_(?:paperlog|questionlog))|sys_msg_push|sys_integral_log|book_highscorealbum_studylog|quesiton_extrapolation_log|question_(?:files_give|order_comments|order_log|orders|capacity_log)|c_(?:course_product_log|course_users(?:_progress|_record)?|paper_users_record|paper_student(?:_record|_recommend)?)|ks_user_(?:paper|record))\//i;
export function sharedOperation(name, input) {
  if (name === 'computer') {
    if (computerWrites.test(input.path)) return 'write';
    if (computerPrivateReads.test(input.path) || (/^\/api\/exam\/wx\/personal\//.test(input.path) && !/\/OtherExamExercise$/.test(input.path))) return 'private';
    if (input.method !== 'GET' && !/\/(?:cache\/examination\/group|ai\/(?:retry\/)?score)$/.test(input.path)) return 'write';
    return 'resource';
  }
  if (input.data?.command) {
    if (['GetBookListCountAndLookCount_New','GetBookListCountAndLookCount'].includes(input.data.command)) return 'resource';
    if (['GeKstUserPaperInfo','GetKsPaperQuestionAndksUserRecordListNew','GetDryAppliInfoStuID'].includes(input.data.command)) return 'private';
    return mathPrivateCommands.test(input.data.command) ? 'private' : 'resource';
  }
  const action = input.path.split('/').at(-1);
  if (/^(?:Inner|Del|Dels|Update|Rel|Reset|Submit|add$|give$|consume$|Activation|Act|Bind|Experience|Unlock|Set|Read$)/i.test(action)) return 'write';
  if (mathPrivatePaths.test(input.path)) return 'private';
  return 'resource';
}
const personalFields = new Set(['correctnumber','incorrectnumber','answertotalnumber','todayexaminationrecordnum','lastexaminationgroupid','myanswer','myanswers','useranswer','useranswers','answerlist','answers','answerrecord','answerrecords','examrecord','examrecordid','examinationrecordid','collectexerciseid','collected','exercisenote','sheetindex','lastsheetindex','isfinish','issubmit','studentcount','studyprogress','studyduration','laststudytime','lastviewtime','lookcount','myrightcount','myerrorcount','mynotes','mystate','exerciseidlog','exercisehistory','userrecord','userrecords','isfavorite','ismistake','myscore','iscollected','mycount','myduration','finishedcount','rightcount','wrongcount','answeredcount','userprogress','isdone','mynote']);
export function stripSharedPersonalState(value) {
  if (Array.isArray(value)) return value.filter(item => !(item && typeof item === 'object' && ['题目','错题','收藏','笔记'].includes(item.Type) && ('StuID' in item || 'MyAnswer' in item))).map(stripSharedPersonalState);
  if (!value || typeof value !== 'object') return value;
  const lesson = ['lessonName','watchHistoryTime','lessonBulletComments'].some(key=>Object.hasOwn(value,key));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !personalFields.has(key.toLowerCase()) && !/^(?:watchHistoryTime|historyModifyDate|lessonBulletComments)$/i.test(key) && !(lesson && key.toLowerCase()==='progress') && !/^_(?:.*(?:users?|student).*records?|.*(?:question|exercise|paper).*log|ks_user_paper)$/i.test(key)).map(([key, item]) => [key, stripSharedPersonalState(item)]));
}
