export interface MathProfile {
  nickname: string;
  avatar: string;
  subject: string;
  examYear: string;
  province: string;
  major: string;
  preparationStatus: string;
  reviewMonth: string;
}
export const mathProfileSubjects: string[];
export const mathPreparationStatuses: string[];
export const mathReviewMonths: string[];
export function validateMathProfile(input: unknown): MathProfile;
