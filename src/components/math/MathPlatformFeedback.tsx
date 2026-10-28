import { useEffect, useState } from "react";
import { Check, Send } from "lucide-react";
import { AttachmentInput } from "./MathQuestions";
import { mathGet, mathPost, mathRows } from "../../platforms/math";
const groups = [
  {
    name: "功能问题",
    second: [
      ["平板端适配", "平板", "横屏", "iPad", "显示不全", "功能无法使用"],
      ["特定设备Bug", "iOS", "安卓", "公式不显示"],
      [
        "应用卡顿/无响应",
        "卡顿",
        "卡死",
        "崩溃",
        "点不动",
        "没反应",
        "滑动不流畅",
      ],
      [
        "内容加载失败",
        "加载不出来",
        "页面空白",
        "题目/解析不显示",
        "乱码",
        "评论区打不开",
      ],
      ["服务/网络异常", "登录不上", "数据同步失败", "记录丢失"],
      ["打印功能异常", "打印", "导出", "网页打不开"],
      ["模考流程Bug", "报名失败", "无法选择考场", "交卷失败", "0分"],
    ],
  },
  {
    name: "账号问题",
    second: [
      ["无法登出/切换账号", "退出登录", "切换账号", "串号", "登错了"],
      ["登录状态异常", "反复登录", "自动退出", "登录后仍是游客"],
      ["账号绑定与注销", "换绑", "解绑手机", "注销账号", "会员转移"],
      [
        "会员权益问题",
        "会员功能无法使用",
        "App和小程序会员不通",
        "会员身份丢失",
        "精批",
      ],
    ],
  },
  { name: "其他", second: [["功能建议"], ["内容建议"], ["投诉举报"]] },
];
export default function MathPlatformFeedback({ stuid }: { stuid: string }) {
  const [first, setFirst] = useState(0),
    [second, setSecond] = useState(0),
    [tags, setTags] = useState<string[]>([]),
    [content, setContent] = useState(""),
    [images, setImages] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [scan, setScan] = useState(false);
  const group = groups[first],
    category = group.second[second];
  useEffect(() => {
    let active = true;
    mathGet("/api/wx_xcx_info/GetListByAll", { System_Station_ID: 1 })
      .then((r) => {
        if (active) setScan(mathRows(r).some((v) => Number(v.Parm2) === 1));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="panel mir-article">
      <span className="eyebrow">FEEDBACK & IDEAS</span>
      <h2>让学习体验更顺畅</h2>
      <p className="math-muted">
        描述你遇到的平台功能问题，或提出内容与功能建议。
      </p>
      {saved ? (
        <div className="math-state">
          <Check size={30} />
          <h3>意见已提交</h3>
          <p>你的说明与图片已同步到原平台。</p>
          <button className="btn btn-secondary" onClick={() => setSaved(false)}>
            继续反馈
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (scan) {
                const result = await mathGet("/api/base/ScanText2", {
                  txt: content.trim(),
                });
                if (result.Data?.Labels || result.Data?.Reason)
                  throw new Error("说明内容未通过平台检查，请调整后重试");
              }
              await mathPost("/api/sys_give/Inner_sys_give", {
                Type: 3,
                BusType: 6,
                Parms: category[0],
                BusParms: `Web浏览器：${navigator.userAgent}`,
                Tags: tags.join("、"),
                StuID: stuid,
                BusValue: group.name,
                Content: content.trim(),
                Notes: images.join(","),
                System_Station_ID: 1,
              });
              setSaved(true);
              setContent("");
              setImages([]);
              setTags([]);
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="math-photo-index-fields">
            <label>
              问题分类
              <select
                className="input"
                value={first}
                onChange={(e) => {
                  setFirst(Number(e.target.value));
                  setSecond(0);
                  setTags([]);
                }}
              >
                {groups.map((g, i) => (
                  <option key={g.name} value={i}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              具体类型
              <select
                className="input"
                value={second}
                onChange={(e) => {
                  setSecond(Number(e.target.value));
                  setTags([]);
                }}
              >
                {group.second.map((c, i) => (
                  <option key={c[0]} value={i}>
                    {c[0]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {category.length > 1 && (
            <fieldset className="mqt-error-types">
              <legend>相关情况（可多选）</legend>
              {category.slice(1).map((t) => (
                <label key={t}>
                  <input
                    type="checkbox"
                    checked={tags.includes(t)}
                    onChange={() =>
                      setTags((v) =>
                        v.includes(t) ? v.filter((x) => x !== t) : [...v, t],
                      )
                    }
                  />
                  {t}
                </label>
              ))}
            </fieldset>
          )}
          <label className="math-field">
            详细说明
            <textarea
              className="input"
              rows={5}
              required
              maxLength={4000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="描述发生在哪个页面、怎样操作，以及你期望的结果…"
            />
          </label>
          <p className="math-muted">截图（选填）</p>
          <AttachmentInput value={images} onChange={setImages} />
          {error && (
            <p className="math-error-text" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn btn-primary"
            disabled={busy || !content.trim()}
          >
            <Send size={15} />
            {busy ? "正在提交…" : "提交意见"}
          </button>
        </form>
      )}
    </div>
  );
}
