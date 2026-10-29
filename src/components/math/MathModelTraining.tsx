import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Flag,
  Heart,
  LoaderCircle,
  Play,
} from "lucide-react";
import RichContent from "../RichContent";
import MathQuestionVideo from "./MathQuestionVideo";
import MathQuestionTools, { MathFeedbackButton } from "./MathQuestionTools";
import {
  mathApi,
  mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathRows,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import {
  gradeMathAnswer,
  mergeMathQuestion,
} from "../../platforms/math-grading";
import { useSession } from "../../lib/session";
import { mathVipActive } from "../../platforms/math-access";
import { mathContentLikeDelete } from "../../platforms/math-content-marks";
import { recordStudy } from "../../lib/store";
import {
  modelExerciseCount,
  modelStudyPayload,
} from "../../platforms/math-model";
import "./math-model-training.css";

export interface MathModelContext {
  ProductID?: string | number;
  CourseID?: string | number;
  CalendarID?: string | number;
  PaperID?: string | number;
  LeadFillID?: string | number;
}
export interface ModelReaderProps {
  row: MathRow;
  prev?: () => void;
  next?: () => void;
  onAnswered: (
    answer: string,
    correct: boolean,
    details?: { question: MathRow; options: MathRow[] },
  ) => Promise<void>;
  onAnalysisViewed: () => void;
  readOnly?: boolean;
}
interface Props {
  stuid: string;
  fileId?: string | number;
  albumId?: string | number;
  catalogId?: string | number;
  groupId?: string | number;
  questionId?: string | number;
  kind?: "module" | "album";
  isLeadFill?: boolean;
  allowPractice?: boolean;
  context?: MathModelContext;
  onClose?: () => void;
  onCompleted?: () => void;
  renderQuestion?: (props: ModelReaderProps) => ReactNode;
}
function useData(key: string, load: () => Promise<any>) {
  const [data, setData] = useState<any>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(undefined);
    setError("");
    load()
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version]);
  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}
