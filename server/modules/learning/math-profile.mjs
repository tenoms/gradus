import { ApiError } from '../../infrastructure/api-error.mjs';
import { mathProfileSubjects, mathPreparationStatuses, mathReviewMonths, validateMathProfile } from '../../../shared/math-profile.mjs';

const string = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

/** Personal details belong to the Web principal and never require a YYB source. */
export function createMathProfileStore({ database, identities, privatePlatform }) {
  async function read(userId) {
    const user = await identities.user(userId);
    if (!user) throw new ApiError('未找到该用户', 404);
    const account = await privatePlatform.profile(userId, 'math', { ID: userId, StuID: userId }, user.displayName);
    const details = await privatePlatform.list(userId, 'math', 'sys_users_info');
    const study = await identities.studyData(userId);
    const info = details[0] || {};
    const subject = study.data.mathPlan?.subject || account.SubjectType;
    const profile = {
      nickname: user.displayName,
      avatar: string(account.HeadImg),
      subject: mathProfileSubjects.includes(subject) ? subject : '数一',
      examYear: string(info.Score2),
      province: string(info.Province),
      major: string(info.CourseName),
      preparationStatus: mathPreparationStatuses.includes(info.IsWorkStudy) ? info.IsWorkStudy : '',
      reviewMonth: mathReviewMonths.includes(info.GoOverTime) ? info.GoOverTime : '',
    };
    return { user, profile };
  }
  async function save(userId, input) {
    const value = validateMathProfile(input);
    return database.transaction(async () => {
      const user = await identities.updateOwnDisplayName(userId, value.nickname);
      await privatePlatform.saveMathProfile(userId, {
        UserNick: value.nickname, HeadImg: value.avatar, SubjectType: value.subject,
      }, {
        Score2: value.examYear, Province: value.province, CourseName: value.major,
        IsWorkStudy: value.preparationStatus, GoOverTime: value.reviewMonth,
      });
      const study = await identities.studyData(userId);
      await identities.saveStudyData(userId, { ...study.data, mathPlan: {
        subject: value.subject, stage: study.data.mathPlan?.stage || '基础',
      } }, study.revision);
      await identities.audit(user, 'user.profile_updated', user);
      return (await read(userId)).profile;
    });
  }
  return { read, save };
}
