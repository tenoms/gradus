export const mathProfileSubjects = ["数一", "数二", "数三"];
export const mathPreparationStatuses = ["在职", "应届", "脱产"];
export const mathReviewMonths = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (value, max, label, required = false) => {
  if (typeof value !== "string" || value.length > max || required && !value.trim()) fail(`${label}格式不正确`);
  return value.trim();
};

export function validateMathProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("个人资料格式不正确");
  const nickname = text(input.nickname, 80, "昵称", true);
  const subject = text(input.subject, 10, "数学类别", true);
  if (!mathProfileSubjects.includes(subject)) fail("数学类别不正确");
  const avatar = text(input.avatar ?? "", 256 * 1024, "头像");
  if (avatar && !/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(avatar)) {
    let url;
    try { url = new URL(avatar); } catch { fail("头像格式不正确"); }
    if (avatar.length > 4096 || !["http:", "https:"].includes(url.protocol) || !url.hostname) fail("头像格式不正确");
  }
  const examYear = text(input.examYear ?? "", 10, "考研年份");
  if (examYear && examYear !== "其他" && !/^[12]\d{3}$/.test(examYear)) fail("考研年份不正确");
  const province = text(input.province ?? "", 100, "所在省份");
  const major = text(input.major ?? "", 100, "报考专业");
  const preparationStatus = text(input.preparationStatus ?? "", 20, "备考状态");
  if (preparationStatus && !mathPreparationStatuses.includes(preparationStatus)) fail("备考状态不正确");
  const reviewMonth = text(input.reviewMonth ?? "", 10, "开始复习月份");
  if (reviewMonth && !mathReviewMonths.includes(reviewMonth)) fail("开始复习月份不正确");
  return { nickname, avatar, subject, examYear, province, major, preparationStatus, reviewMonth };
}
