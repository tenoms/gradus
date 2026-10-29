import { mathCommand, mathRows } from "../api/math";

export async function resolveMathBookQrcode(qrcode: string) {
  return mathRows(await mathCommand("GetCourseQrcodeInfo", { qrcode }, true));
}