function Status({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  retry?: () => void;
}) {
  if (loading)
    return (
      <div className="math-state">
        <LoaderCircle className="spin" size={23} />
        <p>正在读取专项训练…</p>
      </div>
    );
  if (error)
    return (
      <div className="math-state math-error">
        <p>{error}</p>
        {retry && (
          <button className="btn btn-secondary" onClick={retry}>
            重新加载
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="math-state">
        <BookOpen size={28} />
        <p>当前模块暂无可用的训练内容</p>
      </div>
    );
  return null;
}
export function modelContentTree(rows: MathRow[]): MathRow[] {
  const copies: MathRow[] = rows.map((r) => ({ ...r, children: [] }));
  const map = new Map(copies.map((r) => [String(r.ID), r]));
  for (const r of copies) {
    const parent = map.get(String(r.PID));
    if (parent && parent !== r) parent.children.push(r);
  }
  return copies
    .filter(
      (r) =>
        !r.PID || !map.has(String(r.PID)) || String(r.ID) === String(r.PID),
    )
    .sort((a, b) => Number(a.Sort || 0) - Number(b.Sort || 0));
}

export default function MathModelTraining({
  stuid,
  fileId,
  albumId,
  catalogId,
  groupId,
  questionId,
  kind = "module",
  isLeadFill = false,
  allowPractice = false,
  context = {},
  onClose,
  onCompleted,
  renderQuestion,
}: Props) {
  const { session } = useSession();
  const mayPractice =
    isLeadFill ||
    allowPractice ||
    Number(context.ProductID) > 0 ||
    mathVipActive(session.platforms.math.user || {});
  const [accessNotice, setAccessNotice] = useState("");
  const info = useData(`module-info-${fileId}-${albumId}`, async () => {
    const file = fileId
      ? mathRows(
          await mathGet("/api/question_files/GetListByPage", { ID: fileId }),
        )[0]
      : undefined;
    const actualAlbum = albumId || file?.BusID;
    if (!actualAlbum) throw new Error("当前题目没有关联可用的训练模块");
    const chapters = mathRows(await mathApi.albumCatalog(actualAlbum));
    return { file, albumId: actualAlbum, chapters };
  });
  const [completionError, setCompletionError] = useState("");
  const [chapter, setChapter] = useState<string | number | undefined>(
    catalogId,
  );
  const [group, setGroup] = useState<MathRow | undefined>(
    groupId
      ? {
          ID: groupId,
          AlbumID: albumId,
          CatalogID: catalogId,
          QuestionID: questionId,
        }
      : undefined,
  );
  useEffect(() => {
    if (info.data && !chapter) setChapter(info.data.chapters[0]?.ID);
  }, [info.data]);
  const content = useData(`module-content-${chapter}`, () =>
    chapter ? mathApi.albumItems(chapter) : Promise.resolve({ data: [] }),
  );
  useEffect(() => {
    setCompletionError("");
    const nodes = mathRows(content.data);
    if (
      content.data &&
      nodes.length &&
      isLeadFill &&
      context.LeadFillID &&
      modelExerciseCount(nodes) === 0
    ) {
      mathPost(
        "/api/c_paper_student_recommend/Inner_c_paper_student_recommend",
        { ID: context.LeadFillID, IsFinsh: 1, UpdateColumns: "IsFinsh" },
      )
        .then(() => onCompleted?.())
        .catch((e) =>
          setCompletionError(e.message || "学习完成状态未能同步，请重试"),
        );
    }
  }, [content.data, context.LeadFillID]);
  if (group && !mayPractice)
    return (
      <div className="panel math-state">
        <p>当前账号暂未开通这组专项训练权限。</p>
        <button
          className="btn btn-secondary"
          onClick={() => (groupId ? onClose?.() : setGroup(undefined))}
        >
          返回模块内容
        </button>
      </div>
    );
  if (group)
    return (
      <ModulePractice
        stuid={stuid}
        albumId={group.AlbumID || info.data?.albumId || albumId}
        catalogId={group.CatalogID || chapter || catalogId}
        group={group}
        questionId={group.QuestionID || questionId}
        kind={kind}
        isLeadFill={isLeadFill}
        context={context}
        back={() => (groupId ? onClose?.() : setGroup(undefined))}
        onCompleted={onCompleted}
        renderQuestion={renderQuestion}
      />
    );
  const nodes = mathRows(content.data);
  return (
    <div className="math-workspace">
      {onClose && (
        <button className="math-back" onClick={onClose}>
          <ArrowLeft size={15} />
          返回学习内容
        </button>
      )}
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">KNOWLEDGE INTO SKILL</span>
          <h2>
            {info.data?.file?.Title ||
              info.data?.file?._book_highscorealbum?.Title ||
              "专项能力训练"}
          </h2>
          <p>先理解要点，再用同组题目练习，逐题记录你的掌握程度。</p>
        </div>
      </div>
      <Status loading={info.loading} error={info.error} retry={info.reload} />
      {info.data && (
        <>
          <div className="panel mmt-chapters">
            <label>
              模块章节
              <select
                className="input"
                value={chapter || ""}
                onChange={(e) => setChapter(e.target.value)}
              >
                {info.data.chapters.map((r: MathRow, i: number) => (
                  <option key={r.ID || i} value={r.ID}>
                    {r.Title || r.Name || `第${i + 1}节`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="panel mmt-reading">
            <Status
              loading={content.loading}
              error={content.error}
              empty={!content.loading && !nodes.length}
              retry={content.reload}
            />
            {completionError && (
              <div className="math-state math-error">
                <p>{completionError}</p>
                <button className="btn btn-secondary" onClick={content.reload}>
                  重新同步学习状态
                </button>
              </div>
            )}
            {accessNotice && (
              <p className="math-error-text" role="alert">
                {accessNotice}
              </p>
            )}
            <ModuleNodes
              rows={modelContentTree(nodes)}
              onPractice={(r, initial) => {
                if (!mayPractice) {
                  setAccessNotice(
                    "当前账号暂未开通这组专项训练权限，可在已有权益中核对。",
                  );
                  return;
                }
                setGroup({
                  ...r,
                  AlbumID: r.AlbumID || info.data.albumId,
                  CatalogID: r.CatalogID || chapter,
                  QuestionID: initial,
                });
              }}
            />
          </div>
          {fileId && (
            <ModuleMarks
              fileId={fileId}
              stuid={stuid}
              questionId={questionId || 0}
            />
          )}
        </>
      )}
    </div>
  );
}
function ModuleNodes({
  rows,
  onPractice,
}: {
  rows: MathRow[];
  onPractice: (row: MathRow, initial?: number | string) => void;
}) {
  return (
    <>
      {rows.map((r, i) => {
        const children = r.children || [];
        const exercises = children.filter(
          (c: MathRow) => Number(c.QuestionID) > 0,
        );
        return (
          <section className="mmt-node" key={r.ID || i}>
            {r.Title && <h3>{r.Title}</h3>}
            {r.Content && <RichContent content={r.Content} />}
            <RichContent content={r.QuestionTxt} />
            {r.Type === "视频" || r.PlayVid ? (
              <MathQuestionVideo
                row={{ ...r, PolyvVID: r.PlayVid || r.BusValue }}
              />
            ) : null}
            {exercises.length > 0 && (
              <div className="mmt-exercise-group">
                <div className="mmt-group-header">
                  <BookOpen size={19} />
                  <strong>
                    {r.Type === "题目" ? "同组训练" : r.Type || "专项练习"} ·{" "}
                    {exercises.length} 道题目
                  </strong>
                  <button
                    className="btn btn-primary"
                    onClick={() => onPractice(r)}
                  >
                    进入训练
                    <ArrowRight size={14} />
                  </button>
                </div>
                {exercises.map((q: MathRow, j: number) => (
                  <button
                    className="mmt-question-preview"
                    key={q.ID || j}
                    onClick={() => onPractice(r, q.QuestionID)}
                  >
                    <span>{j + 1}</span>
                    <RichContent
                      content={q.QuestionTxt || q.Content || `题目${j + 1}`}
                    />
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            )}
            {!exercises.length && children.length > 0 && (
              <ModuleNodes rows={children} onPractice={onPractice} />
            )}
            <ModuleNodes
              rows={modelContentTree(r.ContentList || [])}
              onPractice={onPractice}
            />
          </section>
        );
      })}
    </>
  );
}
function ModulePractice({
  stuid,
  albumId,
  catalogId,
  group,
  questionId,
  kind,
  isLeadFill,
  context,
  back,
  onCompleted,
  renderQuestion,
}: {
  stuid: string;
  albumId?: number | string;
  catalogId?: number | string;
  group: MathRow;
  questionId?: number | string;
  kind: "module" | "album";
  isLeadFill: boolean;
  context: MathModelContext;
  back: () => void;
  onCompleted?: () => void;
  renderQuestion?: Props["renderQuestion"];
}) {
  const remote = useData(
    `module-practice-${group.ID}-${stuid}-${context.LeadFillID}`,
    () =>
      kind === "album"
        ? mathCommand(
            Number(context.ProductID) > 0
              ? "GetHighscorealbumQuestionListByCourse"
              : "GetHighscorealbumQuestionList",
            {
              CatalogID: catalogId,
              StuID: stuid,
              PID: group.ID,
              ...(Number(context.ProductID) > 0
                ? { ProductID: context.ProductID, CourseID: context.CourseID }
                : {}),
            },
          )
        : isLeadFill
          ? mathCommand("GetLeadFillModelAblumQuestionList", {
              BusID: group.ID,
              StuID: stuid,
              ProductID: context.ProductID,
              CourseID: context.CourseID,
              LeadFillID: context.LeadFillID,
            })
          : mathCommand("GetModelAblumQuestionList", {
              BusID: group.ID,
              StuID: stuid,
            }),
  );
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, MathRow>>({});
  const [viewed, setViewed] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (remote.data) {
      const list = mathRows(remote.data);
      setIndex(
        Math.max(
          0,
          list.findIndex((r) => String(r.QuestionID) === String(questionId)),
        ),
      );
      setAnswers({});
      setViewed(false);
    }
  }, [remote.data, questionId]);
  const rows = mathRows(remote.data).map((r) => ({
    ...r,
    ...answers[String(r.ID)],
  }));
  const row = rows[index];
  const count = rows.filter((r) => r.AnswerID).length;
  const correct = rows.filter((r) => Number(r.Answer) === 1).length;
  const save = async (
    answer: string,
    isCorrect: boolean,
    details?: { question: MathRow; options: MathRow[] },
  ) => {
    if (!row) return;
    if (!details?.options?.length && !viewed && !row.AnswerID)
      throw new Error("请先查看解析，再记录自己的掌握程度");
    setSaving(true);
    setNotice("");
    try {
      const payload = modelStudyPayload({
        stuid,
        albumId,
        catalogId,
        row,
        answer,
        correct: isCorrect,
        isLeadFill,
        context,
        kind,
      });
      const response = await mathPost(
        "/api/book_highscorealbum_studylog/Inner_book_highscorealbum_studylog",
        payload,
      );
      const id = row.AnswerID || Number(mathData(response));
      if (!id) throw new Error("平台未确认本题训练记录，请重试");
      const result = {
        AnswerID: id,
        Answer: isCorrect ? 1 : 2,
        MyAnswerIDs: answer,
      };
      setAnswers((v) => ({ ...v, [String(row.ID)]: result }));
      if (!renderQuestion)
        recordStudy({
          platform: "math",
          type: "model-training",
          title: `专项训练 · 第 ${index + 1} 题`,
          correct: Number(isCorrect),
          total: 1,
          path: "/study/practice",
        });
      setNotice("本题训练结果已保存");
      const all = rows.map((r, i) => (i === index ? { ...r, ...result } : r));
      if (all.every((r) => r.AnswerID) && isLeadFill && context.LeadFillID) {
        await mathPost(
          "/api/c_paper_student_recommend/Inner_c_paper_student_recommend",
          { ID: context.LeadFillID, IsFinsh: 1, UpdateColumns: "IsFinsh" },
        );
        setCompleted(true);
        onCompleted?.();
      } else if (all.every((r) => r.AnswerID)) {
        setCompleted(true);
        onCompleted?.();
      }
    } finally {
      setSaving(false);
    }
  };
  const move = (to: number) => {
    setIndex(to);
    setViewed(false);
    setNotice("");
  };
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={15} />
        返回模块要点
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">SKILL PRACTICE</span>
          <h2>{group.Title || "专项题组训练"}</h2>
          <p>
            已完成 {count} / {rows.length} 题 · 已掌握 {correct} 题
            {completed ? " · 本组训练已完成" : ""}
          </p>
        </div>
      </div>
      <Status
        loading={remote.loading}
        error={remote.error}
        empty={!remote.loading && !rows.length}
        retry={remote.reload}
      />
      <div className="math-answer-sheet">
        {rows.map((q, i) => (
          <button
            key={q.ID || i}
            className={`${i === index ? "active" : ""} ${q.AnswerID ? "answered" : ""}`}
            onClick={() => move(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {row &&
        (renderQuestion ? (
          renderQuestion({
            row: { ...row, Answer: undefined, MyAnswer: row.MyAnswerIDs },
            onAnswered: save,
            onAnalysisViewed: () => setViewed(true),
            prev: index > 0 ? () => move(index - 1) : undefined,
            next: index < rows.length - 1 ? () => move(index + 1) : undefined,
            readOnly: !!row.AnswerID,
          })
        ) : (
          <ModuleQuestion
            key={row.ID}
            row={row}
            stuid={stuid}
            isCourse={isLeadFill}
            onSave={save}
            onViewed={() => setViewed(true)}
            onPrevious={index > 0 ? () => move(index - 1) : undefined}
            onNext={index < rows.length - 1 ? () => move(index + 1) : undefined}
          />
        ))}
      {notice && (
        <p className="math-account-notice" role="status">
          {notice}
        </p>
      )}
      {saving && <p className="math-qa-footnote">正在同步训练记录…</p>}
    </div>
  );
}
function ModuleQuestion({
  row,
  stuid,
  isCourse,
  onSave,
  onViewed,
  onPrevious,
  onNext,
}: {
  row: MathRow;
  stuid: string;
  isCourse: boolean;
  onSave: ModelReaderProps["onAnswered"];
  onViewed: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const remote = useData(`module-question-${row.QuestionID}`, () =>
    Promise.all([
      row._question_list
        ? Promise.resolve({ data: [row._question_list] })
        : mathApi.question(row.QuestionID),
      mathApi.resolve(row.QuestionID),
      mathApi.analysis(row.QuestionID),
    ]),
  );
  const [selection, setSelection] = useState<string[]>(
    row.MyAnswerIDs ? String(row.MyAnswerIDs).split(",") : [],
  );
  const [text, setText] = useState("");
  const [showAnalysis, setShowAnalysis] = useState(!!row.AnswerID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = mergeMathQuestion(
    row._question_list,
    remote.data ? mathRows(remote.data[0])[0] : {},
  );
  const resolve = remote.data ? mathRows(remote.data[1]) : [];
  const options = resolve.filter((r) => r.Type === "选项");
  const stems = resolve.filter((r) => r.Type === "题干");
  const multi = options.filter((o) => Number(o.IsAnswer) === 1).length > 1;
  const submit = async (self?: boolean) => {
    const result = gradeMathAnswer(q, options, selection, text);
    const correct = self ?? result.correct;
    if (correct === undefined) {
      setError("请查看解析后，用“已掌握”或“需要巩固”记录本题。");
      return;
    }
    if (!options.length && !showAnalysis) {
      setError("请先查看解析，再判断掌握程度。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(result.answer, correct, { question: q, options });
      setShowAnalysis(true);
      onViewed();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const analysis = remote.data ? mathRows(remote.data[2]) : [];
  return (
    <div className="panel mmt-question">
      <Status
        loading={remote.loading}
        error={remote.error}
        retry={remote.reload}
      />
      {remote.data && (
        <>
          <div className="math-question-top">
            <span className="math-tag">
              {q.QuestionType || q.Type || "专项训练"}
            </span>
            <span>第 {q.QuestionID || row.QuestionID} 题</span>
            {row.AnswerID && (
              <span className="math-tag">
                {Number(row.Answer) === 1 ? "已掌握" : "需要巩固"}
              </span>
            )}
          </div>
          <div className="math-question-body">
            {stems.length ? (
              stems.map((r, i) => <RichContent key={i} content={r.Content} />)
            ) : (
              <RichContent content={q.QuestionTxt || q.QuestionContent} />
            )}
            <img
              className="math-question-image"
              src={q.QuestionImg || undefined}
              alt={q.QuestionImg ? "专项训练原题" : ""}
              hidden={!q.QuestionImg}
            />
            {options.length ? (
              <div className="math-options">
                {options.map((o, i) => (
                  <button
                    key={o.ID || i}
                    disabled={!!row.AnswerID}
                    className={
                      selection.includes(String(o.ID)) ? "selected" : ""
                    }
                    onClick={() =>
                      setSelection((v) =>
                        multi
                          ? v.includes(String(o.ID))
                            ? v.filter((id) => id !== String(o.ID))
                            : [...v, String(o.ID)]
                          : [String(o.ID)],
                      )
                    }
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    <RichContent content={o.Content} />
                  </button>
                ))}
              </div>
            ) : (
              <label className="math-field">
                我的思路
                <textarea
                  className="input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                />
              </label>
            )}
            <div className="math-answer-actions">
              {options.length > 0 && (
                <button
                  className="btn btn-primary"
                  disabled={busy || !selection.length || !!row.AnswerID}
                  onClick={() => submit()}
                >
                  保存并查看解析
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowAnalysis(true);
                  onViewed();
                }}
              >
                查看解析
              </button>
              {!options.length && showAnalysis && (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => submit(true)}
                  >
                    已掌握
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => submit(false)}
                  >
                    需要巩固
                  </button>
                </>
              )}
            </div>
            {error && (
              <p className="math-error-text" role="alert">
                {error}
              </p>
            )}
            {showAnalysis && (
              <div className="mmt-analysis">
                <h3>对照解析</h3>
                {analysis.map((a, i) => (
                  <section key={a.ID || i}>
                    <h4>{a.BusType || a.Title || "题目详解"}</h4>
                    <RichContent
                      content={
                        a.Context || a.Content || a._question_code?.Content
                      }
                    />
                    {a.BusType === "视频解析" && <MathQuestionVideo row={a} />}
                  </section>
                ))}
                {q.AnswerTxt && !analysis.length && (
                  <RichContent content={q.AnswerTxt} />
                )}
              </div>
            )}
          </div>
          <MathQuestionTools
            stuid={stuid}
            qid={row.QuestionID}
            bookId={Number(q.BookID || 0)}
            question={q}
            source={isCourse ? "课程" : "专辑"}
            isCourse={isCourse}
          />
          <div className="math-question-footer">
            <button
              className="btn btn-secondary"
              disabled={!onPrevious}
              onClick={onPrevious}
            >
              <ArrowLeft size={15} />
              上一题
            </button>
            <button
              className="btn btn-primary"
              disabled={!onNext}
              onClick={onNext}
            >
              下一题
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
function ModuleMarks({
  fileId,
  stuid,
  questionId,
}: {
  fileId: string | number;
  stuid: string;
  questionId: string | number;
}) {
  const remote = useData(`module-marks-${fileId}`, () =>
    Promise.all([
      mathCommand("GetQuestionFilesGiveAuto", {
        QuestionID: questionId,
        IsValid: 1,
        StuID: stuid,
        BusID: fileId,
        BusType: "小模块",
        t: Date.now(),
      }),
      mathGet("/api/sys_give/GetListBypage", {
        BusType: 1,
        StuID: stuid,
        Type: 4,
        System_Station_ID: 1,
        BusID: questionId,
        BaseType: "小模块",
        BusValue: fileId,
        t: Date.now(),
        page: 1,
        limit: 10,
      }),
    ]),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const like = remote.data ? mathRows(remote.data[0])[0] : undefined;
  const marked = remote.data ? mathRows(remote.data[1])[0] : undefined;
  const toggle = async (type: "like" | "flag") => {
    setBusy(true);
    setNotice("");
    try {
      if (type === "like") {
        if (like)
          await mathPost("/api/question_files_give/Del_question_files_give",
            mathContentLikeDelete(stuid, like.ID, fileId));
        else
          await mathPost("/api/question_files_give/Inner_question_files_give", {
            StuID: stuid,
            BusID: fileId,
            QuestionID: questionId,
            BusType: "小模块",
            IsValid: 1,
            System_Station_ID: 1,
          });
      } else if (marked)
        await mathPost("/api/sys_give/Del_sys_give", { ID: marked.ID });
      else
        await mathPost("/api/sys_give/Inner_sys_give", {
          BusType: 1,
          StuID: stuid,
          Type: 4,
          System_Station_ID: 1,
          BusID: questionId,
          BaseType: "小模块",
          BusValue: fileId,
        });
      remote.reload();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel mmt-marks">
      <button
        className="btn btn-secondary"
        disabled={busy || remote.loading}
        onClick={() => toggle("like")}
      >
        <Heart size={16} fill={like ? "currentColor" : "none"} />
        {like ? "已点赞" : "点赞这个模块"}
      </button>
      <button
        className="btn btn-secondary"
        disabled={busy || remote.loading}
        onClick={() => toggle("flag")}
      >
        <Flag size={16} fill={marked ? "currentColor" : "none"} />
        {marked ? "已标为重点" : "标为重点"}
      </button>
      <MathFeedbackButton stuid={stuid} qid={questionId} baseType="小模块" />
      {notice && <span className="math-error-text">{notice}</span>}
    </div>
  );
}
