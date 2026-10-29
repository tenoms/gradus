import { mathCommand, mathRows } from "./math";

export async function resolveMathBookQrcode(qrcode: string) {
  return mathRows(await mathCommand("GetCourseQrcodeInfo", { qrcode }, true));
}
