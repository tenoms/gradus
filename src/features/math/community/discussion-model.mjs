export function discussionTree(rows, rootId) {
  const copies = rows.map((r) => ({ ...r, children: [] }));
  const byId = new Map(copies.map((r) => [String(r.ID), r]));
  const roots = [];
  for (const row of copies) {
    const parent = byId.get(String(row.PID));
    if (String(row.PID) === String(rootId) || !parent) roots.push(row);
    else parent.children.push(row);
  }
  return roots;
}
