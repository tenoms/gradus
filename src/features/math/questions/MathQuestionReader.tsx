import { bookViewPayload } from "./reading-progress.mjs";
import MathQuestionInsights from "./MathQuestionInsights";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  HelpCircle,
  LoaderCircle,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { normalizeMathAnalysisContent } from "./math-analysis-content.mjs";
import MathQuestionStem from "./MathQuestionStem";
import { mathOptionFeedback, mathQuestionChoice, mathQuestionMedia, mathQuestionPrompt } from "./math-question-presentation.mjs";
import "./math-choice-feedback.css";
import LearningWorkbench, { LearningWorkbenchScope } from "../../learning/workbench/LearningWorkbench";
import MathNoteEditor from "../notebook/MathNoteEditor";
import MathDiscussion from "../community/MathDiscussion";
import { NewMathQuestion } from "../community/MathQuestions";
import MathContentMarks from "./MathContentMarks";
import MathQuestionVideo from "./MathQuestionVideo";
import { mathVideoDescription } from "../media/math-video-source.mjs";
import MathExtrapolation from "./MathExtrapolation";
import MathModelTraining from "../practice/MathModelTraining";
import {
  gradeMathAnswer,
  mergeMathQuestion,
} from "../exams/math-grading";
import {
  mathApi,
  mathPost,
  mathQuestionId,
  mathRows,
  mathTitle,
} from "../api/math";
import type { MathRow, NoteKind } from "../api/math";
import { recordStudy } from "../../learning/state/store";
import { useStudyTimer } from "../../learning/time/use-study-timer";
function useRemote<T>(key: string, load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(undefined);
    load()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message || "请求失败，请稍后重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version]);
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
function State({
  loading,
  error,
  empty,
  reload,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  reload?: () => void;
}) {
  if (loading)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" size={22} />
        <p>正在加载学习内容…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
        {reload && (
          <button className="btn btn-secondary" onClick={reload}>
            <RefreshCw size={15} />
            重新加载
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="math-state">
        <BookOpen size={28} />
        <p>暂无可用内容</p>
        <small>当前分类暂无内容，可切换分类或稍后重试。</small>
      </div>
    );
  return null;
}
function msg(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
const safeUrl = (v: unknown) =>
  typeof v === "string" && /^https?:\/\//i.test(v) ? v : "";
export default function MathQuestionReader(
  props: Parameters<typeof QuestionReader>[0],
) {
  return (
    <LearningWorkbenchScope>
      <QuestionReader
        key={`${props.stuid}-${mathQuestionId(props.row)}`}
        {...props}
      />
    </LearningWorkbenchScope>
  );
}
function QuestionReader({
  row,
  book,
  stuid,
  prev,
  next,
  practice,
  onAnswered,
  readOnly,
  onAnalysisViewed,
  noteSource,
  isCourse,
  selfAssessmentOnly = false,
}: {
  row: MathRow;
  book?: MathRow;
  stuid: string;
  prev?: () => void;
  next?: () => void;
  practice?: boolean;
  selfAssessmentOnly?: boolean;
  readOnly?: boolean;
  onAnalysisViewed?: () => void;
  noteSource?: string;
  isCourse?: boolean;
  onAnswered?: (
    answer: string,
    correct: boolean,
    details?: { question: MathRow; options: MathRow[] },
  ) => Promise<void>;
}) {
  const qid = mathQuestionId(row);
  const remote = useRemote(`question-${qid}`, async () => {
    const results = await Promise.allSettled([
      mathApi.question(qid),
      mathApi.resolve(qid),
      mathApi.files(qid),
    ]);
    if (results[0].status === "rejected" && !row._question_list)
      throw results[0].reason;
    return {
      question:
        results[0].status === "fulfilled"
          ? mathRows(results[0].value)[0] || row._question_list
          : row._question_list,
      resolve:
        results[1].status === "fulfilled" ? mathRows(results[1].value) : [],
      files:
        results[2].status === "fulfilled" ? mathRows(results[2].value) : [],
    };
  });
  const [tab, setTab] = useState("题目");
  const [compareAnalysis, setCompareAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<MathRow[]>();
  const [analysisError, setAnalysisError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [viewSyncError, setViewSyncError] = useState(""),
    viewRecordKey = useRef("");
  const [noteKind, setNoteKind] = useState<NoteKind>();
  const [newQa, setNewQa] = useState(false);
  const [trainingFile, setTrainingFile] = useState<MathRow>();
  const [selected, setSelected] = useState<string[]>(
    row.MyAnswer ? String(row.MyAnswer).split(",") : [],
  );
  const [answer, setAnswer] = useState(String(row.MyAnswer || ""));
  const [result, setResult] = useState<boolean>();
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const submissionPending = useRef(false);
  const recordedPractice = useRef(false);
  const [notice, setNotice] = useState("");
  const q = mergeMathQuestion(row, remote.data?.question);
  useStudyTimer({
    key: `math-question:${stuid}:${qid}`,
    platform: "math",
    title: `${book ? mathTitle(book) + " · " : ""}第 ${row.QuestionSort || q.QuestionID || qid} 题`,
    path: isCourse ? "/study/courses" : practice ? "/study/practice" : "/study/question-bank",
    enabled: !!remote.data && !remote.loading && (tab === "题目" || tab === "解析"),
  });
  const resolve = remote.data?.resolve || [];
  const options = resolve.filter((r) => r.Type === "选项");
  const stem = resolve.filter((r) => r.Type === "题干");
  const correctIds = options
    .filter((r) => Number(r.IsAnswer) === 1)
    .map((r) => String(r.ID));
  const { multiple, immediate: immediateChoice } = mathQuestionChoice(options, q, { readOnly });
  const prompt = mathQuestionPrompt(q, stem);
  const answerKey = String(q.TypeAnswer ?? q.Answer ?? "");
  const needsSelfAssessment =
    (!options.length && !answerKey) ||
    (options.length > 0 && !correctIds.length);
  const syncBookView = (retry = false) => {
    const payload = bookViewPayload({
      stuid,
      qid,
      bookId: Number(book?.ID || q.BookID || row.BookID || 0),
      source: book
        ? book.BusType === "试卷"
          ? "真题"
          : "电子书"
        : String(row.Source || ""),
    });
    if (!payload) return;
    const key = [stuid, qid, payload.BookID].join("_");
    if (!retry && viewRecordKey.current === key) return;
    viewRecordKey.current = key;
    setViewSyncError("");
    mathPost("/api/sys_user_record/add", payload).catch((e) =>
      setViewSyncError(`解析已加载，书架阅读进度未能同步：${msg(e)}`),
    );
  };
  const loadAnalysis = async () => {
    if (analysisLoading) return;
    setTab("解析");
    if (analysis) return;
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      setAnalysis(mathRows(await mathApi.analysis(qid)));
      onAnalysisViewed?.();
      syncBookView();
      recordStudy({
        platform: "math",
        type: "analysis",
        title: `${book ? mathTitle(book) + " · " : ""}第 ${row.QuestionSort || q.QuestionID || qid} 题解析`,
        path: "/study/question-bank",
      });
    } catch (e) {
      setAnalysisError(msg(e));
    } finally {
      setAnalysisLoading(false);
    }
  };
  const submit = async (selfGrade?: boolean, selection = selected) => {
    if (readOnly || submissionPending.current) return;
    const graded = gradeMathAnswer(q, options, selection, answer);
    const mine = graded.answer;
    const correct = selfGrade ?? graded.correct ?? result;
    if (!mine && !(correct !== undefined && (selfAssessmentOnly || selfGrade !== undefined))) return;
    if (onAnswered && correct === undefined) {
      setNotice("本题暂无自动评分信息，请查看解析后选择自评结果，再保存答案。");
      return;
    }
    const canGrade = correct !== undefined;
    submissionPending.current = true;
    setSaving(true);
    setSaveFailed(false);
    setNotice("");
    try {
      if (onAnswered)
        await onAnswered(mine, correct!, { question: q, options });
      setResult(correct);
      setNotice(
        canGrade
            ? correct
              ? "回答正确，继续保持。"
              : "这道题还需要巩固，可以打开解析复盘。"
            : "已记录作答，请对照解析核对答案。",
      );
      if (!recordedPractice.current) {
        recordStudy({
          platform: "math",
          type: "practice",
          title: `第 ${row.QuestionSort || qid} 题`,
          total: 1,
          correct: canGrade ? Number(correct) : undefined,
          path: "/study/practice",
        });
        recordedPractice.current = true;
      }
    } catch (e) {
      setSaveFailed(true);
      setNotice(`答案保存失败：${msg(e)}`);
    } finally {
      submissionPending.current = false;
      setSaving(false);
    }
  };
  const navigationDisabled = saving || remote.loading || !!noteKind || newQa;
  return (
    <LearningWorkbench
      title={`第 ${row.QuestionSort || q.QuestionID || qid} 题`}
      previous={prev}
      next={next}
      disabled={navigationDisabled}
      tools={(
        <button
          type="button"
          className="learning-tool-button"
          aria-pressed={compareAnalysis}
          onClick={() => {
            setCompareAnalysis(!compareAnalysis);
            if (!compareAnalysis) void loadAnalysis();
          }}
        >
          题解对照
        </button>
      )}
    >
    <div className="panel math-question">
      <div className="math-question-top">
        <span className="math-tag">
          {q.Type || q.QuestionType || "数学题目"}
        </span>
        <span>
          第 {row.QuestionSort || q.QuestionID || qid} 题
          {row.QuestionPage ? ` · 原书 ${row.QuestionPage} 页` : ""}
        </span>
        <div className="math-question-tools">
          <button
            title="向老师提问"
            aria-label="向老师提问"
            onClick={() => setNewQa(true)}
          >
            <HelpCircle size={17} />
          </button>
          <button
            title="加入错题本"
            aria-label="加入错题本"
            onClick={() => setNoteKind("错题")}
          >
            <FileText size={17} />
          </button>
          <button
            title="加入收藏"
            aria-label="加入收藏"
            onClick={() => setNoteKind("收藏")}
          >
            <Star size={17} />
          </button>
          <button
            title="写笔记"
            aria-label="写笔记"
            onClick={() => setNoteKind("笔记")}
          >
            <BookOpen size={17} />
          </button>
        </div>
      </div>
      <div className="tabs math-question-tabs">
        {[
          "题目",
          "解析", "举一反三", "专项模块",
          "讨论",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""} aria-pressed={tab === t}
            onClick={() => (t === "解析" ? loadAnalysis() : setTab(t))}
          >
            {t}
          </button>
        ))}
      </div>
      <State
        loading={remote.loading}
        error={remote.error}
        reload={remote.reload}
      />
      <div className={`math-reader-panes ${compareAnalysis && tab === "解析" ? "is-split" : ""}`}>
      {!remote.loading && !remote.error && (tab === "题目" || (compareAnalysis && tab === "解析")) && (
        <div className="math-question-body math-question-prompt">
          <MathQuestionStem {...prompt} />
          {options.length > 0 && (
            <div className="math-options">
              {options.map((o, i) => {
                const isSelected = selected.includes(String(o.ID));
                const feedback = mathOptionFeedback(o, options, isSelected, result !== undefined || (!!readOnly && !saving) || !!analysis);
                return (
                <button
                  key={o.ID || i}
                  data-choice-mode={multiple ? "multiple" : "single"}
                  className={`${isSelected ? "selected" : ""} ${feedback}`}
                  disabled={readOnly || saving}
                  aria-pressed={selected.includes(String(o.ID))}
                  onClick={() => {
                    const selection =
                      multiple
                        ? selected.includes(String(o.ID))
                          ? selected.filter((id) => id !== String(o.ID))
                          : [...selected, String(o.ID)]
                        : [String(o.ID)];
                    if (immediateChoice && result !== undefined && selected[0] === selection[0] && !saveFailed) return;
                    setSelected(selection);
                    setResult(undefined);
                    setNotice("");
                    if (immediateChoice) void submit(undefined, selection);
                  }}
                >
                  <span>{String.fromCharCode(65 + i)}</span>
                  <RichContent content={o.Content} />
                  {feedback === "math-choice-incorrect" ? <X size={18} aria-label="回答错误" /> : feedback === "math-choice-correct" && <Check size={18} aria-label="正确答案" />}
                </button>
              );})}
            </div>
          )}
          {!options.length && !selfAssessmentOnly && (
            <label className="math-answer-label">
              我的答案
              <textarea
                className="input"
                disabled={readOnly || saving}
                placeholder="写下你的答案或解题思路…"
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setResult(undefined);
                  setNotice("");
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !needsSelfAssessment) {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
            </label>
          )}
          {needsSelfAssessment && !readOnly && !selfAssessmentOnly && (
            <div className="math-self-assessment">
              <span>本题需对照解析自评</span>
              <button
                className={result === true ? "active" : ""} aria-pressed={result === true}
                disabled={saving}
                onClick={() => {
                  void submit(true);
                }}
              >
                回答正确
              </button>
              <button
                className={result === false ? "active" : ""} aria-pressed={result === false}
                disabled={saving}
                onClick={() => {
                  void submit(false);
                }}
              >
                需要巩固
              </button>
            </div>
          )}
          <div className="math-answer-actions">
            {!readOnly && (!selfAssessmentOnly || options.length > 0) && (!immediateChoice || saveFailed) && !needsSelfAssessment && (
              <button
                className="btn btn-primary"
                disabled={
                  readOnly || saving || (!selected.length && !answer.trim())
                }
                onClick={() => submit()}
              >
                {saving ? "保存中…" : saveFailed ? "重试保存答案" : practice ? "保存本题答案" : "核对答案"}
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={loadAnalysis}
            >
              查看解析
            </button>
          </div>
          {immediateChoice && <p className="math-answer-hint">{saving ? "正在保存答案…" : onAnswered ? "选择选项后直接核对并保存答案。" : "选择选项后直接核对答案。"}</p>}
          {notice && (
            <div
              className={`math-notice ${result === true ? "success" : ""}`}
              role="status"
            >
              {notice}
            </div>
          )}
        </div>
      )}
      {tab === "解析" && (
        <div className="math-question-body math-question-analysis" aria-label="题目解析">
          <State
            loading={analysisLoading}
            error={analysisError}
            empty={!analysisLoading && !analysisError && !analysis?.length}
            reload={loadAnalysis}
          />
          {analysis?.map((a, i) => (
              <AnalysisBlock
                key={a.ID || i}
                row={{
                  ...a,
                  QuestionID: qid,
                  BookID: Number(book?.ID || q.BookID || row.BookID || 0),
                }}
                onModel={(file) => {
                  setTrainingFile(file);
                  setTab("专项模块");
                }}
              />
            ))}
          {selfAssessmentOnly && !options.length && !readOnly && analysis && (
            <div className="math-answer-actions">
              <span>对照解析后记录本题：</span>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => submit(true)}
              >
                回答正确
              </button>
              <button
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => submit(false)}
              >
                需要巩固
              </button>
              {notice && <p role="status">{notice}</p>}
            </div>
          )}
          {viewSyncError && (
            <div className="error-banner" role="status">
              <span>{viewSyncError}</span>
              <button
                className="btn btn-secondary"
                onClick={() => syncBookView(true)}
              >
                重试同步
              </button>
            </div>
          )}
          <MathQuestionInsights
            stuid={stuid}
            qid={qid}
            bookId={Number(book?.ID || q.BookID || row.BookID || 0)}
          />
          {remote.data?.files?.length ? (
            <div className="math-file-list">
              <h4>相关附件</h4>
              {remote.data.files.map((f, i) => (
                <MediaFile
                  key={f.ID || i}
                  row={{
                    ...f,
                    QuestionID: qid,
                    BookID: Number(book?.ID || q.BookID || row.BookID || 0),
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
      </div>
      {tab === "举一反三" && (
        <MathExtrapolation
          sourceQuestionId={qid}
          stuid={stuid}
          renderQuestion={(question) => (
            <MathQuestionReader
              row={question}
              stuid={stuid}
            />
          )}
        />
      )}
      {tab === "专项模块" &&
        (trainingFile ? (
          <MathModelTraining
            stuid={stuid}
            fileId={trainingFile.ID}
            questionId={qid}
            onClose={() => setTrainingFile(undefined)}
            renderQuestion={(props) => (
              <MathQuestionReader {...props} stuid={stuid} noteSource="专辑" />
            )}
          />
        ) : (
          <div className="math-model-choices">
            {(remote.data?.files || [])
              .filter(
                (f) =>
                  /模块|专项/.test(f.BusType || "") ||
                  f._book_highscorealbum?.ID,
              )
              .map((f, i) => (
                <button
                  className="math-file-link"
                  key={f.ID || i}
                  onClick={() => setTrainingFile(f)}
                >
                  <BookOpen size={17} />
                  {f.Title || f._book_highscorealbum?.Title || "专项能力模块"}
                  <ArrowRight size={14} />
                </button>
              ))}
            {!(remote.data?.files || []).some(
              (f) =>
                /模块|专项/.test(f.BusType || "") || f._book_highscorealbum?.ID,
            ) && (
              <div className="math-state">
                <p>这道题暂未关联专项能力模块</p>
                <small>可以从课程查漏补缺或数学专辑的习题组进入训练。</small>
              </div>
            )}
          </div>
        ))}
      {tab === "讨论" && <MathDiscussion qid={qid} stuid={stuid} />}
      <div className="math-question-footer">
        <button className="btn btn-secondary" disabled={!prev || navigationDisabled} onClick={prev}>
          <ArrowLeft size={15} />
          上一题
        </button>
        <button className="btn btn-primary" disabled={!next || navigationDisabled} onClick={next}>
          下一题
          <ArrowRight size={15} />
        </button>
      </div>
      {newQa && (
        <NewMathQuestion
          stuid={stuid}
          question={{
            ...q,
            ...row,
            QuestionID: qid,
            BookName: book
              ? mathTitle(book)
              : q._book_list?.Name || row.BookName,
          }}
          close={() => setNewQa(false)}
          saved={() => setNewQa(false)}
        />
      )}
      {noteKind && (
        <MathNoteEditor
          qid={qid}
          bookId={Number(book?.ID || q.BookID || row.BookID || 0)}
          stuid={stuid}
          kind={noteKind}
          source={
            noteSource ||
            row.Source ||
            (book?.BusType === "试卷" ? "真题" : "电子书")
          }
          isCourse={isCourse ?? row.IsCourse === "2"}
          close={() => setNoteKind(undefined)}
        />
      )}
    </div>
    </LearningWorkbench>
  );
}
function QuestionImage({ value }: { value: unknown }) {
  return safeUrl(value) ? (
    <img
      className="math-question-image"
      src={String(value)}
      alt="原题图片"
      loading="lazy"
    />
  ) : null;
}
function AnalysisBlock({
  row,
  onModel,
}: {
  row: MathRow;
  onModel?: (row: MathRow) => void;
}) {
  const content = normalizeMathAnalysisContent(
    (row.BusUrl === "知识库" && row._question_code?.Content) ||
    row.Content ||
    row.Analysis ||
    row.Context ||
    row.Contexts ||
    row.QuestionTxt,
  );
  const media = mathQuestionMedia(row);
  if (!content && media.kind === "none") return null;
  if (media.kind === "video" || media.kind === "polyv") {
    const description = mathVideoDescription(content);
    return <section className="math-analysis-block math-video-analysis">
      {description && description !== media.url && <RichContent content={description} />}
      <MediaFile row={row} />
    </section>;
  }
  return (
    <section className="math-analysis-block">
      <h4>{row.BusType || row.Type || row.Name || row.Title || "解题解析"}</h4>
      {content && <RichContent content={content} />}
      {onModel &&
        (/模块|专项/.test(row.BusType || "") ||
          row._book_highscorealbum?.ID) && (
          <button className="btn btn-primary" onClick={() => onModel(row)}>
            进入专项能力模块
            <ArrowRight size={15} />
          </button>
        )}
      <MediaFile row={row} />
      {row.BusType !== "视频解析" && row.ID && row.QuestionID && (
        <MathContentMarks
          fileId={row.ID}
          questionId={row.QuestionID}
          baseType={row.BusType || "文字解析"}
        />
      )}
    </section>
  );
}
function MediaFile({ row }: { row: MathRow }) {
  const media = mathQuestionMedia(row);
  const { url } = media;
  if (media.kind === "video" || media.kind === "polyv") return <section className="math-explanation-video" aria-label="视频解析">
    <h4>{row.Title || row.Name || "视频解析"}</h4>
    <MathQuestionVideo row={row} origin={row.QuestionID ? { kind: "analysis", questionId: row.QuestionID, ...(row.ID ? { itemId: row.ID } : {}) } : undefined} />
  </section>;
  if (!url) return null;
  if (media.kind === "image")
    return <QuestionImage value={url} />;
  return (
    <a className="math-file-link" href={url} target="_blank" rel="noreferrer">
      <FileText size={17} />
      {row.Name || row.Title || "打开相关资料"}
      <ArrowRight size={14} />
    </a>
  );
}
