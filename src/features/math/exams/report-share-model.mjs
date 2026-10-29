export function escapeReportText(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

export function reportSnapshotFilename(title = "学习报告", now = new Date()) {
  const name =
    String(title || "学习报告")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64) || "学习报告";
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  return `${name}-报告快照-${stamp}.html`;
}

export function safeReportSnapshotImage(value, baseUrl) {
  if (
    /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(
      String(value),
    )
  )
    return String(value);
  try {
    const url = new URL(String(value), baseUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      /\.(?:m3u8|mp4|webm|mp3|m4a|aac|wav|ogg)(?:$|[?#])/i.test(url.href)
    )
      return "";
    return url.href;
  } catch {
    return "";
  }
}

export function reportSnapshotDocument(title, sanitizedBody, now = new Date()) {
  const heading = escapeReportText(title || "学习报告");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: http: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${heading} · 报告快照</title><style>
*{box-sizing:border-box}html{color:#242238;background:#f5f4f8;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.6}body{max-width:1100px;margin:28px auto;padding:0 24px}header{border-bottom:1px solid #dedbe8;margin-bottom:24px;padding-bottom:18px}header h1{font-size:26px;margin:0 0 8px}header p{font-size:13px;color:#777181;margin:4px 0}main{background:#fff;padding:26px;border:1px solid #e9e5f0;border-radius:14px;overflow-wrap:anywhere}img,svg,canvas{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%;width:100%;margin:16px 0}th,td{border:1px solid #e4dfed;padding:9px;text-align:left}h1,h2,h3,h4{break-after:avoid}section,figure,tr,img,svg{break-inside:avoid}p{orphans:3;widows:3}a{color:inherit;text-decoration:none}.report-snapshot-unavailable{font-size:13px;color:#777181}math{font-family:math,"Cambria Math",serif}details>summary{font-weight:700;list-style:none}@page{margin:15mm}@media print{html{background:white}body{max-width:none;margin:0;padding:0;font-size:11pt}main{border:0;border-radius:0;padding:0}header{margin-bottom:18px}header p{font-size:9pt}img,svg{max-width:100%!important}*{box-shadow:none!important}a{overflow-wrap:anywhere}}
</style></head><body><header><h1>${heading}</h1><p>报告快照 · 导出时间：${escapeReportText(now.toLocaleString("zh-CN", { hour12: false }))}</p><p>仅包含导出时已加载的报告内容。此文件可在浏览器打开并使用浏览器的“打印”功能；导出不会自动公开。</p></header><main>${sanitizedBody}</main></body></html>`;
}
