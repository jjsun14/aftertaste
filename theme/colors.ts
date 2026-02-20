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

  // Tab bar
  tabBar: '#0D1424',
  tabBarBorder: '#1A2235',
  tabActive: '#FFFFFF',
  tabInactive: '#5A6577',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.5)',
  cardShadow: 'rgba(0, 0, 0, 0.3)',
};

// Get score badge color based on score value
export function getScoreColor(score: number): string {
  if (score >= 7.5) return Colors.ratingGreat;
  if (score >= 5.0) return Colors.ratingOkay;
  return Colors.ratingPoor;
}

export function getScoreBgColor(score: number): string {
  if (score >= 7.5) return Colors.scoreBgGreat;
  if (score >= 5.0) return Colors.scoreBgOkay;
  return Colors.scoreBgPoor;
}
