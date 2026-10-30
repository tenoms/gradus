function sorted(nodes) {
  return nodes.sort((left, right) => {
    const leftSort = Number(left.row.Sort), rightSort = Number(right.row.Sort);
    const a = left.row.Sort == null || left.row.Sort === "" || !Number.isFinite(leftSort) ? Infinity : leftSort;
    const b = right.row.Sort == null || right.row.Sort === "" || !Number.isFinite(rightSort) ? Infinity : rightSort;
    return a === b ? 0 : a - b;
  });
}

export function packetCatalogTree(rows, packetID) {
  const nodes = rows
    .filter((row) => String(row.ID) !== String(packetID))
    .map((row) => ({ row, children: [] }));
  const byID = new Map(nodes.map((node) => [String(node.row.ID), node]));
  const roots = [];
  for (const node of nodes) {
    const parent = byID.get(String(node.row.PID));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  sorted(roots);
  for (const node of nodes) sorted(node.children);
  return roots;
}

export function packetChapterRequestID(rows, selected) {
  const byID = new Map(rows.map((row) => [String(row.ID), row]));
  const path = [byID.get(String(selected.ID)) || selected];
  const visited = new Set([String(selected.ID)]);
  let parent = byID.get(String(path[0].PID));
  while (parent && !visited.has(String(parent.ID))) {
    path.push(parent);
    visited.add(String(parent.ID));
    parent = byID.get(String(parent.PID));
  }
  const top = path[path.length - 1];
  const packageRoot = top.Type === "课程包" || top.PID === "" || top.PID === 0 || top.PID === "0";
  return packageRoot && path.length > 1 ? path[path.length - 2].ID : top.ID;
}

function explicitlyInvalid(row) {
  return row.IsValid === 0 || typeof row.IsValid === "string" && row.IsValid.trim() !== "" && Number(row.IsValid) === 0;
}

export function packetCatalogChapters(rows, packetID) {
  const packageRow = rows.find((row) => String(row.ID) === String(packetID));
  if (packageRow && explicitlyInvalid(packageRow)) return [];
  function validNodes(nodes) {
    return nodes.filter((node) => !explicitlyInvalid(node.row)).map((node) => {
      const children = validNodes(node.children);
      const title = [node.row.Title, node.row.Name, node.row.ProductName].filter(Boolean).join(" ");
      return {
        row: { ...node.row, _searchText: [title, ...children.map((child) => child.row._searchText)].filter(Boolean).join(" ") },
        children,
      };
    });
  }
  function chapterNodes(nodes) {
    return nodes.filter((node) => Number(node.row.CourseID || 0) === 0).map((node) => ({
      row: node.row,
      children: chapterNodes(node.children),
    }));
  }
  const valid = validNodes(packetCatalogTree(rows, packetID));
  const chapters = chapterNodes(valid);
  return chapters.length ? chapters : valid;
}
