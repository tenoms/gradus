import { packetCatalogTree } from "./packet-catalog-model.mjs";

const statusLabels = {
  pending: "未开始",
  "in-progress": "进行中",
  grading: "待批阅",
  completed: "已完成",
};

function title(row) {
  return String(row?.Title || row?.Name || row?.ProductName || "");
}

function sourceSort(row) {
  const value = Number(row?.Sort);
  return row?.Sort == null || row.Sort === "" || !Number.isFinite(value) ? Infinity : value;
}

function assignment(row, index, moduleID, directTeacher) {
  const isTeacher = directTeacher ?? Number(row.BusValue) === 1;
  const student = row._c_paper_student;
  const stored = row._c_course_users_record ?? row._record;
  const records = Array.isArray(stored) ? stored : stored ? [stored] : [];
  const summary = records.find((record) =>
    record.BusRelationID != null && record.BusRelationID !== "" &&
    Number(record.BusRelationID) === 0 && Number(record.IsFinished) === 1);
  const status = isTeacher
    ? Number(student?.TeacherState) === 1 ? "completed"
      : Number(student?.StuState) === 1 ? "grading" : student ? "in-progress" : "pending"
    : summary ? "completed" : records.length ? "in-progress" : "pending";
  const score = isTeacher ? student?.Score : summary?.BusValue;
  const completedAt = isTeacher ? student?.UpdateTime || student?.EndTime : summary?.AddTime;
  return {
    id: String(row.ID ?? row.BusID ?? `${moduleID}:assignment:${index}`),
    title: String(row._c_paper?.Name || row._Paper?.Name || row.Title || row.Name || `作业 ${index + 1}`),
    row,
    status,
    statusLabel: statusLabels[status],
    isTeacher,
    ...(status === "completed" && score != null ? { score } : {}),
    ...(status === "completed" && completedAt ? { completedAt } : {}),
  };
}

function sameID(left, right) {
  return left != null && right != null && left !== "" && right !== "" && String(left) === String(right);
}

export function mergePacketAssignmentProgress(tasks, records, students, productID) {
  return tasks.map((task) => {
    const scopedProductID = task.ProductID ?? productID;
    const ordinary = (paperID) => records.filter((record) =>
      sameID(record.ProductID, scopedProductID) && sameID(record.CourseID, task.CourseID) &&
      sameID(record.CalendarID, task.CalendarID) && sameID(record.BusID, paperID) && Number(record.BusType) === 3);
    const teacher = (paperID) => students.find((student) =>
      sameID(student.ProductID, scopedProductID) && sameID(student.CourseID, task.CourseID) &&
      sameID(student.BusID, task.CalendarID) && sameID(student.PaperID, paperID)) || null;
    const direct = [3, 6].includes(Number(task.BusType));
    const paperID = Number(task.BusID) > 0 ? task.BusID : task.PaperID;
    const directTeacher = direct && Number(task.BusType) === 6;
    return {
      ...task,
      _record: direct && !directTeacher ? ordinary(paperID) : [],
      _c_course_users_record: null,
      _c_paper_student: directTeacher ? teacher(paperID) : null,
      _book_highscorealbum_catalog_content: (task._book_highscorealbum_catalog_content || []).map((row) => ({
        ...row,
        _record: [],
        _c_course_users_record: Number(row.BusValue) === 1 ? [] : ordinary(row.BusID),
        _c_paper_student: Number(row.BusValue) === 1 ? teacher(row.BusID) : null,
      })),
    };
  });
}

export function packetAssignmentGroups(tasks, treeRows, packetID) {
  const courses = new Map(), sourceOrder = new Map();
  let order = 0;
  function visit(nodes, parents = []) {
    for (const node of nodes) {
      const path = [...parents, node.row];
      sourceOrder.set(String(node.row.ID), order++);
      if (Number(node.row.CourseID || 0) !== 0) {
        const key = String(node.row.CourseID);
        const attached = String(path[0].PID) === String(packetID);
        const placement = { row: node.row, path, attached, order: sourceOrder.get(String(node.row.ID)) };
        if (!courses.has(key) || attached && !courses.get(key).attached) courses.set(key, placement);
      }
      visit(node.children, path);
    }
  }
  visit(packetCatalogTree(treeRows, packetID));

  const groups = new Map();
  tasks.forEach((task, index) => {
    const placement = courses.get(String(task.CourseID));
    const path = placement?.path || [];
    const attached = path.length > 1 && String(path[0].PID) === String(packetID);
    const subject = attached ? path[0] : undefined;
    const ancestors = attached ? path.slice(1, -1) : [];
    const chapter = ancestors.at(-1);
    const groupID = subject ? String(subject.ID) : "other";
    const chapterID = chapter ? String(chapter.ID) : `${groupID}:unclassified`;
    if (!groups.has(groupID)) groups.set(groupID, {
      id: groupID,
      title: subject ? title(subject) : "其他作业",
      chapters: new Map(),
      order: subject ? sourceOrder.get(String(subject.ID)) : Infinity,
    });
    const group = groups.get(groupID);
    if (!group.chapters.has(chapterID)) group.chapters.set(chapterID, {
      id: chapterID,
      title: chapter ? ancestors.map(title).filter(Boolean).join(" / ") : "未分章",
      modules: [],
      order: chapter ? sourceOrder.get(String(chapter.ID)) : Infinity,
    });
    const moduleID = String(task.ID ?? `task:${index}`);
    const direct = [3, 6].includes(Number(task.BusType)) && Number(task.BusID || task.PaperID) > 0;
    const content = direct ? [task] : [...(task._book_highscorealbum_catalog_content || [])]
      .filter((row) => row.Type === "作业" && row.BusType === "试卷" && Number(row.BusID) > 0)
      .sort((a, b) => sourceSort(a) === sourceSort(b) ? 0 : sourceSort(a) - sourceSort(b));
    group.chapters.get(chapterID).modules.push({
      id: moduleID,
      title: title(placement?.row) || title(task._book_highscorealbum) || title(task) || `学习模块 ${index + 1}`,
      task,
      assignments: content.map((row, assignmentIndex) => assignment(row, assignmentIndex, moduleID, direct ? Number(task.BusType) === 6 : undefined)),
      order: placement?.order ?? Infinity,
      sort: sourceSort(task),
    });
  });

  const ordered = (a, b) => a.order === b.order ? 0 : a.order - b.order;
  return [...groups.values()].sort(ordered).map((group) => ({
    id: group.id,
    title: group.title,
    chapters: [...group.chapters.values()].sort(ordered).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      modules: chapter.modules.sort((a, b) => ordered(a, b) || (a.sort === b.sort ? 0 : a.sort - b.sort))
        .map(({ order: _order, sort: _sort, ...module }) => module),
    })),
  }));
}
