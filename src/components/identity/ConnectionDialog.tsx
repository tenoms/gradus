import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCheck, CircleAlert, Code2, Layers3, LoaderCircle, RefreshCw, Sigma, X } from "lucide-react";
import { api } from "../../lib/api";
import type { Platform } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useDialogFocus } from "../../lib/focus";
const label = (p: Platform) => p === "math" ? "考研数学" : "计算机 408";
export default function ConnectionDialog({
  onClose,
  refresh,
}: {
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const { session } = useSession();
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/auth/accounts");
      const list = Array.isArray(result)
        ? result
        : result.accounts || result.data || [];
      setAccounts(list);
      setSelected(
        String(
          list.find((a: any) => a.status === "alive")?.ref ||
            list[0]?.ref ||
            "",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="modal-backdrop" onClick={() => !connecting && onClose()}>
      <section
        ref={dialogRef}
        className="modal login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && !connecting && onClose()}
      >
        <button
          className="icon-button modal-close"
          disabled={connecting}
          aria-label="关闭登录窗口"
          onClick={onClose}
        >
          <X />
        </button>
        <div className="login-brand">
          <Layers3 size={28} />
        </div>
        <p className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</p>
        <h2 id="login-title">把学习，连接起来</h2>
        <p className="login-description">
          连接分配给你的数学与计算机学习账号，
          <br />
          继续读取你的学习内容和记录。
        </p>
        {loading ? (
          <div className="loading-state"><LoaderCircle size={20} className="spin" />正在读取可用账号…</div>
        ) : success ? (
          <div className="login-result">
            <CheckCheck size={34} />
            <h3>学习账号已连接</h3>
            <p>可以进入已连接学科的题库、课程与个人记录。</p>
            <div className="platform-connection-list full-width">{(["math", "computer"] as Platform[]).map(p => <div key={p}><strong>{label(p)}</strong><span className={session.platforms[p]?.connected ? "green-text" : ""}>{session.platforms[p]?.connected ? "已连接" : session.platforms[p]?.error || "暂未连接"}</span></div>)}</div>
          </div>
        ) : (
          <>
            <label className="field-label">
              选择学习账号
              <select
                className="input account-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={connecting || !accounts.length}
              >
                <option value="" disabled>
                  {accounts.length ? "请选择账号" : "尚未分配学习账号，请联系管理员"}
                </option>
                {accounts.map((a: any) => (
                  <option value={a.ref} key={a.ref}>
                    {a.nickname || a.nickName || a.name || "微信账号"}
                    {a.alive === false ? "（会话失效）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="platform-connection-list">
              {(["math", "computer"] as Platform[]).map((p) => (
                <div key={p}>
                  <span
                    className={`mini-icon ${p === "math" ? "violet" : "mint"}`}
                  >
                    {p === "math" ? <Sigma size={18} /> : <Code2 size={18} />}
                  </span>
                  <strong>{label(p)}</strong>
                  <span>
                    {connecting ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : session.platforms?.[p]?.connected ? (
                      <span className="green-text">已连接</span>
                    ) : (
                      "将同步连接"
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <CircleAlert size={17} />
            <span>{error}</span>
          </div>
        )}
        {success ? (
          <button className="btn btn-primary full-width" onClick={onClose}>
            进入学习空间
            <ArrowRight size={17} />
          </button>
        ) : (
          <button
            className="btn btn-primary full-width"
            disabled={connecting || loading || !selected}
            onClick={async () => {
              setConnecting(true);
              setError("");
              try {
                const result = await api("/api/auth/connect", {
                  method: "POST",
                  body: JSON.stringify({ ref: selected }),
                });
                await refresh();
                if (
                  result.platforms &&
                  !result.platforms.math?.connected &&
                  !result.platforms.computer?.connected
                )
                  throw new Error("账号暂未连接成功，请检查 yyb 会话后重试");
                setSuccess(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setConnecting(false);
              }
            }}
          >
            {connecting ? (
              <>
                <LoaderCircle size={17} className="spin" />
                正在连接两个平台…
              </>
            ) : (
              <>
                连接学习账号
                <ArrowRight size={17} />
              </>
            )}
          </button>
        )}
        {!loading && !connecting && !success && (
          <button className="text-link refresh-accounts" onClick={load}>
            <RefreshCw size={13} />
            刷新可用账号
          </button>
        )}
        <p className="login-note">
          账号由管理员分配，平台返回的内容可直接使用。
        </p>
      </section>
    </div>
  );
}
