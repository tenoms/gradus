type Row = Record<string, any>;

export function mathUpdateListQuery(stuid: string) {
  // The live All response omits log joins; Page returns the source read/vote
  // records needed to show and toggle the current user's state.
  return {
    path: "/api/content_list/GetListByPage",
    query: {
      System_Station_ID: 1,
      StuID: stuid,
      IsValid: 1,
      BusType: "小程序版本更新",
      Title: "小程序版本更新通知",
      SortDesc: "Sort Desc",
      page: 1,
      limit: 1000,
    },
  };
}

export function mathOwnUpdateLogs(row: Row, stuid: string): Row[] {
  return Array.isArray(row._content_list_log)
    ? row._content_list_log.filter(
        (log: Row) =>
          String(log.CID) === String(row.ID) &&
          String(log.BusValue) === String(stuid) &&
          Number(log.BusID) === 1,
      )
    : [];
}
