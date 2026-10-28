// Official VOD SDK: https://help.polyv.net/vod/js/video_player/integration/
// Protected playback requires a playsafe credential supplied by the content owner.
let sdkPromise: Promise<void> | undefined;
export function loadMathPolyvSDK(): Promise<void> {
  return (sdkPromise ||= new Promise<void>((resolve, reject) => {
    if ((window as any).polyvPlayer) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://player.polyv.net/resp/vod-player/latest/player.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = undefined;
      reject(new Error("录播播放器加载失败，请检查网络后重试。"));
    };
    document.head.append(script);
  }));
}
