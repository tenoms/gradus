const paths = new Set(['/api/exam/wx/course/get_play_info/v2','/api/exam/wx/course/vod/get_play_info']);

export const isCoursePlaybackRequest = (platform, request) => platform==='computer' && String(request.method || 'GET').toUpperCase()==='GET' && paths.has(request.path);

export function playbackUrl(response) {
  const body=response?.statusCode && response.data ? response.data : response;
  const data=body?.data ?? body;
  const url=Array.isArray(data) ? data[0]?.url : data?.mediaList?.[0]?.playURL || data?.url || data?.playUrl;
  return typeof url==='string' && /^https?:\/\//i.test(url) ? url : '';
}
