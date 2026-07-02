import type {
  ReelDto,
  VideoDto,
  VideoStatusDto,
  TrimReelRequest,
  RegenerateReelRequest,
} from '@arg/shared';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

/** Prefix an API-relative media path (e.g. /files/...) with the API origin. */
export function mediaUrl(pathOrUrl: string | null): string | null {
  if (!pathOrUrl) return null;
  return pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listVideos: () => req<VideoDto[]>('/videos'),
  getVideo: (id: string) => req<VideoDto>(`/videos/${id}`),
  getStatus: (id: string) => req<VideoStatusDto>(`/videos/${id}/status`),
  getReels: (id: string) => req<ReelDto[]>(`/videos/${id}/reels`),

  approve: (id: string) => req<ReelDto>(`/reels/${id}/approve`, { method: 'POST', body: '{}' }),
  reject: (id: string) => req<ReelDto>(`/reels/${id}/reject`, { method: 'POST', body: '{}' }),
  publish: (id: string) => req<ReelDto>(`/reels/${id}/publish`, { method: 'POST', body: '{}' }),
  trim: (id: string, body: TrimReelRequest) =>
    req<ReelDto>(`/reels/${id}/trim`, { method: 'POST', body: JSON.stringify(body) }),
  regenerate: (id: string, body: RegenerateReelRequest) =>
    req<ReelDto>(`/reels/${id}/regenerate`, { method: 'POST', body: JSON.stringify(body) }),
  selectThumbnail: (id: string, thumbnailId: string) =>
    req<ReelDto>(`/reels/${id}/thumbnail`, { method: 'POST', body: JSON.stringify({ thumbnailId }) }),

  downloadUrl: (id: string) => `${API_BASE}/reels/${id}/download`,
};

/** Upload with progress via XHR (fetch can't report upload progress reliably). */
export function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ videoId: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/videos`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          msg = JSON.parse(xhr.responseText).message || msg;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}
