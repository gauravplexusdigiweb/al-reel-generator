import type {
  ReelDto,
  VideoDto,
  VideoStatusDto,
  TrimReelRequest,
  RegenerateReelRequest,
  CategoryDto,
  SocialAccountDto,
  SocialPostDto,
  InsightsDto,
  ReelAnalyticsDto,
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface ServicesHealth {
  aiService: boolean;
  ollama: boolean;
  degraded: boolean;
}

export interface UpdateReelBody {
  suggestedTitle?: string;
  tags?: string[];
  transcript?: { start: number; end: number; text: string }[];
}

export interface CreateReelBody {
  startSec: number;
  endSec: number;
  durationBucket?: number;
  aspectRatio?: string;
}

export interface EffectiveSettings {
  candidateMin: number;
  candidateMax: number;
  durationBuckets: number[];
  sampleFps: number;
  retainIntermediates: boolean;
  captionPreset: string;
  karaoke: boolean;
}

// Defined locally (not re-exported from @arg/shared) so the web client bundles no
// runtime code from the CommonJS shared package — Next's dev Fast-Refresh loader
// injects `import.meta` into workspace-symlinked files, which breaks CJS parsing.
export const ASPECT_RATIOS = ['9:16', '1:1', '4:5'] as const;

export const api = {
  // ---- Videos ----
  listVideos: (categoryId?: string) =>
    req<VideoDto[]>(`/videos${categoryId ? `?categoryId=${categoryId}` : ''}`),
  getVideo: (id: string) => req<VideoDto>(`/videos/${id}`),
  getStatus: (id: string) => req<VideoStatusDto>(`/videos/${id}/status`),
  deleteVideo: (id: string) => req<void>(`/videos/${id}`, { method: 'DELETE' }),
  retryVideo: (id: string) => req<VideoStatusDto>(`/videos/${id}/retry`, { method: 'POST', body: '{}' }),
  moveVideo: (id: string, categoryId: string | null) =>
    req<VideoDto>(`/videos/${id}`, { method: 'PATCH', body: JSON.stringify({ categoryId }) }),

  // ---- Reels ----
  getReels: (id: string) => req<ReelDto[]>(`/videos/${id}/reels`),
  deleteReel: (id: string) => req<void>(`/reels/${id}`, { method: 'DELETE' }),
  createReel: (videoId: string, body: CreateReelBody) =>
    req<ReelDto>(`/videos/${videoId}/reels`, { method: 'POST', body: JSON.stringify(body) }),
  exportZipUrl: (videoId: string, status?: string) =>
    `${API_BASE}/videos/${videoId}/reels/export.zip${status ? `?status=${status}` : ''}`,

  updateReel: (id: string, body: UpdateReelBody) =>
    req<ReelDto>(`/reels/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
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

  // ---- Categories ----
  getCategories: () => req<CategoryDto[]>('/categories'),
  createCategory: (body: { name: string; parentId?: string | null }) =>
    req<CategoryDto>('/categories', { method: 'POST', body: JSON.stringify(body) }),
  updateCategory: (id: string, body: { name?: string; sortOrder?: number; parentId?: string | null }) =>
    req<CategoryDto>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteCategory: (id: string) => req<void>(`/categories/${id}`, { method: 'DELETE' }),

  // ---- Publishing ----
  getAccounts: () => req<SocialAccountDto[]>('/publishing/accounts'),
  connectAccount: (
    platform: string,
    body: { accessToken: string; displayName?: string; refreshToken?: string; platformMeta?: Record<string, unknown> },
  ) => req<SocialAccountDto>(`/publishing/connect/${platform}`, { method: 'POST', body: JSON.stringify(body) }),
  deleteAccount: (id: string) => req<void>(`/publishing/accounts/${id}`, { method: 'DELETE' }),
  publishReel: (
    reelId: string,
    body: { accountIds: string[]; caption?: string; hashtags?: string[]; scheduledAt?: string },
  ) => req<SocialPostDto[]>(`/reels/${reelId}/social-publish`, { method: 'POST', body: JSON.stringify(body) }),
  getReelPosts: (reelId: string) => req<SocialPostDto[]>(`/reels/${reelId}/posts`),
  retryPost: (postId: string) => req<SocialPostDto>(`/posts/${postId}/retry`, { method: 'POST', body: '{}' }),
  deletePost: (postId: string) => req<void>(`/posts/${postId}`, { method: 'DELETE' }),

  // ---- Analytics ----
  getInsights: () => req<InsightsDto>('/analytics/insights'),
  refreshAnalytics: () => req<{ queued: boolean }>('/analytics/refresh', { method: 'POST', body: '{}' }),
  getReelAnalytics: (reelId: string) => req<ReelAnalyticsDto[]>(`/reels/${reelId}/analytics`),
  recordAnalytics: (reelId: string, body: Record<string, unknown>) =>
    req<ReelAnalyticsDto>(`/reels/${reelId}/analytics`, { method: 'POST', body: JSON.stringify(body) }),

  // ---- Settings ----
  getSettings: () => req<EffectiveSettings>('/settings'),
  updateSettings: (body: Partial<EffectiveSettings>) =>
    req<EffectiveSettings>('/settings', { method: 'PUT', body: JSON.stringify(body) }),

  // ---- Health ----
  servicesHealth: () => req<ServicesHealth>('/health/services'),
};

export interface UploadOpts {
  categoryId?: string;
  outputType?: 'reel' | 'teaser';
  adultThreshold?: number;
  teaserCount?: number;
  musicSource?: 'original' | 'custom' | 'none';
  captionsEnabled?: boolean;
  music?: File | null;
}

/** Upload with progress via XHR (fetch can't report upload progress reliably). */
export function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
  opts: UploadOpts = {},
): Promise<{ videoId: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (opts.categoryId) form.append('categoryId', opts.categoryId);
    if (opts.outputType) form.append('outputType', opts.outputType);
    if (opts.adultThreshold !== undefined) form.append('adultThreshold', String(opts.adultThreshold));
    if (opts.teaserCount !== undefined) form.append('teaserCount', String(opts.teaserCount));
    if (opts.musicSource) form.append('musicSource', opts.musicSource);
    if (opts.captionsEnabled !== undefined) form.append('captionsEnabled', String(opts.captionsEnabled));
    if (opts.music) form.append('music', opts.music);
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