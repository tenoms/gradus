const endpoint = (value, field) => {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error(`公开配置 ${field} 必须为完整 HTTP 或 HTTPS 地址`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error(`公开配置 ${field} 只允许不含凭据、查询或片段的 HTTP 或 HTTPS 地址`);
  return url.href;
};

/** Only these deployment values may be sent to a browser. */
export function readBrowserConfig({ env = process.env } = {}) {
  const printStationId = Number(env.MATH_PRINT_STATION_ID || 1);
  if (!Number.isSafeInteger(printStationId) || printStationId < 1)
    throw new Error('公开配置 MATH_PRINT_STATION_ID 必须为正整数');
  return {
    math: { externalUrl: endpoint(env.MATH_EXTERNAL_URL, 'MATH_EXTERNAL_URL'), printStationId },
  };
}
