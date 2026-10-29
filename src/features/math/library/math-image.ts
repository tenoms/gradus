export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function normalizedCrop(
  start: { x: number; y: number },
  end: { x: number; y: number },
): CropBox {
  const x = Math.max(0, Math.min(1, Math.min(start.x, end.x))),
    y = Math.max(0, Math.min(1, Math.min(start.y, end.y)));
  return {
    x,
    y,
    width: Math.max(0.001, Math.min(1 - x, Math.abs(end.x - start.x))),
    height: Math.max(0.001, Math.min(1 - y, Math.abs(end.y - start.y))),
  };
}
export function cropPixels(box: CropBox, width: number, height: number) {
  const x = Math.max(0, Math.min(width - 1, Math.round(box.x * width))),
    y = Math.max(0, Math.min(height - 1, Math.round(box.y * height)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(box.width * width))),
    height: Math.max(1, Math.min(height - y, Math.round(box.height * height))),
  };
}
export async function cropImageFile(
  file: File,
  box: CropBox,
  rotation = 0,
): Promise<File> {
  const image = await createImageBitmap(file);
  const rotated = document.createElement("canvas");
  const quarter = ((rotation % 360) + 360) % 360;
  const swapped = quarter === 90 || quarter === 270;
  rotated.width = swapped ? image.height : image.width;
  rotated.height = swapped ? image.width : image.height;
  const ctx = rotated.getContext("2d");
  if (!ctx) {
    image.close();
    throw new Error("当前浏览器无法裁切图片");
  }
  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate((quarter * Math.PI) / 180);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  image.close();
  const pixels = cropPixels(box, rotated.width, rotated.height);
  const output = document.createElement("canvas");
  output.width = pixels.width;
  output.height = pixels.height;
  const crop = output.getContext("2d");
  if (!crop) throw new Error("当前浏览器无法裁切图片");
  crop.drawImage(
    rotated,
    pixels.x,
    pixels.y,
    pixels.width,
    pixels.height,
    0,
    0,
    pixels.width,
    pixels.height,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("图片裁切失败，请重新选择图片")),
      "image/jpeg",
      0.94,
    ),
  );
  return new File([blob], `math-question-${Date.now()}.jpg`, {
    type: blob.type,
  });
}
