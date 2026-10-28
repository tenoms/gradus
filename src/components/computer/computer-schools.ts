import { computerRequest, records } from "../../platforms/computer";
import { schoolQuery, targetSchoolPayload } from "./school-model.mjs";
export const computerSchoolApi = {
  search: (filters: Record<string, any>, page = 1) =>
    computerRequest(
      "/api/exam/wx/school/cs/search",
      schoolQuery(filters, page),
    ),
  majors: (degree = "", name = "", page = 1) =>
    computerRequest("/api/exam/wx/school/major/list", {
      degreeType: degree,
      name,
      pageNum: page,
      pageSize: 20,
    }),
  detail: (id: string) =>
    computerRequest("/api/exam/wx/school/detail/" + encodeURIComponent(id)),
  plans: (id: string, year: string, page = 1) =>
    computerRequest("/api/exam/wx/school/plan/list", {
      schoolId: id,
      year,
      pageNum: page,
      pageSize: 20,
    }),
  permissions: () =>
    computerRequest("/api/user/wx/user/permission", { roleType: 2 }),
  targets: () => computerRequest("/api/user/wx/user/targetSchool"),
  targetCatalog: () =>
    computerRequest("/api/exam/wx/practice/school", {
      parentId: "701741873861103616",
    }),
  saveTargets: (ids: string[], schools: Record<string, any>[]) =>
    computerRequest(
      "/api/user/wx/user/addTargetSchool",
      targetSchoolPayload(ids, schools),
    ),
  async comparison(id: string, year: string) {
    const detail = await this.detail(id);
    let page = 1,
      plans: Record<string, any>[] = [];
    let next = true;
    while (next) {
      const response = await this.plans(id, year, page);
      const rows = records(response);
      plans.push(...rows);
      next = !!response?.hasNextPage && rows.length > 0;
      page++;
    }
    return { detail, plans };
  },
};
