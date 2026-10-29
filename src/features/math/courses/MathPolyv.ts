// Protected playback requires a playsafe credential supplied by the content owner.
import { publicConfig } from "../../../shared/config/public.mjs";
let sdkPromise: Promise<void> | undefined;
export function loadMathPolyvSDK(): Promise<void> {
  if (!(window as any).polyvPlayer && !publicConfig.media.polyvSdkUrl)
    return Promise.reject(new Error("当前未配置录播播放器，暂时无法播放此视频。"));
  return (sdkPromise ||= new Promise<void>((resolve, reject) => {
    if ((window as any).polyvPlayer) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = publicConfig.media.polyvSdkUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = undefined;
      reject(new Error("录播播放器加载失败，请检查网络后重试。"));
    };
    document.head.append(script);
  }));
}
