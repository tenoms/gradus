import { mathCommand, mathPost } from "../../platforms/math";
import type { MathRow } from "../../platforms/math";
import { errorRecordQuery, errorVotePayload } from "./error-records-model.mjs";
export const mathErrorRecordsApi = {
  list: (qid: string | number, page = 0) =>
    mathCommand("GetQuestionErrorToQuestionID", errorRecordQuery(qid, page)),
  vote(row: MathRow, stuid: string, state: number) {
    const payload = errorVotePayload(row, stuid, state);
    return payload
      ? mathPost("/api/sys_give/Inner_sys_give", payload)
      : Promise.resolve(null);
  },
};
