import { mathGet, mathRows } from "../api/math";
import { courseApi } from "./math-courses";
import { mergePacketAssignmentProgress } from "./packet-assignment-model.mjs";

export async function loadPacketAssignments(stuid: string, packetID: number | string, productID: number | string) {
  const [content, records, students] = await Promise.all([
    courseApi.assignments(stuid, packetID, productID),
    courseApi.records({ StuID: stuid, ProductID: productID, BusType: 3 }),
    mathGet("/api/c_paper_student/GetListByAll", { StuID: stuid, ProductID: productID }),
  ]);
  return { data: mergePacketAssignmentProgress(mathRows(content), mathRows(records), mathRows(students), productID) };
}
