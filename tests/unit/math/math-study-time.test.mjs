import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute each real component's setup through its timer registration. Rendering
// and effects stay inert so the regression checks business readiness, not clocks.
async function timerSetup(path, name) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(component, name);
  const index = component.body.statements.findIndex(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useStudyTimer");
  assert.ok(index >= 0, `${name} registers real study time`);
  const setup = component.body.statements.slice(0, index + 1).map(node => node.getText(ast)).join("\n");
  const declaration = `function ${name}(${component.parameters.map(node => node.getText(ast)).join(",")}) { ${setup} }`;
  const executable = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return ({ state = {}, remote = {}, props = {} } = {}) => {
    let cursor = 0, timer;
    const rows = response => Array.isArray(response?.data) ? response.data : [];
    const loaded = { data: { question: { QuestionID: 9, QuestionTxt: "计算行列式" } }, loading: false, error: "", ...remote };
    const scope = {
      useState(initial) {
        const index = cursor++;
        return [Object.hasOwn(state, index) ? state[index] : typeof initial === "function" ? initial() : initial, () => {}];
      },
      useRef: current => ({ current }),
      useEffect() {},
      useSession: () => ({ session: { user: { id: "web-student" } } }),
      useRemote: () => loaded,
      useAsync: () => loaded,
      useComputing: () => loaded,
      useData: key => key.startsWith("module-info") ? { ...loaded, data: { albumId: 5, chapters: [] } } : loaded,
      useAlbumData: key => key.startsWith("content-") ? loaded : { ...loaded, data: [] },
      useMathLearningPlan: () => ({ stage: "基础" }),
      useStudyTimer: options => { timer = options; },
      mathRows: rows,
      mathTitle: row => row.Name || row.Title || "学习内容",
      courseLabel: row => row.Title || row.Name || "课程资料",
      url: value => typeof value === "string" && /^https?:\/\//.test(value) ? value : "",
      mathQuestionId: row => row.QuestionID || row.ID,
      mergeMathQuestion: (...values) => Object.assign({}, ...values),
      mathQuestionChoice: () => ({ multiple: false, immediate: false }),
      computingCorrect: () => false,
      existingRecord: () => ({}),
      recordScore: () => 0,
      questionMax: () => 10,
      optionRows: () => [],
      correctOptionIds: () => [],
      questionKey: row => String(row.QuestionID || row.ID || ""),
      recordAnswer: () => "",
      answerProgress: () => ({}),
      examName: row => row.Name || "数学测评",
      mathApi: {},
    };
    const componentFunction = runInNewContext(`${executable}\n${name};`, scope);
    componentFunction({ row: { QuestionID: 9 }, stuid: "web-student", context: { stuid: "web-student", kind: "dry", PaperID: 7 }, ...props });
    return timer;
  };
}

const question = await timerSetup("../../../src/features/math/questions/MathQuestionReader.tsx", "QuestionReader");
const moduleReading = await timerSetup("../../../src/features/math/practice/MathModelTraining.tsx", "MathModelTraining");
const moduleQuestion = await timerSetup("../../../src/features/math/practice/MathModelTraining.tsx", "ModuleQuestion");
const album = await timerSetup("../../../src/features/math/practice/MathAlbums.tsx", "MathAlbums");
const computing = await timerSetup("../../../src/features/math/practice/MathComputing.tsx", "ComputingPaper");
const exam = await timerSetup("../../../src/features/math/exams/MathExams.tsx", "PaperRunner");
const courseReading = await timerSetup("../../../src/features/math/courses/MathCourses.tsx", "TaskList");
const courseAlbum = await timerSetup("../../../src/features/math/courses/MathCourseAlbum.tsx", "MathCourseAlbum");
const knowledge = await timerSetup("../../../src/features/math/resources/MathInformationResources.tsx", "KnowledgeArticle");

test("math question reading waits for content and hands timing over to nested training", () => {
  const reading = question();
  assert.equal(reading.enabled, true);
  assert.equal(question({ remote: { loading: true } }).enabled, false);
  assert.equal(question({ remote: { data: undefined, error: "failed" } }).enabled, false);
  const analysis = question({ state: { 0: "解析" } });
  assert.equal(analysis.enabled, true);
  assert.equal(analysis.key, reading.key, "switching between question and explanation keeps one session");
  for (const tab of ["举一反三", "专项模块", "讨论"])
    assert.equal(question({ state: { 0: tab } }).enabled, false, tab);
});

