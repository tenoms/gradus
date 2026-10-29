import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSession } from "../../lib/session";
import { computerRequest, computerSubjects } from "../../platforms/computer";
import type { ComputerRecord } from "../../platforms/computer";
import {
  computerKnowledgeIndex,
  computerKnowledgeMajorId,
  computerKnowledgeReferences,
  createComputerKnowledgeLoader,
  resolveComputerKnowledgeTags,
} from "./computer-knowledge.mjs";
import "./computer-knowledge.css";

const loadCatalog = createComputerKnowledgeLoader(computerRequest);
const subjects = computerKnowledgeIndex(computerSubjects);

export default function ComputerKnowledgeTags({ question, majorId }: { question: ComputerRecord; majorId?: string }) {
  const { session } = useSession();
  const major = computerKnowledgeMajorId(question, majorId);
  const scope = session.user?.id || "guest";
  const key = JSON.stringify([scope, major]);
  const references = computerKnowledgeReferences(question);
  const needsCatalog = references.some(item => item.id && !item.name && !subjects[item.id]);
  const [version, setVersion] = useState(0);
  const [catalog, setCatalog] = useState<{ key: string; index: Record<string, string>; error: boolean; loading: boolean }>({ key: "", index: {}, error: false, loading: false });
  useEffect(() => {
    if (!needsCatalog || !major) return;
    let active = true;
    setCatalog({ key, index: {}, error: false, loading: true });
    loadCatalog(scope, major, version > 0).then(index => {
      if (active) setCatalog({ key, index, error: false, loading: false });
    }).catch(() => {
      if (active) setCatalog({ key, index: {}, error: true, loading: false });
    });
    return () => { active = false; };
  }, [key, needsCatalog, version]);
  if (!references.length) return null;
  const current = catalog.key === key ? catalog : undefined;
  const namedContext: Record<string, string> = { ...subjects, ...current?.index };
  if (question.majorId && question.majorName) namedContext[String(question.majorId)] = String(question.majorName);
  if (question.chapterId && question.chapterName) namedContext[String(question.chapterId)] = String(question.chapterName);
  const { tags, missing } = resolveComputerKnowledgeTags(question, namedContext);
  return <section className="computer-knowledge" aria-label="题目知识点">
    <h4>知识点</h4>
    {tags.length > 0 && <ul className="computer-knowledge-tags">{tags.map(tag => <li key={tag.id}>{tag.name}</li>)}</ul>}
    {needsCatalog && (!current || current.loading) ? <p className="computer-knowledge-note" role="status">正在读取知识点名称…</p> : current?.error ? <p className="computer-knowledge-note" role="status">知识点名称暂时无法读取。<button type="button" onClick={() => setVersion(value => value + 1)}><RefreshCw size={12} />重试</button></p> : missing > 0 && <p className="computer-knowledge-note">{tags.length ? "部分细分知识点暂未提供名称。" : "原平台暂未提供这些知识点的名称。"}</p>}
  </section>;
}
