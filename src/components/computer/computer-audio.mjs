const recordingFormats = [
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'mp4' },
  { mimeType: 'audio/mp4', extension: 'mp4' },
];
export function computerRecordingFormat(isTypeSupported) {
  return recordingFormats.find(({ mimeType }) => isTypeSupported(mimeType));
}
export async function prepareComputerAudioFile(file) {
  const extension = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (extension === 'mp3') {
    return new File([file], file.name.replace(/\.mp3$/i, '.mp3'), {
      type: 'audio/mpeg', lastModified: file.lastModified,
    });
  }
  if (extension === 'mp4' || extension === 'm4a') {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (String.fromCharCode(...header.slice(4, 8)) !== 'ftyp') {
      throw new Error('这个文件不是有效的 MP4 音频，请选择 MP3 或 MP4 录音文件。');
    }
    // The upstream recognizes .mp4, but returns a null URL for the same container named .m4a.
    return new File([file], file.name.replace(/\.(mp4|m4a)$/i, '.mp4'), {
      type: 'audio/mp4', lastModified: file.lastModified,
    });
  }
  throw new Error('平台暂不支持这种录音格式，请选择 MP3、MP4 或 M4A 录音文件。');
}
