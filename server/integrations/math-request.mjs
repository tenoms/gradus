import { ApiError } from '../infrastructure/api-error.mjs';

/** The server's configured station belongs to the transport parameters, never the browser. */
export function withMathStation(input, stationId) {
  if (!Number.isSafeInteger(stationId) || stationId < 1) throw new ApiError('数学站点未配置', 503);
  const data = { ...input.data }, query = { ...input.query };
  const method = String(input.method || 'GET').toUpperCase();
  delete data.System_Station_ID;
  delete query.System_Station_ID;
  if (data.command) {
    const encoded = typeof data.data === 'string';
    let parameters;
    try { parameters = encoded ? JSON.parse(data.data) : data.data || {}; }
    catch { throw new ApiError('数学查询参数不是有效的 JSON', 400); }
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new ApiError('数学查询参数必须为对象', 400);
    parameters = { ...parameters, System_Station_ID: stationId };
    data.data = encoded ? JSON.stringify(parameters) : parameters;
  } else if (['GET', 'HEAD'].includes(method)) query.System_Station_ID = stationId;
  else data.System_Station_ID = stationId;
  for (const field of ['Content', 'content']) {
    if (!Object.hasOwn(data, field)) continue;
    const encoded = typeof data[field] === 'string';
    let rows;
    try { rows = encoded ? JSON.parse(data[field]) : data[field]; } catch { continue; }
    if (!Array.isArray(rows)) continue;
    rows = rows.map(row => row && typeof row === 'object' && !Array.isArray(row) ? { ...row, System_Station_ID: stationId } : row);
    data[field] = encoded ? JSON.stringify(rows) : rows;
  }
  return { ...input, data, query };
}
