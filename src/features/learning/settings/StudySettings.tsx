import { ArrowDownToLine, ArrowUpRight, Upload, X } from "lucide-react";
import { useState } from "react";
import { useSession } from "../../../shared/auth/session";
import { exportStudyData, importStudyData, setGoal, useStudyData } from "../state/store";

export default function StudySettings() {
  const { session } = useSession();
  const { goalMinutes } = useStudyData();
  const [notice, setNotice] = useState("");
  return (
    <>
      {session.user?.role === "admin" && <section className="panel settings-panel"><h2>管理空间</h2><div className="settings-row"><p>管理用户、学习资源和公告。</p><a className="btn btn-secondary" href="/admin/">打开管理空间<ArrowUpRight size={15} /></a></div></section>}
      <section className="panel settings-panel">
        <h2>每日学习目标</h2>
        <div className="settings-row">
          <div>
            <h3>专注时长</h3>
            <p>设定一个容易坚持的目标，逐步积累。</p>
          </div>
          <select
            className="input goal-select"
            value={goalMinutes}
            onChange={(e) => {
              setGoal(Number(e.target.value));
              setNotice("每日目标已保存");
            }}
          >
            {[15, 30, 45, 60, 90, 120, 180, 240].map((n) => (
              <option value={n} key={n}>
                {n} 分钟 / 天
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>学习记录备份</h2>
        <p className="muted">
          备份备考设置、学习计划、目标和学习活动。导入备份将替换这些内容。
        </p>
        <div className="button-row">
          <button className="btn btn-secondary" onClick={exportStudyData}>
            <ArrowDownToLine size={16} />
            导出备份
          </button>
          <label className="btn btn-secondary file-button">
            <Upload size={16} />
            导入备份
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importStudyData(JSON.parse(await f.text()));
                  setNotice("学习记录已恢复");
                } catch (error) {
                  setNotice((error as Error).message);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="关闭提示"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
