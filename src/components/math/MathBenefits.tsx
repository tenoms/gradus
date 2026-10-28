import { useEffect, useState } from "react";
import { Award, Gift, LoaderCircle, RefreshCw } from "lucide-react";
import RichContent from "../RichContent";
import { useSession } from "../../lib/session";
import {
  mathCommand,
  mathData,
  mathGet,
  mathPost,
  mathRows,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import {
  canGiftCoupon,
  couponActivationPayload,
  couponStatus,
} from "./account-model.mjs";
import "./math-account.css";
type Action = { title: string; description: string; run: () => Promise<any> };
const textResult = (r: any) =>
  typeof mathData(r) === "string" ? mathData(r) : r.msg || "平台已处理请求";
export default function MathBenefits({ user }: { user: MathRow }) {
  const { refresh } = useSession(),
    stuid = String(user.StuID || ""),
    [tab, setTab] = useState("我的权益"),
    [info, setInfo] = useState<Record<string, MathRow[]>>({}),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [action, setAction] = useState<Action>(),
    [ledgerType, setLedgerType] = useState(1),
    [page, setPage] = useState(1),
    [ledger, setLedger] = useState<MathRow[]>([]),
    [ledgerBusy, setLedgerBusy] = useState(false),
    [code, setCode] = useState(""),
    [codeType, setCodeType] = useState("优惠券"),
    [gift, setGift] = useState<MathRow>(),
    [target, setTarget] = useState(""),
    [recipient, setRecipient] = useState<MathRow>(),
    [oldCoupons, setOldCoupons] = useState(false);
  const load = async () => {
    setBusy(true);
    setError("");
    const jobs = [
      ["integral", () => mathCommand("GetUserIntegral", { StuID: stuid })],
      [
        "gifts",
        () =>
          mathCommand("GetIntegralConvertInfo", {
            StuID: stuid,
            System_Station_ID: 1,
          }),
      ],
      [
        "rules",
        () =>
          mathCommand(
            "GetIntegralRuleInfo",
            { StuID: stuid, System_Station_ID: 1 },
            true,
          ),
      ],
      [
        "coupons",
        () =>
          mathGet("/api/couponcard_study/GetListByPage", {
            StuID: stuid,
            System_Station_ID: 1,
            IsConvert: 1,
            page: 1,
            limit: 1000,
          }),
      ],
      [
        "vip",
        () =>
          mathCommand("GetVipFreeList", { StuID: stuid, System_Station_ID: 1 }),
      ],
      [
        "exam",
        () =>
          mathCommand("GetExamFreeList", {
            StuID: stuid,
            System_Station_ID: 1,
          }),
      ],
    ] as const;
    const results = await Promise.allSettled(jobs.map((j) => j[1]()));
    const next: Record<string, MathRow[]> = {};
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled")
        next[jobs[i][0]] = mathRows(r.value).filter(
          (row) => row.BusType !== "联系老师",
        );
      else failed.push(jobs[i][0]);
    });
    setInfo(next);
    if (failed.length) setError(`部分记录暂时无法读取，请刷新重试。`);
    setBusy(false);
  };
  const loadLedger = async () => {
    setLedgerBusy(true);
    try {
      setLedger(
        mathRows(
          await mathCommand("GetUserIntegralDetail", {
            StuID: stuid,
            Operation: ledgerType,
            page,
            limit: 30,
          }),
        ),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setLedgerBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, [stuid]);
  useEffect(() => {
    if (tab === "积分流水") loadLedger();
  }, [tab, ledgerType, page, stuid]);
  const execute = async () => {
    if (!action) return;
    setSaving(true);
    setNotice("");
    try {
      const result = await action.run();
      setNotice(textResult(result));
      setAction(undefined);
      setGift(undefined);
      setRecipient(undefined);
      setCode("");
      await Promise.all([refresh(), load()]);
      if (tab === "积分流水") await loadLedger();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const token = code.replace(/\s/g, "");
      if (codeType === "课程或功能") {
        setAction({
          title: "激活已有权益",
          description: `确认使用已输入的课程或功能激活码？平台将核实其可用性。`,
          run: () =>
            mathPost("/api/sys_users_isact/ActCode", {
              StuID: stuid,
              Code: token,
            }),
        });
      } else if (token.length === 6) {
        setAction({
          title: "领取优惠券",
          description: "确认使用已输入的 6 位优惠码领取到当前账号？",
          run: () =>
            mathPost("/api/couponcard_study/ActivationCode", {
              Keyid: token,
              StuID: stuid,
            }),
        });
      } else {
        const row = mathRows(
          await mathGet("/api/couponcard_study/GetListByPage", {
            Keyid: token,
            page: 1,
            limit: 1000,
            System_Station_ID: 1,
          }),
        )[0];
        const payload = couponActivationPayload(row || {}, stuid);
        setAction({
          title: "领取优惠券",
          description: `确认领取「${row._couponcard?.Title || row._couponcard?.Type || "已有优惠券"}」？领取后绑定当前账号。`,
          run: () =>
            mathPost("/api/couponcard_study/Inner_couponcard_study", payload),
        });
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const findRecipient = async () => {
    setSaving(true);
    setNotice("");
    setRecipient(undefined);
    try {
      if (!/^\d+$/.test(target.trim())) throw new Error("请输入对方的数字学号");
      const r = mathRows(
        await mathCommand("checkUserSearch", { UserID: target.trim() }),
      )[0];
      if (!r?.ID) throw new Error("未找到该学号，请核实后重试");
      setRecipient(r);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const coupons = (info.coupons || []).filter((r) =>
    oldCoupons
      ? !["可使用", "未生效"].includes(couponStatus(r))
      : ["可使用", "未生效"].includes(couponStatus(r)),
  );
  const balance = info.integral?.[0]?.Integral;
  return (
    <div className="math-benefits macc-benefits">
      <div className="math-integral-summary">
        <Gift size={27} />
        <div>
          <span>我的数学积分</span>
          <strong>{balance ?? "—"}</strong>
        </div>
        <small>
          {user.VipEndTime
            ? `会员有效期至 ${String(user.VipEndTime).slice(0, 10)}`
            : "会员权益以平台记录为准"}
        </small>
        <button
          className="math-icon-button"
          onClick={load}
          disabled={busy}
          aria-label="刷新权益"
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="math-account-subtabs">
        {[
          "我的权益",
          "积分流水",
          "积分兑换",
          "积分规则",
          "免费体验",
          "激活已有权益",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <p className="math-error-text">{error}</p>}
      {busy ? (
        <div className="math-state">
          <LoaderCircle className="spin" />
          <p>正在读取权益记录…</p>
        </div>
      ) : (
        <>
          {tab === "我的权益" && (
            <>
              <div className="macc-rights">
                <h4>当前已获权益</h4>
                <dl>
                  {[
                    ["会员有效期", "VipEndTime"],
                    ["教辅范围", "EBookIDs"],
                    ["试卷范围", "PaperIDs"],
                    ["专辑范围", "AlbumIDs"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{String(user[key] ?? "暂无记录")}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mer-heading">
                <h4>我的券包</h4>
                <button
                  className="btn btn-secondary"
                  onClick={() => setOldCoupons((v) => !v)}
                >
                  {oldCoupons ? "查看可用券" : "查看已使用及过期券"}
                </button>
              </div>
              <div className="math-benefit-list">
                {coupons.map((r, i) => {
                  const card = r._couponcard || {},
                    state = couponStatus(r);
                  return (
                    <article key={r.ID || i}>
                      <div className="math-benefit-icon">
                        <Gift size={22} />
                      </div>
                      <div>
                        <h4>
                          {card.Title || card.Type || "学习优惠券"}{" "}
                          <small>{state}</small>
                        </h4>
                        <p className="macc-muted">
                          {card.Type}
                          {card.Money ? ` · 面值 ${card.Money} 元` : ""}
                          {card.Days ? ` · ${card.Days} 天` : ""}
                        </p>
                        <p className="macc-muted">
                          {String(r.StartTime || "").slice(0, 16)} 至{" "}
                          {String(r.EndTime || "").slice(0, 16)}
                        </p>
                        <details>
                          <summary>查看记录</summary>
                          <dl className="macc-record-detail">
                            {[
                              ["领取时间", r.ConvertTime],
                              ["使用时间", r.UseTime],
                              ["备注", r.Notes],
                              ["说明", card.Notes || card.Remark],
                            ]
                              .filter(([, v]) => v)
                              .map(([k, v]) => (
                                <div key={k}>
                                  <dt>{k}</dt>
                                  <dd>{String(v)}</dd>
                                </div>
                              ))}
                          </dl>
                        </details>
                      </div>
                      {canGiftCoupon(r) && (
                        <button
                          className="btn btn-secondary"
                          disabled={saving}
                          onClick={() => {
                            setGift(r);
                            setTarget("");
                            setRecipient(undefined);
                          }}
                        >
                          转赠
                        </button>
                      )}
                      {state === "可使用" &&
                        card.Title === "完善信息开通7天会员" && (
                          <button
                            className="btn btn-primary"
                            disabled={saving}
                            onClick={() =>
                              setAction({
                                title: "启用已有会员券",
                                description: `确认使用「${card.Title}」？平台将核实资料完整程度并处理权益。`,
                                run: () =>
                                  mathPost(
                                    "/api/couponcard_study/ActivationCodeStudy",
                                    { StuID: stuid, Keyid: r.Keyid },
                                  ),
                              })
                            }
                          >
                            启用
                          </button>
                        )}
                    </article>
                  );
                })}
                {!coupons.length && (
                  <div className="math-state">
                    <p>当前没有{oldCoupons ? "已使用或过期" : "可用"}优惠券</p>
                  </div>
                )}
              </div>
            </>
          )}
          {tab === "积分流水" && (
            <>
              <div className="math-account-subtabs">
                {[
                  [1, "积分收入"],
                  [-1, "积分支出"],
                ].map(([v, t]) => (
                  <button
                    key={v}
                    className={ledgerType === v ? "active" : ""}
                    onClick={() => {
                      setLedgerType(Number(v));
                      setPage(1);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {ledgerBusy ? (
                <div className="math-state">
                  <LoaderCircle className="spin" />
                </div>
              ) : (
                <div className="macc-ledger">
                  {ledger.map((r, i) => (
                    <article key={r.ID || i}>
                      <div>
                        <strong>{r.RuleName || r.BusType || "积分变动"}</strong>
                        <small>
                          {String(r.AddTime || "")
                            .replace("T", " ")
                            .slice(0, 19)}
                        </small>
                        {r.Notes && <p>{r.Notes}</p>}
                      </div>
                      <b className={ledgerType === 1 ? "income" : "expense"}>
                        {ledgerType === 1 ? "+" : "−"}
                        {Math.abs(Number(r.Integral || 0))}
                      </b>
                    </article>
                  ))}
                  {!ledger.length && (
                    <p className="math-state">暂无此类积分记录</p>
                  )}
                </div>
              )}
              <div className="macc-page">
                <button
                  className="btn btn-secondary"
                  disabled={page === 1 || ledgerBusy}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </button>
                <span>第 {page} 页</span>
                <button
                  className="btn btn-secondary"
                  disabled={ledger.length < 30 || ledgerBusy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </button>
              </div>
            </>
          )}
          {(tab === "积分兑换" || tab === "积分规则") && (
            <div className="math-benefit-list">
              {(info[tab === "积分兑换" ? "gifts" : "rules"] || []).map(
                (r, i) => (
                  <article key={r.ID || i}>
                    <div className="math-benefit-icon">
                      <Award size={22} />
                    </div>
                    <div>
                      <h4>{r.RuleName || r.Title || r.Name || "积分权益"}</h4>
                      <RichContent content={r.Notes || r.Content || r.Remark} />
                      <small>
                        {r.Integral ?? r.Value ?? ""} 积分
                        {r.MaxDay ? ` · 每日上限 ${r.MaxDay} 次` : ""}
                      </small>
                    </div>
                    {tab === "积分兑换" && (
                      <button
                        className="btn btn-secondary"
                        disabled={
                          saving ||
                          balance === undefined ||
                          Number(balance) < Number(r.Integral || 0)
                        }
                        onClick={() =>
                          setAction({
                            title: "确认积分兑换",
                            description: `将使用 ${r.Integral} 积分兑换「${r.RuleName || r.Title || r.Name}」，确认后由平台扣除积分。`,
                            run: () =>
                              mathPost("/api/sys_integral_log/consume", {
                                RuleID: r.ID,
                                StuID: stuid,
                              }),
                          })
                        }
                      >
                        兑换
                      </button>
                    )}
                  </article>
                ),
              )}
              {!(info[tab === "积分兑换" ? "gifts" : "rules"] || []).length && (
                <div className="math-state">
                  <p>暂无记录</p>
                </div>
              )}
            </div>
          )}
          {tab === "免费体验" && (
            <div className="math-benefit-list">
              {[
                {
                  key: "vip",
                  name: "数学会员免费体验",
                  path: "/api/sys_users/ExperienceVip",
                  description:
                    "确认领取原平台提供的免费会员体验？具体有效期以平台返回为准。",
                },
                {
                  key: "exam",
                  name: "免费智能测试体验",
                  path: "/api/ks_paper/ExperiencePaper",
                  description: "确认领取一次免费智能测试体验？",
                },
              ].map((item) => (
                <article key={item.key}>
                  <div className="math-benefit-icon">
                    <Gift size={23} />
                  </div>
                  <div>
                    <h4>{item.name}</h4>
                    <p className="macc-muted">
                      {info[item.key] === undefined
                        ? "领取状态暂未核实"
                        : info[item.key].length
                          ? "平台记录显示已领取"
                          : "尚无领取记录"}
                    </p>
                    {info[item.key]?.map((r, i) => (
                      <p className="macc-muted" key={i}>
                        {r.AddTime
                          ? `领取于 ${String(r.AddTime).slice(0, 16)}`
                          : ""}
                        {r.EndTime
                          ? ` · 有效期至 ${String(r.EndTime).slice(0, 16)}`
                          : ""}
                      </p>
                    ))}
                  </div>
                  <button
                    className="btn btn-secondary"
                    disabled={
                      saving ||
                      info[item.key] === undefined ||
                      !!info[item.key].length
                    }
                    onClick={() =>
                      setAction({
                        title: "领取免费体验",
                        description: item.description,
                        run: () =>
                          mathPost(item.path, {
                            StuID: stuid,
                            ...(item.key === "vip"
                              ? { System_Station_ID: 1 }
                              : {}),
                          }),
                      })
                    }
                  >
                    {info[item.key]?.length ? "已领取" : "领取体验"}
                  </button>
                </article>
              ))}
            </div>
          )}
          {tab === "激活已有权益" && (
            <form className="macc-activate" onSubmit={activate}>
              <label className="math-field">
                激活码类别
                <select
                  className="input"
                  value={codeType}
                  onChange={(e) => setCodeType(e.target.value)}
                >
                  <option>优惠券</option>
                  <option>课程或功能</option>
                </select>
              </label>
              <label className="math-field">
                已有激活码
                <input
                  className="input"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                  placeholder="输入你已有的激活码"
                />
              </label>
              <button
                className="btn btn-primary"
                disabled={saving || !code.trim()}
              >
                核对并激活
              </button>
            </form>
          )}
        </>
      )}
      {gift && (
        <section className="macc-confirm">
          <h4>转赠「{gift._couponcard?.Title || gift._couponcard?.Type}」</h4>
          <label className="math-field">
            接收方学号
            <input
              className="input"
              inputMode="numeric"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setRecipient(undefined);
              }}
              placeholder="请输入对方在数学平台的数字学号"
            />
          </label>
          <button
            className="btn btn-secondary"
            disabled={saving || !target.trim()}
            onClick={findRecipient}
          >
            查询接收人
          </button>
          {recipient && (
            <div className="macc-recipient">
              {/^https?:/.test(recipient.HeadImg || "") && (
                <img src={recipient.HeadImg} alt="接收人头像" />
              )}
              <div>
                <strong>
                  {recipient.UserNick || recipient.NickName || "平台用户"}
                </strong>
                <p>学号：{target}</p>
              </div>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() =>
                  setAction({
                    title: "确认转赠优惠券",
                    description: `确认将「${gift._couponcard?.Title || gift._couponcard?.Type}」转赠给 ${recipient.UserNick || recipient.NickName || "平台用户"}（学号 ${target}）？转赠后该券将由对方使用。`,
                    run: () =>
                      mathPost("/api/couponcard/InActByID", {
                        ID: gift.ID,
                        UserID: recipient.ID,
                      }),
                  })
                }
              >
                复核转赠
              </button>
            </div>
          )}
          <button
            className="macc-cancel"
            disabled={saving}
            onClick={() => {
              setGift(undefined);
              setRecipient(undefined);
            }}
          >
            取消转赠
          </button>
        </section>
      )}
      {action && (
        <section
          className="macc-confirm"
          role="alertdialog"
          aria-label={action.title}
        >
          <h4>{action.title}</h4>
          <p>{action.description}</p>
          <div>
            <button
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => setAction(undefined)}
            >
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={execute}
            >
              {saving ? "处理中…" : "确认提交"}
            </button>
          </div>
        </section>
      )}
      {notice && (
        <p className="math-account-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
