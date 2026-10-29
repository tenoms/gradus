import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { api } from "../../lib/api";

interface Announcement { id: string; title: string; body: string; createdAt: string }
export default function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ announcements: Announcement[] }>("/api/announcements").then(value => { if (active) setItems(value.announcements); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  if (error) return <p className="announcement-error" role="status">空间公告暂时无法读取：{error}</p>;
  if (!items.length) return null;
  return <section className="space-announcements panel" aria-label="空间公告"><div className="announcement-label"><Megaphone size={18} /><h2>空间公告</h2></div><div>{items.slice(0, 5).map((item, index) => <details key={item.id} open={index === 0}><summary><strong>{item.title}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></summary><p>{item.body}</p></details>)}</div></section>;
}
