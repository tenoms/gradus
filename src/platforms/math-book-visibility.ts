type Row = Record<string, any>;
const course1149 = new Set([721, 813, 1121, 1163, 2378, 2384, 4996, 5015]);
const course2046 = new Set([4893, 4928, 4935]);
const examOnly = new Set([2170, 2172, 2173]);
export function mathVisibleBooks(
  rows: Row[],
  courseGrants: Row[],
  examAllocations: Row[],
): Row[] {
  const products = new Set(
    courseGrants.map((row) => Number(row.CourseProductID)),
  );
  return rows.filter((row) => {
    const id = Number(row.ID);
    return course1149.has(id)
      ? products.has(1149)
      : course2046.has(id)
        ? products.has(2046)
        : examOnly.has(id)
          ? examAllocations.length > 0
          : true;
  });
}
