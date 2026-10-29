export type RelatedRow = Record<string, any>;
export function relatedResetPayload(id: string | number) {
  return {
    ID: id,
    State: 0,
    IsSubmit: 0,
    MyAnswer: "",
    ActiveOptionIDs: [],
    Notes: 0,
    IsNew: 1,
    UpdateColumns: "ID,State,IsSubmit,MyAnswer,ActiveOptionIDs,Notes,IsNew",
  };
}
export function relatedProperties(
  row: RelatedRow,
): { PropertyID: string; PropertyContentID: string }[] {
  try {
    let value = row.json_data;
    if (typeof value === "string") value = JSON.parse(value);
    return (value?.data || row.Propertydata || []).map((v: RelatedRow) => ({
      PropertyID: String(v.PropertyID),
      PropertyContentID: String(v.PropertyContentID),
    }));
  } catch {
    return [];
  }
}
export function relatedPropertyGroups(rows: RelatedRow[]) {
  const groups = new Map<
    string,
    { id: string; name: string; rows: RelatedRow[] }
  >();
  for (const row of rows) {
    const id = String(row.PropertyID);
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: String(row.PropertyName || "分类"),
        rows: [],
      });
    groups.get(id)!.rows.push(row);
  }
  return [...groups.values()];
}
export function isRelatedSubjectScope(row: RelatedRow) {
  return /科目范围|适用科目/.test(String(row.PropertyName || ""));
}
export function matchesRelatedSubject(row: RelatedRow, subject: string, definitions: RelatedRow[]) {
  const scopeDefinitions = definitions.filter(isRelatedSubjectScope);
  const actual = relatedProperties(row).flatMap(property => {
    const definition = scopeDefinitions.find(item => String(item.ID) === property.PropertyContentID && String(item.PropertyID) === property.PropertyID);
    return definition ? [String(definition.Name || "")] : [];
  });
  // Unlabelled questions remain available; only explicit exclusions are hidden.
  return !actual.length || actual.some(name => /公共|通用|全部/.test(name) || name.includes(subject));
}
export function matchesRelatedProperties(
  row: RelatedRow,
  selected: Record<string, string[]>,
  definitions: RelatedRow[],
): boolean {
  const properties = relatedProperties(row);
  const descendants = (id: string): string[] => [
    id,
    ...definitions
      .filter((d) => String(d.PID) === id && String(d.ID) !== id)
      .flatMap((d) => descendants(String(d.ID))),
  ];
  return Object.entries(selected).every(
    ([propertyId, ids]) =>
      !ids.length ||
      ids.some((id) =>
        properties.some(
          (p) =>
            p.PropertyID === propertyId &&
            descendants(id).includes(p.PropertyContentID),
        ),
      ),
  );
}
export function relatedGradeState(
  options: RelatedRow[],
  answer: string,
  correct: boolean,
) {
  if (correct) return 1;
  const expected = options
    .filter((o) => Number(o.IsAnswer) === 1)
    .map((o) => String(o.ID));
  const mine = answer.split(",").filter(Boolean);
  return expected.length > 1 &&
    mine.length > 0 &&
    mine.length < expected.length &&
    mine.every((id) => expected.includes(id))
    ? 2
    : 3;
}
