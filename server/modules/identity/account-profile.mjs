import { ApiError } from '../../infrastructure/api-error.mjs';
import { preparationStatuses, reviewMonths, validateAccountProfile } from '../../../shared/account-profile.mjs';

const string = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

/** Personal details belong to the Web principal and never require a YYB source. */
export function createAccountProfileStore({ database, identities, privatePlatform }) {
  async function read(userId) {
    const user = await identities.user(userId);
    if (!user) throw new ApiError('未找到该用户', 404);
    const account = await privatePlatform.profile(userId, 'math', { ID: userId, StuID: userId }, user.displayName);
    const details = await privatePlatform.list(userId, 'math', 'sys_users_info');
    const study = await identities.studyData(userId);
    const info = details[0] || {};
    const profile = {
      nickname: user.displayName,
      avatar: string(account.HeadImg),
      examYear: string(info.Score2),
      province: string(info.Province),
      major: string(info.CourseName),
      preparationStatus: preparationStatuses.includes(info.IsWorkStudy) ? info.IsWorkStudy : '',
      reviewMonth: reviewMonths.includes(info.GoOverTime) ? info.GoOverTime : '',
    };
    const mathPlan = study.data.mathPlan || {
      subject: ['数一', '数二', '数三'].includes(account.SubjectType) ? account.SubjectType : '数一',
      stage: '基础',
    };
    return { user, profile, mathPlan };
  }
  async function save(userId, input) {
    const value = validateAccountProfile(input);
    return database.transaction(async () => {
      const user = await identities.updateOwnDisplayName(userId, value.nickname);
      await privatePlatform.saveAccountProfile(userId, {
        UserNick: value.nickname, HeadImg: value.avatar,
      }, {
        Score2: value.examYear, Province: value.province, CourseName: value.major,
        IsWorkStudy: value.preparationStatus, GoOverTime: value.reviewMonth,
      });
      await identities.audit(user, 'user.profile_updated', user);
      return (await read(userId)).profile;
    });
  }
  return { read, save };
}
