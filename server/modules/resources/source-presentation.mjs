const platformName = value => value === 'math' ? '考研数学' : '计算机 408';
const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
const iso = value => value instanceof Date ? value.toISOString() : value;

/** Use saved provenance only; opening the resource directory never contacts YYB. */
export function presentResourceSources(rows) {
  const sources = rows.map(row => {
    const metadata = row.metadata || {};
    const scope = metadata.scope || (row.account_ref ? 'account' : 'public');
    const nickname = text(metadata.nickname) || text(metadata.displayName) || text(metadata.accountName);
    const category = scope === 'public' ? '公共资源' : scope === 'volatile' ? '短效资源' : '账号资源';
    const baseLabel = `${platformName(row.platform)} · ${nickname || category}`;
    return { row, baseLabel, scope };
  });
  const groups = new Map();
  for (const source of sources) {
    const group = groups.get(source.baseLabel) || [];
    group.push(source.row.id);
    groups.set(source.baseLabel, group);
  }
  for (const ids of groups.values()) ids.sort();
  return sources.map(({ row, baseLabel, scope }) => {
    const ids = groups.get(baseLabel);
    return {
      id: row.id, platform: row.platform, accountRef: row.account_ref, scope,
      label: ids.length > 1 ? `${baseLabel} · 来源 ${ids.indexOf(row.id) + 1}` : baseLabel,
      createdAt: iso(row.created_at), lastSeenAt: iso(row.last_seen_at),
      ...(row.count !== undefined ? { count: Number(row.count) } : {}),
    };
  });
}
