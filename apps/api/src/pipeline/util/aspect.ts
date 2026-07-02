export interface Dims {
  w: number;
  h: number;
}

/** Supported export aspect ratios (all 1080 wide). */
export const ASPECTS: Record<string, Dims> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
};

export function aspectDims(ratio?: string | null): Dims {
  return ASPECTS[ratio ?? '9:16'] ?? ASPECTS['9:16'];
}
