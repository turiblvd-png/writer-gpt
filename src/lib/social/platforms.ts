/** Platform limits, safe to import from client components. */
export const PLATFORMS = {
  linkedin: { label: 'LinkedIn', limit: 3000, hashtags: 3 },
  x: { label: 'X thread', limit: 280, hashtags: 2 },
  facebook: { label: 'Facebook', limit: 2000, hashtags: 2 },
  instagram: { label: 'Instagram', limit: 2200, hashtags: 12 },
} as const;

export type Platform = keyof typeof PLATFORMS;
