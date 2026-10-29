import { useSession } from "../../../shared/auth/session";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  GitCompareArrows,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { mathCommand, mathRows } from "../api/math";
import type { MathRow } from "../api/math";
import "./MathSchools.css";
function useDirectory(command: string, params: MathRow, enabled = true) {
  const [rows, setRows] = useState<MathRow[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const serialized = JSON.stringify(params);
  useEffect(() => {
    let active = true;
    setRows([]);
    setError("");
    if (!enabled) return;
    setLoading(true);
    mathCommand(command, JSON.parse(serialized))
      .then((r) => {
        if (active) setRows(mathRows(r));
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
  }, [command, serialized, enabled, version]);
  return { rows, loading, error, reload: () => setVersion((v) => v + 1) };
}
function DirectoryState({
  loading,
  error,
  empty,
  retry,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  retry: () => void;
}) {
  return loading ? (
    <div className="math-school-state">
      <LoaderCircle className="spin" size={21} />
      正在读取专业目录…
    </div>
  ) : error ? (
    <div className="error-banner">
      <span>{error}</span>
      <button className="text-link" onClick={retry}>
        重试
      </button>
    </div>
  ) : empty ? (
    <div className="math-school-state">
      当前分类暂无收录，可选择其他院系或专业。
    </div>
  ) : null;
}
interface Comparison {
  id: string;
  school: string;
  province: string;
  college: string;
  major: string;
  direction: string;
  studyType: string;
  subjects: MathRow[];
}
function subjectNames(rows: MathRow[], index: number) {
  return (
    [...new Set(rows.map((r) => r[`Subject${index}`]).filter(Boolean))].join(
      " / ",
    ) || "暂无收录"
  );
}
function subjectScores(rows: MathRow[], index: number) {
  return [
    ...new Set(
      rows
        .map((r) => r[`Subject${index}Score`])
        .filter((v) => v != null && v !== ""),
    ),
  ].join(" / ");
}
export default function MathSchools({ stuid }: { stuid: string }) {
  const { session } = useSession();
  const comparisonKey = `study:school-compare:${session.user?.id || "guest"}:${stuid}`;
  const all = useDirectory("GetSchoolList_cscj", {});
  const [search, setSearch] = useState(""),
    [province, setProvince] = useState(""),
    [school, setSchool] = useState<MathRow>(),
    [limit, setLimit] = useState(24),
    [comparisons, setComparisons] = useState<Comparison[]>(() => {
      try {
        return JSON.parse(
          localStorage.getItem(comparisonKey) || "[]",
        );
      } catch {
        return [];
      }
    });
  useEffect(
    () =>
      localStorage.setItem(
        comparisonKey,
        JSON.stringify(comparisons),
      ),
    [comparisons, comparisonKey],
  );
  const provinces = [
    ...new Set(all.rows.map((s) => String(s.Province || "")).filter(Boolean)),
  ];
  const filtered = all.rows.filter(
    (s) =>
      (!province || s.Province === province) &&
      (!search || `${s.SchoolName} ${s.SchoolCode}`.includes(search)),
  );
  return (
    <div className="math-schools">
      {comparisons.length > 0 && (
        <section className="panel math-school-compare">
          <div className="section-heading">
            <h2>
              <GitCompareArrows size={17} />
              专业对比
            </h2>
            <span className="subtle">
              最多 4 项 · {comparisons.length} 项已选
            </span>
          </div>
          <div className="table-scroll">
            <table className="records-table">
              <thead>
                <tr>
                  <th>对比项目</th>
                  {comparisons.map((c) => (
                    <th key={c.id}>
                      {c.school}
                      <button
                        className="icon-button"
                        aria-label={`移除${c.school}${c.major}`}
                        onClick={() =>
                          setComparisons((v) => v.filter((x) => x.id !== c.id))
                        }
                      >
                        <X size={14} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["省份", (c: Comparison) => c.province],
                  ["院系", (c: Comparison) => c.college],
                  ["专业", (c: Comparison) => c.major],
                  ["研究方向", (c: Comparison) => c.direction],
                  ["学习方式", (c: Comparison) => c.studyType],
                  ...[1, 2, 3, 4].map((i) => [
                    `初试科目 ${i}`,
                    (c: Comparison) => subjectNames(c.subjects, i),
                  ]),
                ].map(([name, getter]) => (
                  <tr key={String(name)}>
                    <td>{String(name)}</td>
                    {comparisons.map((c) => (
                      <td key={c.id}>
                        {(getter as (c: Comparison) => string)(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {school ? (
        <SchoolDetail
          key={school.SchoolCode}
          school={school}
          back={() => setSchool(undefined)}
          comparisons={comparisons}
          add={(c) =>
            setComparisons((v) =>
              v.some((s) => s.id === c.id) ? v : [...v, c],
            )
          }
        />
      ) : (
        <section className="panel">
          <div className="math-school-filters">
            <label className="math-school-search">
              <Search size={17} />
              <input
                className="input"
                aria-label="搜索数学平台院校"
                placeholder="搜索院校名称或代码"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(24);
                }}
              />
            </label>
            <select
              className="input"
              aria-label="筛选院校省份"
              value={province}
              onChange={(e) => {
                setProvince(e.target.value);
                setLimit(24);
              }}
            >
              <option value="">全部省份</option>
              {provinces.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <span className="subtle">{filtered.length} 所院校</span>
          </div>
          <DirectoryState
            {...all}
            empty={!filtered.length}
            retry={all.reload}
          />
          <div className="math-schools-grid">
            {filtered.slice(0, limit).map((s) => (
              <button
                className="math-school-card"
                key={s.SchoolCode}
                onClick={() => setSchool(s)}
              >
                <span className="math-school-symbol">
                  <Building2 size={24} />
                </span>
                <div>
                  <h3>{s.SchoolName}</h3>
                  <p>
                    {s.Province} · 院校代码 {s.SchoolCode}
                  </p>
                </div>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          {filtered.length > limit && (
            <button
              className="btn btn-secondary math-school-more"
              onClick={() => setLimit((n) => n + 24)}
            >
              加载更多院校
              <ArrowRight size={15} />
            </button>
          )}
        </section>
      )}
      <p className="footnote">
        目录及考试科目来自平台收录数据；具体招生安排以院校当年公布的招生简章为准。
      </p>
    </div>
  );
}
function SchoolDetail({
  school,
  back,
  comparisons,
  add,
}: {
  school: MathRow;
  back: () => void;
  comparisons: Comparison[];
  add: (c: Comparison) => void;
}) {
  const [college, setCollege] = useState(""),
    [major, setMajor] = useState(""),
    [direction, setDirection] = useState(""),
    [studyType, setStudyType] = useState(""),
    [notice, setNotice] = useState("");
  const colleges = useDirectory("GetSchoolXueYuanList_cscj", {
    SchoolCode: school.SchoolCode,
  });
  const majors = useDirectory(
    "GetXueYuanMajorList_cscj",
    { SchoolCode: school.SchoolCode, XueYuanName: college },
    !!college,
  );
  const directions = useDirectory(
    "GetMajorDirectionList_cscj",
    { SchoolCode: school.SchoolCode, XueYuanName: college, MajorCode: major },
    !!major,
  );
  const types = useDirectory(
    "GetDirectionXueXiTypeList_cscj",
    {
      SchoolCode: school.SchoolCode,
      XueYuanName: college,
      MajorCode: major,
      DirectionName: direction,
    },
    !!direction,
  );
  const subjects = useDirectory(
    "GetMajorSubjectList_cscj",
    {
      SchoolCode: school.SchoolCode,
      XueYuanName: college,
      MajorCode: major,
      DirectionName: direction,
      IsQuanRiZ: studyType,
    },
    studyType !== "",
  );
  useEffect(() => {
    setCollege(colleges.rows[0]?.XueYuanName || "");
  }, [colleges.rows]);
  useEffect(() => {
    setMajor(String(majors.rows[0]?.MajorCode || ""));
  }, [majors.rows]);
  useEffect(() => {
    setDirection(directions.rows[0]?.DirectionName || "");
  }, [directions.rows]);
  useEffect(() => {
    setStudyType(types.rows[0] ? String(types.rows[0].IsQuanRiZ) : "");
  }, [types.rows]);
  const m = majors.rows.find((m) => String(m.MajorCode) === major);
  const item: Comparison = {
    id: [school.SchoolCode, college, major, direction, studyType].join(":"),
    school: school.SchoolName,
    province: school.Province,
    college,
    major: m?.MajorName || major,
    direction,
    studyType: studyType === "1" ? "全日制" : "非全日制",
    subjects: subjects.rows,
  };
  const exists = comparisons.some((c) => c.id === item.id);
  return (
    <section className="panel">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={16} />
        院校目录
      </button>
      <div className="math-school-detail-head">
        <span className="math-school-symbol">
          <Building2 size={30} />
        </span>
        <div>
          <h2>{school.SchoolName}</h2>
          <p>
            {school.Province} · 院校代码 {school.SchoolCode}
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={!subjects.rows.length || exists || comparisons.length >= 4}
          onClick={() => {
            add(item);
            setNotice("已加入专业对比，可返回目录选择其他院校或专业。");
          }}
        >
          {exists ? <Check size={16} /> : <PlusCompare />}
          {exists ? "已加入对比" : "加入专业对比"}
        </button>
      </div>
      <div className="math-school-cascades">
        {[
          {
            label: "院系",
            value: college,
            rows: colleges.rows,
            name: "XueYuanName",
            key: "XueYuanName",
            loading: colleges.loading,
            change: (v: string) => {
              setCollege(v);
              setMajor("");
              setDirection("");
              setStudyType("");
            },
          },
          {
            label: "报考专业",
            value: major,
            rows: majors.rows,
            name: "MajorName",
            key: "MajorCode",
            loading: majors.loading,
            change: (v: string) => {
              setMajor(v);
              setDirection("");
              setStudyType("");
            },
          },
          {
            label: "研究方向",
            value: direction,
            rows: directions.rows,
            name: "DirectionName",
            key: "DirectionName",
            loading: directions.loading,
            change: (v: string) => {
              setDirection(v);
              setStudyType("");
            },
          },
          {
            label: "学习方式",
            value: studyType,
            rows: types.rows,
            name: "IsQuanRiZ",
            key: "IsQuanRiZ",
            loading: types.loading,
            change: setStudyType,
          },
        ].map((s) => (
          <label className="field-label" key={s.label}>
            {s.label}
            <select
              className="input"
              aria-label={s.label}
              value={s.value}
              disabled={s.loading || !s.rows.length}
              onChange={(e) => s.change(e.target.value)}
            >
              <option value="" disabled>
                {s.loading
                  ? "正在加载…"
                  : s.rows.length
                    ? "请选择"
                    : "暂无收录"}
              </option>
              {s.rows.map((r, i) => (
                <option key={i} value={String(r[s.key])}>
                  {s.label === "学习方式"
                    ? String(r.IsQuanRiZ) === "1"
                      ? "全日制"
                      : "非全日制"
                    : r[s.name]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {[colleges, majors, directions, types]
        .filter((s) => s.error)
        .map((s, i) => (
          <DirectoryState key={i} {...s} empty={false} retry={s.reload} />
        ))}
      <div className="math-school-subjects">
        <div className="section-heading">
          <h2>初试科目</h2>
          {major && (
            <span className="pill">
              {m?.MajorCode} · {m?.MajorName}
            </span>
          )}
        </div>
        <DirectoryState
          {...subjects}
          empty={!subjects.rows.length}
          retry={subjects.reload}
        />
        {!!subjects.rows.length && (
          <div className="math-school-subject-grid">
            {[1, 2, 3, 4].map((i) => (
              <article key={i}>
                <span>科目 {i}</span>
                <h3>{subjectNames(subjects.rows, i)}</h3>
                {subjectScores(subjects.rows, i) && (
                  <p>满分 {subjectScores(subjects.rows, i)} 分</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
function PlusCompare() {
  return <GitCompareArrows size={16} />;
}
