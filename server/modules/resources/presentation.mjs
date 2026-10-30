export const resourceTypeLabels = {
  'math.books':'数学教辅', 'math.catalog':'教辅章节', 'math.albums':'专题专辑', 'math.packets':'课程资料包',
  'math.questions':'专题题目', 'math.question':'数学题目', 'math.analysis':'题目解析', 'math.files':'题目附件', 'math.practice':'练习题组',
  'math.album.catalog':'专辑目录', 'math.album.items':'专辑内容', 'math.products':'课程目录', 'math.product':'课程详情',
  'math.course.chapters':'课程章节', 'math.articles':'学习文章', 'math.exams':'模拟测评', 'math.papers':'试卷',
  'math.schools':'招生院校', 'math.colleges':'招生学院', 'math.majors':'招生专业', 'math.directions':'研究方向', 'math.studytypes':'学习方式',
  'computer.chapters':'知识章节', 'computer.groups':'章节题组', 'computer.exams':'练习试卷', 'computer.courses':'课程目录',
  'computer.course':'课程详情', 'computer.lessons':'课程课时', 'computer.schools':'招生院校', 'computer.activities':'学习活动',
  'computer.question':'408 题目', 'computer.chapter_questions':'章节题目', 'computer.paper':'试卷题目', 'computer.media':'课程视频',
};
const names = ['QuestionTitle','questionTitle','lessonName','LessonName','examinationName','examName','ProductName','CourseName','courseName','CatalogName','ChapterName','chapterName','BookName','bookName','SchoolName','schoolName','collegeName','majorName','Title','title','Name','name','QuestionTxt','exerciseStems','QuestionContent','stem'];
const questionNames=[...new Set(['QuestionTitle','questionTitle','QuestionTxt','exerciseStems','QuestionContent','stem','Title','title','Name','name',...names])];
const chapterNames=[...new Set(['CatalogName','ChapterName','chapterName','lessonName','LessonName','Title','title','Name','name','BookName','CourseName','courseName',...names])];
const lessonNames=[...new Set(['lessonName','LessonName','Title','title','Name','name',...names])];
const isQuestion = kind => /(?:question|questions|analysis|files|paper)$/.test(kind||'');
const isChapter = kind => /(?:catalog|chapters|lessons|album.items)$/.test(kind||'');
const fieldsFor = row => isQuestion(row.kind)?questionNames:String(row.kind).endsWith('.lessons')?lessonNames:isChapter(row.kind)?chapterNames:names;
const childKinds=['math.catalog','math.questions','math.question','math.analysis','math.files','math.album.catalog','math.album.items','math.course.chapters','computer.chapters','computer.groups','computer.lessons','computer.question','computer.chapter_questions','computer.paper','computer.media'];
const parents = ['ProductName','CourseName','courseName','BookName','bookName','ChapterName','chapterName','CatalogName','majorName'];
const collections = ['list','records','rows','content','examinations','examinationList','infoList','majorCustomList','courseList','courses','taskList','actSignList','groupList','exercises','exerciseList','questions','questionList'];
const text = value => typeof value==='string' ? value.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,180) : '';
const firstName = (value, fields=names) => fields.map(field=>text(value?.[field])).find(Boolean)||'';
const contextFor = row => ({...(row.request?.query||{}),...(row.request?.data?.command?{}:row.request?.data||{}),...(row.context||{})});
export function resourceTypeLabel(row) {
  if(resourceTypeLabels[row.kind])return resourceTypeLabels[row.kind];
  const path=(row.request?.path||'')+' '+(row.request?.data?.command||'');
  const label=[[/get_play_info/,'课程视频'],[/SoleDes|Resolve|Analyse|Analysis/,'题目解析'],[/question_files/,'题目附件'],[/question_list|searchExercise\/info/,'题目'],[/course|Course/,'课程资料'],[/book|Book/,'教辅资料'],[/school|School/,'招生院校']].find(([pattern])=>pattern.test(path));
  return label?.[1] || (row.platform==='computer'?'408 学习资料':'数学学习资料');
}
/** Presentation reads named content fields only, never arbitrary nested account/profile names. */
export function resourcePresentation(row) {
  if(row.display_title)return {title:text(row.display_title),typeLabel:row.type_label,subtitle:text(row.display_subtitle)};
  let body=row.response?.data??row.response?.Data??row.response;
  const rows=Array.isArray(body)?Array.isArray(body[0])?body[0]:body:collections.map(field=>body?.[field]).find(Array.isArray)||[], first=rows[0]||{}, context=contextFor(row), typeLabel=resourceTypeLabel(row);
  const firstParent=childKinds.includes(row.kind)?firstName(first,['ProductName','CourseName','courseName','BookName','bookName'])||firstName(first?._book_list,['Name']):'';
  const fields=fieldsFor(row), rootName=firstName(body,fields), itemName=firstName(first,fields), parentName=firstName(context,parents)||firstParent||firstName(body?._book_list,['Name']);
  const stored=text(row.title), technical=!stored||stored===row.kind||stored===row.request?.data?.command||/^(?:\/|https?:\/\/|Get[A-Z]|get[A-Z])/.test(stored);
  const title=rows.length>1?`${rootName||parentName||typeLabel}（${rows.length}项）`:itemName||rootName||parentName||(!technical?stored:'')||typeLabel;
  const subtitle=rows.length>1 ? [...new Set(rows.slice(0,3).map(item=>firstName(item,fields)).filter(Boolean))].join('、') : parentName && parentName!==title ? parentName : '';
  return {title,typeLabel,subtitle};
}
const quote = value => `'${String(value).replaceAll("'","''")}'`;
const cleanSql = expression => `nullif(btrim(regexp_replace(replace(replace(replace(${expression},'&nbsp;',' '),'&#160;',' '),'&amp;','&'),'<[^>]*>|[[:space:]]+',' ','g')),'')`;
const arraySql = fields => `ARRAY[${fields.map(quote).join(',')}]::text[]`;
const nameSql = (expression,fields=names) => {
  const keys=typeof fields==='string'?fields:arraySql(fields), value=cleanSql("rp_field.value#>>'{}'");
  return `(SELECT ${value} FROM jsonb_each(CASE WHEN jsonb_typeof(${expression})='object' THEN ${expression} ELSE '{}'::jsonb END) rp_field WHERE rp_field.key=ANY(${keys}) AND jsonb_typeof(rp_field.value)='string' AND ${value} IS NOT NULL ORDER BY array_position(${keys},rp_field.key) LIMIT 1)`;
};

