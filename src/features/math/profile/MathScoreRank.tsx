import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { uploadMathAttachment } from "../community/MathQuestions";
import {
  buildFirstScore,
  emptyFirstScore,
  maskScoreName,
  scoreDistribution,
  scoreRankApi,
  scoreRankGroup,
  scoreRows,
  scoreSubjectOptions,
} from "./math-score-rank";
import type { ScoreRow as R } from "./math-score-rank";
import "./math-score-rank.css";

function useScoreData(key: string, loader: () => Promise<any>, enabled = true) {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(enabled),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loader()
      .then((d) => {
        if (active) setData(d);
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
  }, [key, version, enabled]);
  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
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
      <div className="score-rank-status" role="status">
        <LoaderCircle size={20} className="spin" />
        正在读取成绩与排名…
      </div>
    );
  if (error)
    return (
      <div className="score-rank-error" role="alert">
        <span>{error}</span>
        {reload && (
          <button className="btn btn-secondary" onClick={reload}>
            重试
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <Trophy size={30} />
        <h3>当前范围还没有成绩记录</h3>
        <p>可切换报考范围，或录入自己的真实初试成绩。</p>
      </div>
    );
  return null;
}
const subjectTitles = ["公共课一", "公共课二", "专业课一", "专业课二"];
function clearBelow(form: R, level: number) {
  const next = { ...form };
  for (const [index, fields] of [
    [1, ["XueYuanCode", "XueYuanName"]],
    [2, ["MajorCode", "MajorName"]],
    [3, ["DirectionCode", "DirectionName"]],
    [4, ["IsQuanRiZ"]],
  ] as [number, string[]][])
    if (index >= level) fields.forEach((key) => (next[key] = ""));
  for (let i = 1; i <= 4; i++) {
    next[`Subject${i}`] = "";
    next[`Subject${i}Score`] = "";
  }
  return next;
}

export default function MathScoreRank({ stuid }: { stuid: string }) {
  const [form, setForm] = useState<R>(emptyFirstScore),
    [view, setView] = useState("entry"),
    [scope, setScope] = useState<"major" | "direction" | "college">("major"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [shown, setShown] = useState(50);
  const mine = useScoreData(`my-first-score-${stuid}`, () =>
      scoreRankApi.mine(stuid),
    ),
    schools = useScoreData("score-schools", scoreRankApi.schools),
    colleges = useScoreData(
      `score-colleges-${form.SchoolCode}`,
      () => scoreRankApi.colleges(form.SchoolCode),
      !!form.SchoolCode,
    ),
    majors = useScoreData(
      `score-majors-${form.SchoolCode}-${form.XueYuanName}`,
      () => scoreRankApi.majors(form.SchoolCode, form.XueYuanName),
      !!form.SchoolCode && !!form.XueYuanName,
    ),
    directions = useScoreData(
      `score-directions-${form.SchoolCode}-${form.XueYuanName}-${form.MajorCode}`,
      () =>
        scoreRankApi.directions(
          form.SchoolCode,
          form.XueYuanName,
          form.MajorCode,
        ),
      !!form.SchoolCode && !!form.XueYuanName && !!form.MajorCode,
    ),
    study = useScoreData(
      `score-study-${form.SchoolCode}-${form.XueYuanName}-${form.MajorCode}-${form.DirectionName}`,
      () => scoreRankApi.studyTypes(form),
      !!form.DirectionName,
    ),
    subjects = useScoreData(
      `score-subjects-${form.SchoolCode}-${form.XueYuanName}-${form.MajorCode}-${form.DirectionName}-${form.IsQuanRiZ}`,
      () => scoreRankApi.subjects(form),
      !!form.DirectionName && form.IsQuanRiZ !== "",
    ),
    ranks = useScoreData(
      `score-ranks-${form.SchoolCode}-${form.MajorCode}-${form.IsQuanRiZ}`,
      () => scoreRankApi.ranks(form),
      !!form.SchoolCode && !!form.MajorCode && form.IsQuanRiZ !== "",
    );
  useEffect(() => {
    const row = scoreRows(mine.data)[0];
    if (row) {
      setForm({ ...emptyFirstScore(), ...row });
      if (Number(row.IsFinish) === 1) setView("rank");
    }
  }, [mine.data]);
  useEffect(() => {
    const rows = scoreRows(subjects.data);
    if (rows.length)
      setForm((f) => {
        const next = { ...f };
        for (let i = 1; i <= 4; i++) {
          const choices = scoreSubjectOptions(rows, i);
          if (!next[`Subject${i}`] && choices.length === 1)
            next[`Subject${i}`] = choices[0].name;
        }
        return next;
      });
  }, [subjects.data]);
  const group = scoreRankGroup(scoreRows(ranks.data), form, scope, stuid),
    ranked = group.list.filter(
      (row) =>
        !search ||
        [
          row.XueYuanName,
          row.MajorName,
          row.DirectionName,
          maskScoreName(row.Name || row.UserNick || row.NickName),
        ]
          .join(" ")
          .includes(search),
    ),
    distribution = scoreDistribution(group.list),
    maxBucket = Math.max(1, ...distribution.map((d) => d.count)),
    total = [1, 2, 3, 4].reduce(
      (sum, i) => sum + Number(form[`Subject${i}Score`] || 0),
      0,
    ),
    loading =
      mine.loading ||
      schools.loading ||
      colleges.loading ||
      majors.loading ||
      directions.loading ||
      study.loading ||
      subjects.loading;
  const update = (field: string, value: any) =>
    setForm((f) => ({ ...f, [field]: value }));
  async function save(complete: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const score = buildFirstScore(form, scoreRows(subjects.data), complete);
      await scoreRankApi.save(score);
      setForm((f) => ({ ...f, ...score }));
      setNotice(
        complete
          ? "初试成绩已提交，排名已刷新。"
          : "成绩草稿已保存到数学账号。",
      );
      ranks.reload();
      if (complete) setView("rank");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const url = await uploadMathAttachment(file);
      update("ScoreImg", url);
      setNotice("证明图片已上传，保存草稿或提交成绩后关联到本次成绩。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const scopeFields = (
    <div className="score-rank-school-grid">
      <label>
        报考院校
        <select
          className="input"
          aria-label="成绩报考院校"
          value={form.SchoolCode}
          onChange={(e) => {
            const row = scoreRows(schools.data).find(
              (r) => String(r.SchoolCode) === e.target.value,
            );
            setForm((f) => ({
              ...clearBelow(f, 1),
              SchoolCode: row?.SchoolCode || "",
              SchoolName: row?.SchoolName || "",
            }));
          }}
        >
          <option value="">选择报考院校</option>
          {scoreRows(schools.data).map((r, i) => (
            <option key={i} value={r.SchoolCode}>
              {r.SchoolName}
            </option>
          ))}
        </select>
      </label>
      <label>
        报考学院
        <select
          className="input"
          aria-label="成绩报考学院"
          disabled={!form.SchoolCode || colleges.loading}
          value={form.XueYuanName}
          onChange={(e) => {
            const row = scoreRows(colleges.data).find(
              (r) => r.XueYuanName === e.target.value,
            );
            setForm((f) => ({
              ...clearBelow(f, 2),
              XueYuanName: row?.XueYuanName || "",
              XueYuanCode: row?.XueYuanCode || "",
            }));
          }}
        >
          <option value="">选择学院</option>
          {scoreRows(colleges.data).map((r, i) => (
            <option key={i} value={r.XueYuanName}>
              {r.XueYuanName}
            </option>
          ))}
        </select>
      </label>
      <label>
        报考专业
        <select
          className="input"
          aria-label="成绩报考专业"
          disabled={!form.XueYuanName || majors.loading}
          value={form.MajorCode}
          onChange={(e) => {
            const row = scoreRows(majors.data).find(
              (r) => String(r.MajorCode) === e.target.value,
            );
            setForm((f) => ({
              ...clearBelow(f, 3),
              MajorName: row?.MajorName || "",
              MajorCode: row?.MajorCode || "",
            }));
          }}
        >
          <option value="">选择专业</option>
          {scoreRows(majors.data).map((r, i) => (
            <option key={i} value={r.MajorCode}>
              ({r.MajorCode}) {r.MajorName}
            </option>
          ))}
        </select>
      </label>
      <label>
        研究方向
        <select
          className="input"
          aria-label="成绩研究方向"
          disabled={!form.MajorCode || directions.loading}
          value={form.DirectionName}
          onChange={(e) => {
            const row = scoreRows(directions.data).find(
              (r) => r.DirectionName === e.target.value,
            );
            setForm((f) => ({
              ...clearBelow(f, 4),
              DirectionName: row?.DirectionName || "",
              DirectionCode: row?.DirectionCode || "",
            }));
          }}
        >
          <option value="">选择研究方向</option>
          {scoreRows(directions.data).map((r, i) => (
            <option key={i} value={r.DirectionName}>
              {r.DirectionName}
            </option>
          ))}
        </select>
      </label>
      <label>
        学习方式
        <select
          className="input"
          aria-label="成绩学习方式"
          disabled={!form.DirectionName || study.loading}
          value={String(form.IsQuanRiZ)}
          onChange={(e) =>
            setForm((f) => ({ ...clearBelow(f, 5), IsQuanRiZ: e.target.value }))
          }
        >
          <option value="">选择学习方式</option>
          {scoreRows(study.data).map((r, i) => (
            <option key={i} value={String(r.IsQuanRiZ)}>
              {Number(r.IsQuanRiZ) === 1 ? "全日制" : "非全日制"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  return (
    <div className="math-score-rank">
      <div className="panel score-rank-heading">
        <div>
          <span className="score-rank-eyebrow">2026 · FIRST EXAM SCORES</span>
          <h2>看清自己的成绩与位置</h2>
          <p>按报考院校、学院、专业、方向和学习方式查看真实初试成绩榜。</p>
        </div>
        <Trophy size={36} />
      </div>
      <div className="tabs">
        <button
          className={view === "entry" ? "active" : ""}
          onClick={() => setView("entry")}
        >
          我的成绩录入
        </button>
        <button
          className={view === "rank" ? "active" : ""}
          onClick={() => setView("rank")}
        >
          初试成绩榜
        </button>
      </div>
      <State loading={mine.loading} error={mine.error} reload={mine.reload} />
      {error && <State error={error} />}{" "}
      {notice && (
        <p className="score-rank-notice" role="status">
          {notice}
        </p>
      )}
      {view === "entry" ? (
        <div className="panel">
          <h3>初试成绩与报考信息</h3>
          <p className="score-rank-muted">
            填写真实成绩并上传成绩证明，科目与满分按报考专业的实际设置读取。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(true);
            }}
          >
            <div className="score-rank-person">
              <label>
                姓名
                <input
                  className="input"
                  autoComplete="name"
                  value={form.Name}
                  onChange={(e) => update("Name", e.target.value)}
                  required
                />
              </label>
              <label>
                本科学校
                <input
                  className="input"
                  value={form.BenSchoolName}
                  onChange={(e) => update("BenSchoolName", e.target.value)}
                  required
                />
              </label>
            </div>
            {scopeFields}
            <State
              loading={loading && !mine.loading}
              error={
                schools.error ||
                colleges.error ||
                majors.error ||
                directions.error ||
                study.error ||
                subjects.error
              }
            />
            <div className="score-rank-subjects">
              {[1, 2, 3, 4].map((i) => {
                const options = scoreSubjectOptions(
                  scoreRows(subjects.data),
                  i,
                );
                if (!options.length && !form[`Subject${i}`]) return null;
                const selected = options.find(
                  (o) => o.name === form[`Subject${i}`],
                );
                return (
                  <div className="score-rank-subject" key={i}>
                    <label>
                      {subjectTitles[i - 1]}
                      <select
                        className="input"
                        aria-label={`选择第${i}科科目`}
                        value={form[`Subject${i}`]}
                        onChange={(e) => update(`Subject${i}`, e.target.value)}
                        required
                      >
                        <option value="">选择科目</option>
                        {options.length ? (
                          options.map((o) => (
                            <option key={o.name}>{o.name}</option>
                          ))
                        ) : (
                          <option>{form[`Subject${i}`]}</option>
                        )}
                      </select>
                    </label>
                    <label>
                      成绩{selected ? `（满分 ${selected.max}）` : ""}
                      <input
                        className="input"
                        aria-label={`第${i}科成绩`}
                        type="number"
                        min={0}
                        max={selected?.max}
                        step={0.5}
                        value={form[`Subject${i}Score`]}
                        onChange={(e) =>
                          update(`Subject${i}Score`, e.target.value)
                        }
                        required
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="score-rank-total">
              总分 <strong>{total}</strong>
              <span>由已填写科目自动计算</span>
            </div>
            <label className="score-rank-upload">
              <ImagePlus size={19} />
              <span>{busy ? "正在处理…" : "上传成绩证明图片"}</span>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
            {form.ScoreImg && (
              <div className="score-rank-proof">
                <img src={String(form.ScoreImg)} alt="我的成绩证明" />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => update("ScoreImg", "")}
                >
                  移除图片
                </button>
              </div>
            )}
            <div className="score-rank-actions">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy || loading}
                onClick={() => void save(false)}
              >
                保存草稿
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || loading || !form.DirectionName}
              >
                提交真实成绩
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="panel">
            <h3>报考范围</h3>
            {scopeFields}
            <State
              loading={loading && !mine.loading}
              error={
                schools.error ||
                colleges.error ||
                majors.error ||
                directions.error ||
                study.error
              }
            />
          </div>
          {!form.SchoolCode || !form.MajorCode || form.IsQuanRiZ === "" ? (
            <div className="panel empty-state">
              <BarChart3 size={30} />
              <h3>先选择报考范围</h3>
              <p>选择院校、专业、方向和学习方式后，读取对应的完整成绩榜。</p>
            </div>
          ) : (
            <>
              <div className="score-rank-summary">
                {[
                  ["我的名次", group.rank ?? "尚未入榜"],
                  ["参榜人数", group.count],
                  ["本组平均分", group.average ?? "—"],
                  ["最高分", group.highest ?? "—"],
                ].map(([label, value]) => (
                  <div className="panel" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="panel">
                <div className="score-rank-toolbar">
                  <div className="tabs">
                    {[
                      ["major", "专业全榜"],
                      ["direction", "同方向"],
                      ["college", "同学院与方向"],
                    ].map(([id, title]) => (
                      <button
                        className={scope === id ? "active" : ""}
                        key={id}
                        onClick={() => {
                          setScope(id as typeof scope);
                          setShown(50);
                        }}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                  <input
                    className="input"
                    placeholder="筛选学院、方向或脱敏姓名"
                    aria-label="筛选成绩榜"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setShown(50);
                    }}
                  />
                  <button className="btn btn-secondary" onClick={ranks.reload}>
                    <RefreshCw size={15} />
                    刷新
                  </button>
                </div>
                <State
                  loading={ranks.loading}
                  error={ranks.error}
                  empty={!ranks.loading && !ranks.error && !ranked.length}
                  reload={ranks.reload}
                />
                {ranked.length > 0 && (
                  <div className="score-rank-table-wrap">
                    <table className="score-rank-table">
                      <thead>
                        <tr>
                          <th>排名</th>
                          <th>姓名</th>
                          <th>总分</th>
                          <th>公共课一</th>
                          <th>公共课二</th>
                          <th>专业课一</th>
                          <th>专业课二</th>
                          <th>学院 / 方向</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranked.slice(0, shown).map((r, i) => {
                          const mine = String(r.StuID) === stuid,
                            rank = group.list.indexOf(r) + 1;
                          return (
                            <tr className={mine ? "mine" : ""} key={r.Key || i}>
                              <td>{rank}</td>
                              <td>
                                {mine ? (
                                  <span className="score-rank-me">
                                    <Check size={12} />我
                                  </span>
                                ) : (
                                  maskScoreName(
                                    r.Name || r.UserNick || r.NickName,
                                  ) || "学习者"
                                )}
                              </td>
                              <td>
                                <strong>{r.TotalScore ?? "—"}</strong>
                              </td>
                              {[1, 2, 3, 4].map((n) => (
                                <td key={n} title={r[`Subject${n}`] || ""}>
                                  {r[`Subject${n}Score`] ?? "—"}
                                </td>
                              ))}
                              <td>
                                {r.XueYuanName || ""}
                                <small>{r.DirectionName || ""}</small>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {ranked.length > shown && (
                  <button
                    className="btn btn-secondary score-rank-more"
                    onClick={() => setShown((v) => v + 50)}
                  >
                    继续查看全榜
                  </button>
                )}
              </div>
              <div className="panel">
                <h3>本组分数分布</h3>
                <div className="score-rank-bars">
                  {distribution.map((bin) => (
                    <div key={bin.name}>
                      <span>{bin.name}</span>
                      <div>
                        <i
                          style={{ width: `${(bin.count / maxBucket) * 100}%` }}
                        />
                      </div>
                      <strong>{bin.count} 人</strong>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
