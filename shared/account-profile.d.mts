export interface AccountProfile {
  nickname: string;
  avatar: string;
  examYear: string;
  province: string;
  major: string;
  preparationStatus: string;
  reviewMonth: string;
}
export const preparationStatuses: string[];
export const reviewMonths: string[];
export function validateAccountProfile(input: unknown): AccountProfile;