/** Shared SQL projection keeps filtering, name sorting and read-time legacy labels consistent. */
export function resourcePresentationSql(alias='r',related='null::jsonb') {
  const contentNameSql=expression=>nameSql(expression,'rp_keys.names');
  const fieldKeys=`CASE WHEN ${alias}.kind ~ '(question|questions|analysis|files|paper)$' THEN ${arraySql(questionNames)} WHEN ${alias}.kind ~ 'lessons$' THEN ${arraySql(lessonNames)} WHEN ${alias}.kind ~ '(catalog|chapters|lessons|album.items)$' THEN ${arraySql(chapterNames)} ELSE ${arraySql(names)} END`;
  const root=`${alias}.response`, body=`coalesce(nullif(${root}->'data','null'::jsonb),nullif(${root}->'Data','null'::jsonb),${root})`;
  const rows=`CASE WHEN jsonb_typeof(rp_body.body)='array' THEN CASE WHEN jsonb_typeof(rp_body.body->0)='array' THEN rp_body.body->0 ELSE rp_body.body END ${collections.map(field=>`WHEN jsonb_typeof(rp_body.body->${quote(field)})='array' THEN rp_body.body->${quote(field)}`).join(' ')} ELSE '[]'::jsonb END`;
  const inferred=Object.keys(resourceTypeLabels).map(kind=>`WHEN ${alias}.kind=${quote(kind)} THEN ${quote(resourceTypeLabels[kind])}`).join(' ');
  const path=`coalesce(${alias}.request->>'path','')`, command=`coalesce(${alias}.request->'data'->>'command','')`;
  const pathTypes=[['get_play_info','课程视频'],['SoleDes|Resolve|Analyse|Analysis','题目解析'],['question_files','题目附件'],['question_list|searchExercise/info','题目'],['course|Course','课程资料'],['book|Book','教辅资料'],['school|School','招生院校']].map(([pattern,label])=>`WHEN ${path}||' '||${command} ~ ${quote(pattern)} THEN ${quote(label)}`).join(' ');
  const typeLabel=`CASE ${inferred} ${pathTypes} ELSE CASE WHEN ${alias}.platform='computer' THEN '408 学习资料' ELSE '数学学习资料' END END`;
  const context=`coalesce(${alias}.request->'query','{}'::jsonb)||coalesce(${alias}.context,'{}'::jsonb)`;
  const firstParent=`CASE WHEN ${alias}.kind=ANY(${arraySql(childKinds)}) THEN coalesce(${nameSql('rp_rows.items->0',['ProductName','CourseName','courseName','BookName','bookName'])},${cleanSql("rp_rows.items->0->'_book_list'->>'Name'")}) END`;
  const parent=`coalesce(${nameSql(context,parents)},${firstParent},${cleanSql("rp_body.body->'_book_list'->>'Name'")},${nameSql(related,['ProductName','CourseName','courseName','BookName','bookName'])},${cleanSql(`(${related})->'_book_list'->>'Name'`)})`;
  const oldTitle=`CASE WHEN ${alias}.title<>${alias}.kind AND ${alias}.title<>${command} AND ${alias}.title !~ '^(?:/|https?://|Get[A-Z]|get[A-Z])' THEN ${cleanSql(`${alias}.title`)} END`;
  const title=`CASE WHEN jsonb_array_length(rp_rows.items)>1 THEN coalesce(rp_names.root_name,rp_names.parent_name,${typeLabel})||'（'||jsonb_array_length(rp_rows.items)::text||'项）' ELSE coalesce(rp_names.item_name,rp_names.root_name,rp_names.related_name,rp_names.parent_name,${oldTitle},${typeLabel}) END`;
  const preview=`(SELECT string_agg(name,'、' ORDER BY position) FROM (SELECT name,min(position) AS position FROM (VALUES (${contentNameSql('rp_rows.items->0')},0),(${contentNameSql('rp_rows.items->1')},1),(${contentNameSql('rp_rows.items->2')},2)) rp_preview(name,position) WHERE name IS NOT NULL GROUP BY name) rp_unique)`;
  const subtitle=`CASE WHEN jsonb_array_length(rp_rows.items)>1 THEN coalesce(${preview},'') WHEN rp_names.parent_name IS DISTINCT FROM (${title}) THEN coalesce(rp_names.parent_name,'') ELSE '' END`;
  return {
    joins:`CROSS JOIN LATERAL (SELECT ${fieldKeys} AS names) rp_keys CROSS JOIN LATERAL (SELECT ${body} AS body) rp_body CROSS JOIN LATERAL (SELECT ${rows} AS items) rp_rows CROSS JOIN LATERAL (SELECT ${contentNameSql('rp_body.body')} AS root_name,${contentNameSql('rp_rows.items->0')} AS item_name,${parent} AS parent_name,${contentNameSql(related)} AS related_name) rp_names`,
    fields:`${title} AS display_title,${typeLabel} AS type_label,${subtitle} AS display_subtitle`,
  };
}
