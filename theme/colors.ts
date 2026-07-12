export const Colors = {
  // Backgrounds
  background: '#0B1120',
  surface: '#141B2D',
  surfaceLight: '#1A2332',
  surfaceBorder: '#1E293B',
  surfaceBorderLight: '#2A3A4E',

  // Primary accent (teal/mint) — #01D9AE
  primary: '#01D9AE',
  primaryDim: '#01A584',
  primaryBg: 'rgba(1, 217, 174, 0.12)',

  // Purple accent — #4D48DA
  purple: '#4D48DA',
  purpleBg: 'rgba(77, 72, 218, 0.15)',

  // Blue accent — #1A63B5
  blue: '#1A63B5',
  blueBg: 'rgba(26, 99, 181, 0.2)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#8B95A5',
  textMuted: '#5A6577',

  // Ratings
  ratingGreat: '#01D9AE',
  ratingOkay: '#F5C518',
  ratingPoor: '#EF4444',

  // Score badge backgrounds (with opacity)
  scoreBgGreat: 'rgba(1, 217, 174, 0.9)',
  scoreBgOkay: 'rgba(245, 197, 24, 0.9)',
  scoreBgPoor: 'rgba(239, 68, 68, 0.9)',

  // Tags
  tagOccasion: '#7C3AED',
  tagOccasionBg: 'rgba(124, 58, 237, 0.2)',
  tagEatery: '#1A63B5',
  tagEateryBg: 'rgba(26, 99, 181, 0.2)',
  tagMood: '#3B82F6',
  tagMoodBg: 'rgba(59, 130, 246, 0.2)',

  // Tab bar — neutral dark to blend with map's dark-v11 style
  tabBar: '#0A0E17',
  tabBarBorder: '#151B28',
  tabActive: '#FFFFFF',
  tabInactive: '#5A6577',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
  cardShadow: 'rgba(0, 0, 0, 0.3)',
};

// Score color thresholds match the tier system (Great >= 7.0, Okay >= 4.0).
// Keeping them in sync ensures the badge colour reflects the actual ranking tier.
export function getScoreColor(score: number): string {
  if (score >= 7.0) return Colors.ratingGreat;
  if (score >= 4.0) return Colors.ratingOkay;
  return Colors.ratingPoor;
}

export function getScoreBgColor(score: number): string {
  if (score >= 7.0) return Colors.scoreBgGreat;
  if (score >= 4.0) return Colors.scoreBgOkay;
  return Colors.scoreBgPoor;
}

// Curated avatar palette — looks good on dark backgrounds with white text
const AVATAR_COLORS = [
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#EC4899', // pink
  '#F43F5E', // rose
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#0EA5E9', // sky
  '#3B82F6', // blue
];

/** Deterministic avatar color from any string (user ID, name, etc.) */
export function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
