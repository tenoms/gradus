import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  GraduationCap,
  LoaderCircle,
  MapPin,
  Search,
  Target,
  X,
} from "lucide-react";
import RichContent from "../../../shared/content/RichContent";
import { records, safeLink } from "../api/computer";
import type { ComputerRecord as Row } from "../api/computer";
import { computerSchoolApi as schools } from "./computer-schools";
import {
  matchingSchoolPlan,
  schoolHasFeature,
  schoolMetric as metric,
  schoolRegions,
  schoolRowKey,
  schoolTags,
  targetSchoolIds,
} from "./school-model.mjs";
import "./computer-schools.css";
type Filters = {
  name: string;
  year: string;
  degree: string;
  subject: string;
  score: string;
  provinces: string[];
  majors: string[];
};
const defaults: Filters = {
  name: "",
  year: "2026",
  degree: "",
  subject: "",
  score: "",
  provinces: [],
  majors: [],
};
const features = [
  ["", "全部特色"],
  ["is985", "985"],
  ["is211", "211"],
  ["isSyl", "双一流"],
  ["isZihuaxian", "自主划线"],
  ["isOrdinary", "普通院校"],
];
const planFields = [
  ["year", "招生年份"],
  ["specialName", "招生专业"],
  ["specialCode", "专业代码"],
  ["departName", "招生学院"],
  ["degreeTypeName", "学位类型"],
  ["recruitTypeName", "招生方式"],
  ["researchArea", "研究方向"],
  ["recruitNumber", "计划招生"],
  ["enrollNum", "实际录取"],
  ["firstAvgScore", "初试均分"],
  ["minScore", "最低分"],
  ["examClassName", "考试类别"],
  ["examSubjectLabel", "初试科目"],
  ["examSubject", "科目代码"],
  ["retestMachine", "复试机试"],
  ["specialLevel", "专业评级"],
  ["remark", "备注"],
];
function State({
  busy,
  error,
  empty,
}: {
  busy?: boolean;
  error?: string;
  empty?: boolean;
}) {
  return busy ? (
    <div className="cs-state">
      <LoaderCircle className="spin" size={21} />
      正在读取院校数据…
    </div>
  ) : error ? (
    <div className="cs-state cs-error" role="alert">
      {error}
    </div>
  ) : empty ? (
    <div className="cs-state">
      <Building2 size={26} />
      暂无符合条件的记录
    </div>
  ) : null;
}
function title(row: Row) {
  return String(row.name || row.schoolName || "院校");
}
function PlanFields({ plan }: { plan: Row }) {
  return (
    <dl className="cs-fields">
      {planFields
        .filter(
          ([key]) =>
            plan[key] !== undefined && plan[key] !== null && plan[key] !== "",
        )
        .map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {key === "retestMachine"
                ? Number(plan[key]) === 1
                  ? "有机试"
                  : Number(plan[key]) === 0
                    ? "无机试"
                    : metric(plan[key])
                : metric(plan[key])}
            </dd>
          </div>
        ))}
    </dl>
  );
}
function SchoolHeading({ row }: { row: Row }) {
  return (
    <div className="cs-school-heading">
      {safeLink(row.logo) ? (
        <img src={safeLink(row.logo)} alt="" />
      ) : (
        <div className="cs-school-placeholder">
          <GraduationCap size={27} />
        </div>
      )}
      <div>
        <h3>{title(row)}</h3>
        <p>
          <MapPin size={12} />
          {row.provinceName || row.region || "地区待更新"}
          {row.typeSchool ? ` · ${row.typeSchool}` : ""}
        </p>
        <div className="cs-tags">
          {schoolTags(row).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
function MajorPicker({
  degree,
  value,
  onChange,
  onClose,
  labels,
  onLabels,
}: {
  degree: string;
  value: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
  labels: Record<string, string>;
  onLabels: (v: Record<string, string>) => void;
}) {
  const [keyword, setKeyword] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Row[]>([]),
    [hasNext, setNext] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    schools
      .majors(degree, query, page)
      .then((data) => {
        if (!active) return;
        const rs = records(data);
        setRows((old) => (page === 1 ? rs : [...old, ...rs]));
        setNext(!!data?.hasNextPage);
        onLabels({
          ...labels,
          ...Object.fromEntries(
            rs.map((r) => [
              r.code || r.majorCode || r.csCode,
              r.name || r.majorName || r.csName,
            ]),
          ),
        });
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [degree, query, page]);
  return (
    <section className="cs-major-picker">
      <div className="cs-heading">
        <h4>选择专业方向</h4>
        <button
          className="computer-icon"
          onClick={onClose}
          aria-label="关闭专业选择"
        >
          <X size={17} />
        </button>
      </div>
      <form
        className="cs-search"
        onSubmit={(e) => {
          e.preventDefault();
          setRows([]);
          setPage(1);
          setQuery(keyword.trim());
        }}
      >
        <Search size={17} />
        <input
          className="input"
          placeholder="搜索专业名称或代码"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button className="btn btn-secondary">搜索</button>
      </form>
      <State busy={busy && page === 1} error={error} />
      <div className="cs-major-options">
        {rows.map((r, i) => {
          const code = String(r.code || r.majorCode || r.csCode),
            selected = value.includes(code);
          return (
            <button
              key={`${code}-${i}`}
              className={selected ? "active" : ""}
              onClick={() =>
                onChange(
                  selected ? value.filter((v) => v !== code) : [...value, code],
                )
              }
            >
              <span>
                <strong>{r.name || r.majorName || r.csName}</strong>
                <small>
                  {code} ·{" "}
                  {r.degreeName ||
                    (Number(r.degreeType) === 1
                      ? "专业型"
                      : Number(r.degreeType) === 2
                        ? "学术型"
                        : "")}
                </small>
              </span>
              {selected ? (
                <Check size={17} />
              ) : (
                <span className="cs-add">+</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="cs-heading">
        <button
          className="btn btn-secondary"
          disabled={busy || !hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          {busy ? "读取中…" : hasNext ? "加载更多专业" : "已显示全部"}
        </button>
        <button className="btn btn-primary" onClick={onClose}>
          完成选择（{value.length}）
        </button>
      </div>
    </section>
  );
}
function TargetSchools({ onClose }: { onClose: () => void }) {
  const [catalog, setCatalog] = useState<Row[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [saved, setSaved] = useState<string[]>([]),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(false);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [info, list] = await Promise.all([
        schools.targets(),
        schools.targetCatalog(),
      ]);
      const next = targetSchoolIds(info);
      setCatalog(records(list));
      setIds(next);
      setSaved(next);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await schools.saveTargets(ids, catalog);
      if (result === false || result === null)
        throw new Error("平台未确认保存，请重试");
      setConfirm(false);
      await load();
      setNotice("目标院校已保存并重新读取。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="panel cs-targets">
      <div className="cs-heading">
        <h3>
          <Target size={18} />
          我的目标院校
        </h3>
        <button
          className="computer-icon"
          onClick={onClose}
          aria-label="关闭目标院校"
        >
          <X size={18} />
        </button>
      </div>
      <p className="cs-muted">
        从院校目录中选择目标院校，已有选择会在这里显示。
      </p>
      <State busy={busy} error={error} />
      {!busy && !error && (
        <>
          <div className="cs-target-options">
            {catalog.map((row) => {
              const id = String(row.id),
                checked = ids.includes(id);
              return (
                <button
                  className={checked ? "active" : ""}
                  key={id}
                  disabled={saving}
                  onClick={() => {
                    setConfirm(false);
                    setIds((v) =>
                      checked ? v.filter((x) => x !== id) : [...v, id],
                    );
                  }}
                >
                  {checked ? <Check size={15} /> : <Building2 size={15} />}
                  <span>{title(row)}</span>
                  {saved.includes(id) && <small>已保存</small>}
                </button>
              );
            })}
          </div>
          {ids
            .filter((id) => !catalog.some((r) => String(r.id) === id))
            .map((id) => (
              <div className="cs-unknown-target" key={id}>
                原记录中有一所院校暂未出现在当前目录
                <button
                  className="btn btn-secondary"
                  onClick={() => setIds((v) => v.filter((x) => x !== id))}
                >
                  移除此项
                </button>
              </div>
            ))}
          <button
            className="btn btn-primary"
            disabled={
              saving ||
              ids.length === 0 ||
              JSON.stringify(ids) === JSON.stringify(saved)
            }
            onClick={() => setConfirm(true)}
          >
            保存目标院校（{ids.length} 所）
          </button>
          {confirm && (
            <div
              className="cs-confirm"
              role="alertdialog"
              aria-label="确认保存目标院校"
            >
              <p>
                将当前目标院校更新为：
                {catalog
                  .filter((r) => ids.includes(String(r.id)))
                  .map(title)
                  .join("、")}
                。
              </p>
              <button
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => setConfirm(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={save}
              >
                {saving ? "保存中…" : "确认保存"}
              </button>
            </div>
          )}
        </>
      )}
      {notice && (
        <p role="status" className="computer-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
function SchoolDetail({
  row,
  year,
  onClose,
  onCompare,
  selected,
}: {
  row: Row;
  year: string;
  onClose: () => void;
  onCompare: (r: Row) => void;
  selected: boolean;
}) {
  const [detail, setDetail] = useState<Row>(row),
    [plans, setPlans] = useState<Row[]>([]),
    [planYear, setYear] = useState(year),
    [page, setPage] = useState(1),
    [hasNext, setNext] = useState(false),
    [busy, setBusy] = useState(true),
    [loadingDetail, setLoadingDetail] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    schools
      .detail(String(row.id || row.schoolId))
      .then((r) => {
        if (active) setDetail({ ...row, ...r });
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
    };
  }, [row.id]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    schools
      .plans(String(row.id || row.schoolId), planYear, page)
      .then((r) => {
        if (active) {
          setPlans((v) => (page === 1 ? records(r) : [...v, ...records(r)]));
          setNext(!!r?.hasNextPage);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [row.id, planYear, page]);
  const extra = [
    ["学校性质", "feature"],
    ["隶属单位", "belongsTo"],
    ["学校地址", "schoolAddress"],
    ["占地面积", "schoolSpace"],
    ["硕士一级点", "numMaster"],
    ["硕士二级点", "numMaster2nd"],
    ["博士一级点", "numDoctor"],
    ["博士二级点", "numDoctor2nd"],
    ["重点学科", "numSubject"],
    ["重点实验室", "numLab"],
    ["综合排名", "rank"],
    ["计算机推荐序位", "csRecommendRank"],
    ["保研率", "guaranteeRate"],
    ["招生电话", "schoolPhone"],
    ["招生邮箱", "schoolEmail"],
  ];
  return (
    <section className="panel cs-detail">
      <button className="computer-back" onClick={onClose}>
        <ArrowLeft size={16} />
        院校搜索
      </button>
      <div className="cs-heading">
        <SchoolHeading row={detail} />
        <button className="btn btn-secondary" onClick={() => onCompare(row)}>
          <ArrowRightLeft size={15} />
          {selected ? "移出对比" : "加入对比"}
        </button>
      </div>
      <State busy={loadingDetail} error={error} />
      {detail.intro && (
        <div className="cs-intro">
          <h4>院校简介</h4>
          <RichContent content={detail.intro} />
        </div>
      )}
      <dl className="cs-fields cs-school-info">
        {extra
          .filter(
            ([, key]) =>
              detail[key] !== null &&
              detail[key] !== undefined &&
              detail[key] !== "",
          )
          .map(([label, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{metric(detail[key])}</dd>
            </div>
          ))}
        {safeLink(detail.schoolSite) && (
          <div>
            <dt>学校官网</dt>
            <dd>
              <a
                href={safeLink(detail.schoolSite)}
                target="_blank"
                rel="noreferrer"
              >
                打开学校官网
              </a>
            </dd>
          </div>
        )}
      </dl>
      <div className="cs-heading cs-plan-heading">
        <h3>招生计划与录取数据</h3>
        <select
          className="input"
          value={planYear}
          aria-label="详情招生年份"
          onChange={(e) => {
            setYear(e.target.value);
            setPage(1);
            setPlans([]);
          }}
        >
          <option value="">全部年份</option>
          {["2026", "2025", "2024", "2023"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <State busy={busy && page === 1} empty={!busy && !plans.length} />
      <div className="cs-plan-list">
        {plans.map((p, i) => (
          <details key={p.id || i} open={plans.length === 1}>
            <summary>
              <span>
                <strong>
                  {p.specialName || "招生专业"} <small>{p.specialCode}</small>
                </strong>
                <small>
                  {p.year} · {p.departName || "学院待更新"} ·{" "}
                  {p.degreeTypeName ||
                    (Number(p.degreeType) === 1 ? "专业型" : "学术型")}
                </small>
              </span>
              <span className="cs-plan-score">
                最低分 {metric(p.minScore)}
                <ChevronDown size={15} />
              </span>
            </summary>
            <PlanFields plan={p} />
          </details>
        ))}
      </div>
      {hasNext && (
        <button
          className="btn btn-secondary cs-load"
          disabled={busy}
          onClick={() => setPage((p) => p + 1)}
        >
          {busy ? "读取中…" : "加载更多招生计划"}
        </button>
      )}
    </section>
  );
}
function SchoolComparison({
  selected,
  year,
  onBack,
  onRemove,
}: {
  selected: Row[];
  year: string;
  onBack: () => void;
  onRemove: (r: Row) => void;
}) {
  const [columns, setColumns] = useState<
      { source: Row; detail: Row; plans: Row[]; error?: string }[]
    >([]),
    [busy, setBusy] = useState(true),
    [choice, setChoice] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    setBusy(true);
    Promise.all(
      selected.map(async (source) => {
        try {
          const data = await schools.comparison(
            String(source.id || source.schoolId),
            year,
          );
          return { source, ...data };
        } catch (e: any) {
          return { source, detail: source, plans: [], error: e.message };
        }
      }),
    )
      .then((v) => {
        if (active) setColumns(v);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [selected, year]);
  const fieldRows = [
    ["院校特色", (c: any) => schoolTags(c.detail).join(" · ") || "—"],
    ["地区", (c: any) => c.detail.provinceName],
    ["办学性质", (c: any) => c.detail.feature],
    ["隶属单位", (c: any) => c.detail.belongsTo],
    ...planFields
      .filter(([key]) => !["year", "specialName"].includes(key))
      .map(([key, label]) => [
        label,
        (c: any) => {
          const p = c.plan;
          if (key === "degreeTypeName")
            return (
              p[key] ||
              (Number(p.degreeType) === 1
                ? "专业型"
                : Number(p.degreeType) === 2
                  ? "学术型"
                  : "—")
            );
          if (key === "retestMachine")
            return Number(p[key]) === 1
              ? "有机试"
              : Number(p[key]) === 0
                ? "无机试"
                : "—";
          return p[key];
        },
      ]),
  ];
  const resolved = columns.map((c) => ({
    ...c,
    plan:
      c.plans.find((p) => String(p.id) === choice[schoolRowKey(c.source)]) ||
      matchingSchoolPlan(c.plans, c.source, year) ||
      c.source.planList?.find((p: Row) => String(p.year) === year) ||
      {},
  }));
  return (
    <section className="panel cs-compare">
      <button className="computer-back" onClick={onBack}>
        <ArrowLeft size={16} />
        返回筛选列表
      </button>
      <div className="cs-heading">
        <h2>院校与专业对比</h2>
        <span className="cs-muted">
          {year || "全部年份"} · 每列可选择对应招生计划
        </span>
      </div>
      <State busy={busy} />
      {!busy && (
        <div className="cs-compare-scroll">
          <table>
            <thead>
              <tr>
                <th>比较项目</th>
                {resolved.map((c) => (
                  <th key={schoolRowKey(c.source)}>
                    <button
                      className="computer-icon cs-remove"
                      onClick={() => onRemove(c.source)}
                      aria-label={`移出${title(c.detail)}`}
                    >
                      <X size={15} />
                    </button>
                    <SchoolHeading row={c.detail} />
                    {c.error ? (
                      <p className="cs-error">{c.error}</p>
                    ) : (
                      <select
                        className="input"
                        aria-label={`${title(c.detail)}对比招生计划`}
                        value={String(c.plan.id || "")}
                        onChange={(e) =>
                          setChoice((v) => ({
                            ...v,
                            [schoolRowKey(c.source)]: e.target.value,
                          }))
                        }
                      >
                        {c.plans.map((p, i) => (
                          <option key={p.id || i} value={p.id}>
                            {p.year} {p.specialName} · {p.departName} ·{" "}
                            {p.researchArea || p.specialCode}
                          </option>
                        ))}
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fieldRows.map(([label, fn]) => (
                <tr key={String(label)}>
                  <th>{String(label)}</th>
                  {resolved.map((c) => (
                    <td key={schoolRowKey(c.source)}>
                      {metric((fn as Function)(c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export default function ComputerSchools() {
  const [draft, setDraft] = useState<Filters>(defaults),
    [filters, setFilters] = useState<Filters>(defaults),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [hasNext, setNext] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [feature, setFeature] = useState(""),
    [filterOpen, setFilterOpen] = useState(false),
    [majorOpen, setMajorOpen] = useState(false),
    [majorLabels, setMajorLabels] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<Row[]>([]),
    [detail, setDetail] = useState<Row>(),
    [compare, setCompare] = useState(false),
    [targetOpen, setTargetOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    schools
      .search(filters, page)
      .then((data) => {
        if (!active) return;
        setRows((v) => (page === 1 ? records(data) : [...v, ...records(data)]));
        setTotal(Number(data?.total || 0));
        setNext(!!data?.hasNextPage);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [filters, page]);
  const apply = () => {
    setPage(1);
    setFilters({ ...draft });
    setFilterOpen(false);
    setMajorOpen(false);
    setDetail(undefined);
    setCompare(false);
  };
  const toggle = (row: Row) => {
    setSelected((v) => {
      if (v.some((r) => schoolRowKey(r) === schoolRowKey(row)))
        return v.filter((r) => schoolRowKey(r) !== schoolRowKey(row));
      return [...v, row];
    });
  };
  const visible = rows.filter((row) => schoolHasFeature(row, feature));
  return (
    <div className="computer-schools">
      <div className="cs-heading cs-top">
        <button
          className="btn btn-secondary"
          onClick={() => setTargetOpen((v) => !v)}
        >
          <Target size={16} />
          我的目标院校
        </button>
      </div>
      {targetOpen && <TargetSchools onClose={() => setTargetOpen(false)} />}
      <form
        className="panel cs-search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Search size={19} />
        <input
          className="input"
          aria-label="搜索院校"
          placeholder="搜索院校名称"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <select
          className="input"
          aria-label="招生年份"
          value={draft.year}
          onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
        >
          {["2026", "2025", "2024", "2023"].map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <button
          type="button"
          className={`btn btn-secondary ${filterOpen ? "active" : ""}`}
          onClick={() => setFilterOpen((v) => !v)}
        >
          <Filter size={15} />
          筛选
          {draft.provinces.length + draft.majors.length > 0
            ? `（${draft.provinces.length + draft.majors.length}）`
            : ""}
        </button>
        <button className="btn btn-primary">搜索院校</button>
      </form>
      {filterOpen && (
        <section className="panel cs-filters">
          <div className="cs-filter-row">
            <h4>学位类型</h4>
            <div className="cs-chips">
              {[
                ["", "不限"],
                ["1", "专业型 / 专硕"],
                ["2", "学术型 / 学硕"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={draft.degree === v ? "active" : ""}
                  onClick={() => {
                    setDraft((d) => ({ ...d, degree: v, majors: [] }));
                    setMajorOpen(false);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {schoolRegions.map((region) => (
            <div className="cs-filter-row" key={region.label}>
              <h4>{region.label}省份</h4>
              <div className="cs-chips">
                {region.provinces.map(([id, label]) => (
                  <button
                    className={draft.provinces.includes(id) ? "active" : ""}
                    key={id}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        provinces: d.provinces.includes(id)
                          ? d.provinces.filter((p) => p !== id)
                          : [...d.provinces, id],
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="cs-filter-row">
            <h4>专业方向</h4>
            <div className="cs-chips">
              {draft.majors.map((code) => (
                <button
                  className="active"
                  key={code}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      majors: d.majors.filter((m) => m !== code),
                    }))
                  }
                >
                  {majorLabels[code] || code}
                  <X size={12} />
                </button>
              ))}
              <button onClick={() => setMajorOpen((v) => !v)}>
                选择专业 <ChevronRight size={13} />
              </button>
            </div>
          </div>
          {majorOpen && (
            <MajorPicker
              degree={draft.degree}
              value={draft.majors}
              onChange={(majors) => setDraft((d) => ({ ...d, majors }))}
              onClose={() => setMajorOpen(false)}
              labels={majorLabels}
              onLabels={setMajorLabels}
            />
          )}
          <div className="cs-filter-row">
            <h4>初试科目</h4>
            <div className="cs-chips">
              {["", "11408", "22408", "12408", "other"].map((v) => (
                <button
                  key={v}
                  className={draft.subject === v ? "active" : ""}
                  onClick={() => setDraft((d) => ({ ...d, subject: v }))}
                >
                  {v === "" ? "不限" : v === "other" ? "其他" : v}
                </button>
              ))}
            </div>
          </div>
          <div className="cs-filter-row">
            <h4>初试分数</h4>
            <div className="cs-chips">
              {[
                ["", "不限"],
                ["0-300", "300 以下"],
                ["300-320", "300–320"],
                ["320-340", "320–340"],
                ["340-360", "340–360"],
                ["360-400", "360–400"],
                ["400-", "400 以上"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={draft.score === v ? "active" : ""}
                  onClick={() => setDraft((d) => ({ ...d, score: v }))}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="cs-filter-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setDraft({ ...defaults });
                setFeature("");
              }}
            >
              重置筛选
            </button>
            <button className="btn btn-primary" onClick={apply}>
              应用筛选
            </button>
          </div>
        </section>
      )}
      {notice && (
        <p className="computer-notice" role="status">
          {notice}
          <button
            className="computer-icon"
            onClick={() => setNotice("")}
            aria-label="关闭提示"
          >
            <X size={13} />
          </button>
        </p>
      )}
      {selected.length > 0 && (
        <div className="panel cs-compare-tray">
          <div>
            <ArrowRightLeft size={17} />
            <strong>对比清单</strong>
            <span>{selected.length} 项</span>
          </div>
          <div className="cs-selected">
            {selected.map((row) => (
              <button key={schoolRowKey(row)} onClick={() => toggle(row)}>
                {title(row)}
                {row.planList?.[0]?.specialName
                  ? ` · ${row.planList[0].specialName}`
                  : ""}
                <X size={13} />
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            disabled={selected.length < 2}
            onClick={() => {
              setDetail(undefined);
              setCompare(true);
            }}
          >
            比较招录数据
          </button>
        </div>
      )}
      {compare ? (
        <SchoolComparison
          selected={selected}
          year={filters.year}
          onBack={() => setCompare(false)}
          onRemove={(row) => {
            toggle(row);
            if (selected.length <= 2) setCompare(false);
          }}
        />
      ) : detail ? (
        <SchoolDetail
          row={detail}
          year={filters.year}
          onClose={() => setDetail(undefined)}
          onCompare={toggle}
          selected={selected.some(
            (r) => schoolRowKey(r) === schoolRowKey(detail),
          )}
        />
      ) : (
        <section className="panel cs-results">
          <div className="cs-heading">
            <h3>
              招生院校与专业 <span>{total} 项</span>
            </h3>
            <select
              className="input"
              aria-label="已加载结果的院校特色筛选"
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
            >
              {features.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {feature && (
            <p className="cs-muted">
              特色筛选当前已加载的 {rows.length}{" "}
              项结果。继续加载可查看更多匹配院校。
            </p>
          )}
          <State
            busy={busy && page === 1}
            error={error}
            empty={!busy && !error && !visible.length}
          />
          {visible.map((row, i) => {
            const plan =
                row.planList?.find(
                  (p: Row) => String(p.year) === filters.year,
                ) ||
                row.planList?.[0] ||
                {},
              isSelected = selected.some(
                (s) => schoolRowKey(s) === schoolRowKey(row),
              );
            return (
              <article
                className="cs-school-card"
                key={`${schoolRowKey(row)}-${i}`}
              >
                <div className="cs-card-top">
                  <SchoolHeading row={row} />
                  <div className="cs-card-actions">
                    <button
                      className={`btn btn-secondary ${isSelected ? "active" : ""}`}
                      onClick={() => toggle(row)}
                    >
                      <ArrowRightLeft size={14} />
                      {isSelected ? "已选对比" : "加入对比"}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => setDetail(row)}
                    >
                      查看详情
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="cs-program">
                  <span>
                    <strong>{plan.specialName || "招生专业待更新"}</strong>
                    <small>
                      {plan.specialCode} · {plan.departName || "学院待更新"} ·{" "}
                      {plan.degreeTypeName ||
                        (Number(plan.degreeType) === 1
                          ? "专业型"
                          : Number(plan.degreeType) === 2
                            ? "学术型"
                            : "")}
                    </small>
                  </span>
                  <p>
                    {plan.examSubjectLabel ||
                      plan.examSubject ||
                      "初试科目待更新"}
                  </p>
                </div>
                <div className="cs-metrics">
                  {[
                    ["计划招生", plan.recruitNumber],
                    ["实际录取", plan.enrollNum],
                    ["初试均分", plan.firstAvgScore],
                    ["最低分", plan.minScore],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <strong>{metric(value)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
          {hasNext && (
            <button
              className="btn btn-secondary cs-load"
              disabled={busy}
              onClick={() => setPage((p) => p + 1)}
            >
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <ChevronDown size={15} />
              )}
              继续加载院校
            </button>
          )}
          {!hasNext && rows.length > 0 && (
            <p className="cs-end">已显示全部 {rows.length} 项招录记录</p>
          )}
        </section>
      )}
    </div>
  );
}
