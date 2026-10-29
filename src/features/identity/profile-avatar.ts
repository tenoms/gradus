export async function createProfileAvatar(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("请选择 PNG、JPEG 或 WebP 图片。");
  if (file.size > 10 * 1024 * 1024) throw new Error("请选择 10MB 以内的头像图片。");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法读取头像图片，请换一张重试。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const avatar = canvas.toDataURL("image/webp", 0.85);
    if (avatar.length > 256 * 1024) throw new Error("头像图片过大，请换一张重试。");
    return avatar;
  } finally { bitmap.close(); }
}
