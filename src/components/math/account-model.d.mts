export function studyProfilePayload(
  form: Record<string, any>,
  stuid: string,
): Record<string, any>;
export function couponStatus(row: Record<string, any>, now?: number): string;
export function couponActivationPayload(
  row: Record<string, any>,
  stuid: string,
  now?: number,
): Record<string, any>;
export function canGiftCoupon(row: Record<string, any>, now?: number): boolean;
