export const PLATFORM_NAMES = [
  'rss',
  'facebook',
  'telegram',
  'tiktok',
  'threads',
  'reddit',
  'youtube',
  'instagram',
] as const;

export type PlatformName = (typeof PLATFORM_NAMES)[number];
// -> Type tu dong = 'rss' | 'facebook' | 'telegram' | 'tiktok' | 'threads' | 'reddit' | 'youtube' | 'instagram'
