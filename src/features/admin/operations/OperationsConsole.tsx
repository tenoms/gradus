import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { api } from "../../../shared/api/client";
import Pagination from "../../../shared/ui/pagination/Pagination";
import { usePagination } from "../../../shared/ui/pagination/use-pagination";
import "./operations.css";

interface RequestEntry { id: string; at: string; space: string; method: string; route: string; status: number; durationMs: number; platform?: string }
interface Operations { startedAt: string; uptimeSeconds: number; requests: number; failures: number; configurationRevision: number; recentRequests: RequestEntry[] }
const when = (at: string) => new Date(at).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
export default function OperationsConsole() {
  const contentRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<Operations>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [space, setSpace] = useState("all");
  async function refresh() {
    setLoading(true); setError("");
    try { setData(await api<Operations>("/api/admin/operations")); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const rows = (data?.recentRequests || []).filter(entry => (space === "all" || entry.space === space) && `${entry.id} ${entry.route} ${entry.method} ${entry.status}`.toLowerCase().includes(query.toLowerCase()));
  const pagination = usePagination({ total: rows.length, resetKey: `${query}|${space}` });
  return <div className="operations-console">
    <div className="operations-intro"><p>查看当前进程最近 100 次请求的状态、耗时与请求编号。请求正文、查询参数和凭据不进入诊断记录。</p></div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={17} />{error}</div>}
    {data && <div className="admin-metrics">{[
      ["运行时间", `${Math.floor(data.uptimeSeconds / 60)} 分钟`, `启动于 ${when(data.startedAt)}`],
      ["当前配置版本", `v${data.configurationRevision}`, "配置保存后立即应用"],
      ["已处理请求", String(data.requests), "当前进程累计"],
      ["服务异常", String(data.failures), "HTTP 5xx 响应"],
    ].map(([label, value, note]) => <section className="panel admin-metric" key={label}><div>{label}</div><strong>{value}</strong><small>{note}</small></section>)}</div>}
    <section className="panel pagination-content" ref={contentRef}><div className="admin-section-heading"><div><h2>请求诊断</h2><p>通过响应中的 X-Request-ID 与请求编号定位同一次操作。</p></div></div><div className="admin-user-toolbar"><label className="admin-search"><Search size={17} /><input aria-label="搜索请求诊断" placeholder="搜索接口、状态或请求编号" value={query} onChange={e => setQuery(e.target.value)} /></label><select className="input" aria-label="筛选请求空间" value={space} onChange={e => setSpace(e.target.value)}><option value="all">全部空间</option><option value="admin">管理空间</option><option value="learning">学习空间</option><option value="system">系统入口</option></select><button className="btn btn-secondary admin-inline-refresh" onClick={() => void refresh()} disabled={loading} aria-busy={loading} aria-label="刷新诊断" title="重新读取运行诊断"><RefreshCw size={15} className={loading ? "spin" : ""} /><span>刷新诊断</span></button></div>
      {loading && !data ? <div className="admin-state" role="status"><LoaderCircle className="spin" />正在读取诊断记录…</div> : <div className="admin-table-scroll"><table className="admin-table operations-table"><thead><tr><th>时间</th><th>空间</th><th>请求</th><th>状态</th><th>耗时</th><th>请求编号</th></tr></thead><tbody>{rows.slice(pagination.start, pagination.end).map(entry => <tr key={entry.id}><td>{when(entry.at)}</td><td>{{ admin: "管理", learning: "学习", system: "系统" }[entry.space] || entry.space}</td><td><code>{entry.method} {entry.route}</code>{entry.platform && <small> · {entry.platform}</small>}</td><td><span className={`admin-badge ${entry.status >= 500 ? "operations-failed" : entry.status >= 400 ? "" : "admin-badge-green"}`}>{entry.status}</span></td><td>{entry.durationMs} ms</td><td><code className="operations-request-id">{entry.id}</code></td></tr>)}</tbody></table>{!rows.length && <div className="admin-empty">暂无符合条件的请求记录</div>}</div>}
      <Pagination contentRef={contentRef} page={pagination.page} pageSize={pagination.pageSize} total={rows.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} label="请求诊断" disabled={loading} />
    </section>
  </div>;
}