test("module and album reading count displayed content and stop when entering a child exercise", () => {
  const remote = { data: { data: [{ ID: 1, Content: "模块要点" }] } };
  assert.equal(moduleReading({ remote }).enabled, true);
  assert.equal(moduleReading({ remote, state: { 2: { ID: 11 } } }).enabled, false);
  assert.equal(moduleReading({ remote: { data: [] } }).enabled, false);
  assert.equal(moduleQuestion().enabled, true);
  assert.equal(moduleQuestion({ remote: { loading: true } }).enabled, false);
  const chapter = { 2: { ID: 5, Name: "数学专辑" }, 3: { ID: 6, Name: "第一章" } };
  assert.equal(album({ remote, state: chapter }).enabled, true);
  assert.equal(album({ remote, state: { ...chapter, 7: { ID: 11 } } }).enabled, false);
  assert.equal(album({ remote: { data: [] }, state: chapter }).enabled, false);
});

test("computing and exam clocks exclude loading and unopened papers while counting post-submission review", () => {
  const computingState = { 0: [{ QuestionID: 9 }], 10: true };
  assert.equal(computing({ state: computingState }).enabled, true);
  assert.equal(computing({ state: { ...computingState, 4: true } }).enabled, true, "submitted computing answers remain available for review");
  assert.equal(computing({ state: computingState, remote: { error: "failed" } }).enabled, false);
  const examState = { 3: [{ QuestionID: 9 }], 16: true };
  assert.equal(exam({ state: examState }).enabled, false);
  const begun = { ...examState, 8: true };
  assert.equal(exam({ state: begun }).enabled, true);
  assert.equal(exam({ state: { ...examState, 9: true } }).enabled, true, "an already submitted paper opens directly into review");
  assert.equal(exam({ state: begun, remote: { error: "failed" } }).enabled, false);
  assert.equal(exam({ state: { ...begun, 0: { PaperID: 8 } } }).enabled, false);
});

test("course text and chapter reading exclude navigation and child video or question sessions", () => {
  const text = { ID: 8, BusType: 7, Content: "课程讲义" };
  assert.equal(courseReading({ state: { 0: text } }).enabled, true);
  assert.equal(courseReading({ state: { 0: text, 1: { PaperID: 10 } } }).enabled, false);
  assert.equal(courseReading().enabled, false);
  for (const BusType of [1, 2, 8])
    assert.equal(courseReading({ state: { 0: { ...text, BusType } } }).enabled, false);
  const remote = { data: { info: { Name: "课程专辑" }, catalogs: [], rows: [text] } };
  const state = { 0: { ID: 6, Name: "第一章" } };
  assert.equal(courseAlbum({ remote, state }).enabled, true);
  assert.equal(courseAlbum({ remote, state: { ...state, 1: { QuestionID: 9 } } }).enabled, false);
  assert.equal(courseAlbum({ remote: { ...remote, loading: true }, state }).enabled, false);
});

test("knowledge articles count actual displayed reading content but not external file links alone", () => {
  assert.equal(knowledge({ props: { row: { ID: 7, Content: "学习方法" } } }).enabled, true);
  assert.equal(knowledge({ props: { row: { ID: 7, Files: "https://example.test/handout.pdf" } } }).enabled, false);
  assert.equal(knowledge({ props: { row: { ID: 7, Content: "学习方法" } }, remote: { loading: true } }).enabled, false);
});

test("course playback records one business activity on actual playing independently of saved progress", async () => {
  const source = await readFile(new URL("../../../src/features/math/courses/MathCourses.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("MathCourses.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "NativeVodPlayer");
  const executable = ts.transpileModule(component.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React, jsxFactory: "element" },
  }).outputText;
  const activities = [];
  let state = 0;
  const scope = {
    element: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => [state++ === 2 ? true : initial, () => {}],
    useRef: current => ({ current }),
    useEffect() {},
    mathVideoSource: () => ({ vid: "course-video" }),
    durationSeconds: () => 100,
    courseLabel: row => row.Title,
    recordActivity: activity => activities.push(activity),
    MathVideoPlayer: "MathVideoPlayer", Files: "Files", MathVideoFeedback: "MathVideoFeedback", LoaderCircle: "LoaderCircle",
  };
  const player = runInNewContext(`${executable}\nNativeVodPlayer;`, scope);
  const tree = player({ task: { BusID: 9, Data: { Title: "课程课时" } }, context: { StuID: "web-student", CourseID: 5, CalendarID: 6 }, onSaved() {}, onRetry() {} });
  const video = tree.props.children.find(node => node?.type === "MathVideoPlayer");
  assert.equal(activities.length, 0, "loading a lesson does not claim it was watched");
  video.props.onPlaying();
  video.props.onPlaying();
  assert.equal(activities.length, 1, "resume and buffering recovery do not duplicate business events");
  assert.equal(activities[0].type, "course");
  assert.equal(activities[0].title, "课程课时");
  assert.equal(Object.hasOwn(activities[0], "durationSeconds"), false, "the shared media timer owns duration");
});
