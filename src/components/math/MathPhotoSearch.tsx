import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Crop,
  FileText,
  LoaderCircle,
  Search,
  Upload,
} from "lucide-react";
import MathImageCropper from "./MathImageCropper";
import {
  mathApi,
  mathData,
  mathGet,
  mathPost,
  mathRows,
  mathTitle,
} from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import "./math-photo.css";

async function recognize(file: File) {
  const form = new FormData();
  form.append("image", file);
  const response = await fetch("/api/platform/math/photo", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || data.message || "图片识别失败");
  if (data.errorCode !== "000" || !data.ocr)
    throw new Error(
      data.errorMessage || "没有识别到清晰题目，请调整裁切区域后重试",
    );
  return data;
}
async function uploadIndexImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(
    "/api/platform/math/upload?path=/api/sys_attachment/SearchUploadImg",
    { method: "POST", credentials: "same-origin", body: form },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "图片上传失败");
  const data = mathData(result);
  const url = data?.src || data?.Path || data?.url;
  if (!/^https?:\/\//i.test(url))
    throw new Error("平台没有返回可用的题目图片地址");
  return String(url);
}
export default function MathPhotoSearch({
  stuid,
  back,
  onQuestion,
}: {
  stuid: string;
  back: () => void;
  onQuestion: (row: MathRow) => void;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [rows, setRows] = useState<MathRow[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [books, setBooks] = useState<MathRow[]>([]);
  const [teacher, setTeacher] = useState<MathRow>();
  const [bookId, setBookId] = useState("");
  const [subject, setSubject] = useState("数一");
  const [recognition, setRecognition] = useState<MathRow>();
  const [indexOpen, setIndexOpen] = useState(false);
  const [chosen, setChosen] = useState<MathRow>();
  const [metadata, setMetadata] = useState({
    ChapterName: "",
    QuestionPage: "",
    QuestionSort: "",
    Sort: "",
    Year: "",
    QuestionType: "",
  });
  const [notice, setNotice] = useState("");
  const [indexUrl, setIndexUrl] = useState("");
  useEffect(() => {
    let active = true;
    mathApi
      .books()
      .then((r) => {
        if (active) setBooks(mathRows(r));
      })
      .catch(() => {});
    mathGet("/api/question_teachers/GetListByPage", {
      System_Station_ID: 1,
      BusType: "兼职拍搜老师",
      BusValue: stuid,
      IsValid: 1,
      page: 0,
      limit: 1,
    })
      .then(async (r) => {
        if (!active) return;
        const role = mathRows(r)[0];
        setTeacher(role);
        if (role) {
          const all = await mathGet("/api/book_list/GetListByPage", {
            System_Station_ID: 1,
          });
          if (active) setBooks(mathRows(all));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [stuid]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const search = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setNotice("");
    setRows(undefined);
    try {
      const recognized = await recognize(file);
      setRecognition(recognized);
      const keys = { SearchKey1: recognized.feat, SearchKey2: recognized.ocr };
      const result = teacher
        ? await mathPost("/api/question_search_photo/SearchPhotoKey2", {
            ...keys,
            System_Station_ID: 1,
            bookids: teacher.BusID,
          })
        : bookId
          ? await mathPost("/api/question_search_photo/GetBookByID", {
              ...keys,
              BusID: bookId,
              limit: 10,
            })
          : await mathPost("/api/question_search_photo/GetBookByAll", {
              ...keys,
              BusType: subject,
            });
      setRows(mathRows(result));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const candidate = (row: MathRow) => {
    if (teacher) {
      setChosen(row);
      setIndexOpen(true);
      setMetadata((v) => ({
        ...v,
        QuestionPage: String(row.QuestionPage || v.QuestionPage),
        QuestionSort: String(row.QuestionSort || v.QuestionSort),
        ChapterName: row.ChapterName || v.ChapterName,
      }));
    } else onQuestion(row);
  };
  const allowedSourceBooks = teacher?.Notes
    ? books.filter((b) =>
        String(teacher.Notes).split(",").includes(String(b.ID)),
      )
    : books;
  const [manualSource, setManualSource] = useState("");
  const [manualPage, setManualPage] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [manualRows, setManualRows] = useState<MathRow[]>();
  const manual = async () => {
    if (!manualSource || !(manualPage || manualNumber)) return;
    setLoading(true);
    setError("");
    try {
      setManualRows(
        mathRows(
          await mathGet("/api/question_list/GetListByPage", {
            System_Station_ID: 1,
            BookID: manualSource,
            QuestionID: manualNumber,
            QuestionPage: manualPage,
          }),
        ),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const saveIndex = async (found: boolean) => {
    if (!teacher || !file) return;
    setLoading(true);
    setError("");
    try {
      const url = indexUrl || (await uploadIndexImage(file));
      setIndexUrl(url);
      const target = books.find((b) => String(b.ID) === String(teacher.BusID));
      await mathPost("/api/question_search_photo/Inner_question_search_photo", {
        BookID: teacher.BusID,
        BookName: target?.Name || "",
        QuestionImg: url,
        QuestionID: found
          ? chosen?._manual
            ? chosen.ID
            : chosen?.QuestionID || chosen?.ID || 0
          : 0,
        BusType: "拍照搜题兼职对比",
        BusValue: found ? (chosen?._manual ? "手动添加" : "搜到了") : "没搜到",
        BusID: 0,
        ...metadata,
        System_Station_ID: 1,
        StuID: stuid,
      });
      setNotice("图片索引对照结果已保存");
      setIndexOpen(false);
      setChosen(undefined);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const chooseFile = (value: File | undefined) => {
    if (value && value.size > 15 * 1024 * 1024) {
      setError("请选择小于15 MB的题目图片");
      return;
    }
    setFile(value);
    setRows(undefined);
    setError("");
    setRecognition(undefined);
    setIndexUrl("");
    setChosen(undefined);
    setManualRows(undefined);
    setIndexOpen(false);
    setCropOpen(!!value);
  };
  return (
    <div className="math-workspace">
      <button className="math-back" onClick={back}>
        <ArrowLeft size={16} />
        返回资料库
      </button>
      <div className="math-section-heading">
        <div>
          <span className="eyebrow">SEARCH BY IMAGE</span>
          <h2>框选一道题，找到解题思路</h2>
          <p>上传或拍摄题目，旋转裁切后匹配原题与解析。</p>
        </div>
        {teacher && (
          <button
            className="btn btn-secondary"
            onClick={() => setIndexOpen(!indexOpen)}
          >
            <Camera size={16} />
            图片索引维护
          </button>
        )}
      </div>
      <div className="panel math-photo-panel">
        <div className="math-photo-filters">
          <label>
            数学类别
            <select
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {["数一", "数二", "数三"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            搜索范围
            <select
              className="input"
              value={teacher ? String(teacher.BusID) : bookId}
              disabled={!!teacher}
              onChange={(e) => setBookId(e.target.value)}
            >
              {!teacher && <option value="">全部教辅与真题</option>}
              {(teacher
                ? books.filter((b) => String(b.ID) === String(teacher.BusID))
                : books
              ).map((b, i) => (
                <option key={b.ID || i} value={b.ID}>
                  {mathTitle(b)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="math-photo-upload">
          <Upload size={28} />
          <strong>{file ? file.name : "选择题目图片"}</strong>
          <span>选择相册，或使用手机拍摄；可旋转与裁切</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="上传数学题目图片"
            onChange={(e) => chooseFile(e.target.files?.[0])}
          />
        </label>
        {cropOpen && file ? (
          <MathImageCropper
            file={file}
            onCancel={() => setCropOpen(false)}
            onConfirm={(value) => {
              setFile(value);
              setCropOpen(false);
              setRecognition(undefined);
              setIndexUrl("");
            }}
          />
        ) : (
          preview && (
            <div className="math-photo-preview-box">
              <img src={preview} alt="待识别的题目" />
              <button
                className="btn btn-secondary"
                onClick={() => setCropOpen(true)}
              >
                <Crop size={15} />
                调整裁切
              </button>
            </div>
          )
        )}
        <button
          className="btn btn-primary"
          disabled={loading || !file || cropOpen}
          onClick={search}
        >
          {loading ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Search size={16} />
          )}
          {loading ? "正在识别与匹配…" : "识别并搜索原题"}
        </button>
        {error && (
          <p className="math-error-text" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="math-account-notice" role="status">
            {notice}
          </p>
        )}
      </div>
      {rows && (
        <div className="panel">
          <div className="math-toolbar">
            <h3>匹配结果</h3>
            <span className="math-count">{rows.length} 道题目</span>
          </div>
          {!rows.length ? (
            <div className="math-state">
              <p>没有匹配到原题</p>
              <small>请保留完整题干，调整裁切范围或选择指定书籍再试。</small>
            </div>
          ) : (
            <div className="math-content-list">
              {rows.map((r, i) => (
                <button
                  key={r.QuestionID || r.ID || i}
                  onClick={() => candidate(r)}
                >
                  <div className="math-list-icon">
                    <FileText size={19} />
                  </div>
                  <span>
                    <strong>
                      {r.BookName || r.Name || `候选题目 ${i + 1}`}
                    </strong>
                    <small>
                      第 {r.QuestionPage || "—"} 页 · 第{" "}
                      {r.QuestionSort || r.QuestionID} 题
                      {teacher ? " · 点击核对并建立索引" : ""}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {teacher && indexOpen && (
        <div className="panel math-photo-index">
          <h3>授权书籍的图片索引维护</h3>
          <p>
            当前索引目标：
            {mathTitle(
              books.find((b) => String(b.ID) === String(teacher.BusID)) || {
                Name: "分配书籍",
              },
            )}
          </p>
          <div className="math-photo-manual">
            <select
              className="input"
              aria-label="手动查找来源书籍"
              value={manualSource}
              onChange={(e) => setManualSource(e.target.value)}
            >
              <option value="">选择来源书籍</option>
              {allowedSourceBooks.map((b, i) => (
                <option key={b.ID || i} value={b.ID}>
                  {mathTitle(b)}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="页码"
              aria-label="手动查找页码"
              value={manualPage}
              onChange={(e) => setManualPage(e.target.value)}
            />
            <input
              className="input"
              placeholder="题号"
              aria-label="手动查找题号"
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              disabled={
                loading || !manualSource || !(manualPage || manualNumber)
              }
              onClick={manual}
            >
              手动查找
            </button>
          </div>
          {manualRows && (
            <div className="math-content-list">
              {manualRows.map((r, i) => (
                <button
                  key={r.ID || i}
                  onClick={() => {
                    setChosen({ ...r, _manual: true });
                    setMetadata((v) => ({
                      ...v,
                      QuestionPage: String(r.QuestionPage || ""),
                      QuestionSort: String(r.QuestionID || ""),
                    }));
                  }}
                >
                  <span>
                    <strong>
                      第 {r.QuestionPage || "—"} 页 · 第 {r.QuestionID || i + 1}{" "}
                      题
                    </strong>
                    <small>
                      {chosen?.ID === r.ID
                        ? "已选中，待保存"
                        : "选择作为对照原题"}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          )}
          <div className="math-photo-index-fields">
            {[
              ["ChapterName", "章节名称"],
              ["QuestionPage", "目标页码"],
              ["QuestionSort", "目标题号"],
              ["Sort", "目录序号"],
              ["Year", "年份"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  className="input"
                  value={metadata[key as keyof typeof metadata]}
                  onChange={(e) =>
                    setMetadata((v) => ({ ...v, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label>
              题目类型
              <select
                className="input"
                value={metadata.QuestionType}
                onChange={(e) =>
                  setMetadata((v) => ({ ...v, QuestionType: e.target.value }))
                }
              >
                <option value="">请选择题目类型</option>
                {["选择题", "填空题", "解答题"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="math-crop-controls">
            <button
              className="btn btn-primary"
              disabled={loading || !chosen || !file || !metadata.QuestionType}
              onClick={() => saveIndex(true)}
            >
              保存匹配原题
            </button>
            <button
              className="btn btn-secondary"
              disabled={
                loading ||
                !file ||
                !metadata.QuestionType ||
                (!metadata.QuestionPage && !metadata.QuestionSort)
              }
              onClick={() => saveIndex(false)}
            >
              记录没有匹配原题
            </button>
          </div>
          {recognition && (
            <p className="math-qa-footnote">
              已完成当前图片的识别，可以按页码与题号人工核对索引。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
