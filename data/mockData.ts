// ─── Types ────────────────────────────────────────────────────────
export type RatingLevel = 'Great' | 'Okay' | 'Poor';

export type OccasionTag =
  | 'Regular Meal'
  | 'Date Night'
  | 'Drinks'
  | 'Friends Meal'
  | 'Family Meal';

export type MoodTag =
  | 'Comforting'
  | 'Craving'
  | 'Nostalgic'
  | 'Adventurous'
  | 'Calm'
  | 'Perfect';

export type EateryType = 'Restaurant' | 'Fast Casual' | 'Cafe' | 'Bakery' | 'Bar' | 'Fine Dining' | 'Dessert';

export interface SquadMember {
  id: string;
  name: string;
  avatar: string; // placeholder URL
  profile_id?: string; // links to real app user (if they're on the app)
}

// ─── Friend types ─────────────────────────────────────────────────
export interface FriendProfile {
  id: string;          // friendship row id
  profileId: string;   // user's profile UUID
  displayName: string;
  username: string | null;
  firstName: string;
  lastName: string;
  friendCode: string;
}

export interface FriendActivity {
  restaurantName: string;
  city: string;
  date: string;
  eventType: 'new_memory' | 'return_visit';
  userDisplayName: string;
  userId: string;
  createdAt: string;
}

export interface Visit {
  id: string;
  date: string;           // ISO date
  whatIHad: string[];
  photo?: string;         // single URL
  note?: string;
  tasteRating?: RatingLevel;
  vibeRating?: RatingLevel;
  valueRating?: RatingLevel;
  tasteScore?: number;
  vibeScore?: number;
  valueScore?: number;
  compositeScore?: number;
}

export interface Memory {
  id: string;
  restaurantName: string;
  priceTier: '$' | '$$' | '$$$' | '$$$$';
  eateryType: EateryType;
  cuisineType: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  date: string; // ISO date
  photos: string[];
  whatIHad: string[];
  occasionTag: OccasionTag;
  moodTag: MoodTag;
  tasteRating: RatingLevel;
  vibeRating: RatingLevel;
  valueRating: RatingLevel;
  tasteScore: number;   // 0-10
  vibeScore: number;    // 0-10
  valueScore: number;   // 0-10
  compositeScore: number; // weighted: taste 50% + value 25% + vibe 25%
  eatAgain: boolean;
  squad: SquadMember[];
  memoryNote: string;
  isFavorite: boolean;
  visits: Visit[];       // return visits (lightweight check-ins)
  photoDates?: Record<string, string>;  // photo URL → ISO date for carousel date labels
  tiedGroupId?: string | null;  // memories sharing this id always get the same compositeScore
  fsqPlaceId?: string | null;   // exact Foursquare place id (dedupe, chain detection)
}

export interface WantToTryEntry {
  id: string;
  restaurantName: string;
  priceTier: '$' | '$$' | '$$$' | '$$$$';
  eateryType: EateryType;
  cuisineType: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  fsqPlaceId?: string | null;   // exact Foursquare place id (dedupe, chain detection)
}

// ─── Score preference ─────────────────────────────────────────────
// User picks one at sign-up; locked after that. Determines how the three
// rating dimensions blend into the raw composite (which then sets tier).
export type ScorePreference = 'food_first' | 'full_picture';

export const SCORE_WEIGHTS: Record<ScorePreference, { taste: number; vibe: number; value: number }> = {
  food_first:   { taste: 0.5, vibe: 0.25, value: 0.25 },
  full_picture: { taste: 0.4, vibe: 0.3,  value: 0.3  },
};

export const DEFAULT_SCORE_PREFERENCE: ScorePreference = 'food_first';

// ─── Helpers ──────────────────────────────────────────────────────
export function computeComposite(
  taste: number,
  vibe: number,
  value: number,
  preference: ScorePreference = DEFAULT_SCORE_PREFERENCE,
): number {
  const w = SCORE_WEIGHTS[preference];
  return Math.round((taste * w.taste + vibe * w.vibe + value * w.value) * 10) / 10;
}

export function ratingToScore(rating: RatingLevel): number {
  if (rating === 'Great') return 8.5;
  if (rating === 'Okay') return 6.0;
  return 3.5;
}

// ─── Tier-based ranking system ────────────────────────────────────
// Five tiers chosen to keep peer pools cohesive at lifetime scale.
// Note: raw composite formula maxes at 8.5 (G/G/G), so the Elite range
// (8.5–10) is only reachable through redistribution against peers.
export type Tier = 'Elite' | 'Great' | 'Solid' | 'Mid' | 'Bad';

export const TIER_RANGES: Record<Tier, { min: number; max: number }> = {
  Elite: { min: 8.5, max: 10.0 },
  Great: { min: 7.0, max: 8.4 },
  Solid: { min: 5.5, max: 6.9 },
  Mid:   { min: 4.0, max: 5.4 },
  Bad:   { min: 0.0, max: 3.9 },
};

export function determineTier(composite: number): Tier {
  if (composite >= 8.5) return 'Elite';
  if (composite >= 7.0) return 'Great';
  if (composite >= 5.5) return 'Solid';
  if (composite >= 4.0) return 'Mid';
  return 'Bad';
}

/**
 * Given a ranked list (ascending: worst → best within the tier),
 * distribute scores evenly across the tier's range via linear interpolation.
 *
 * Members sharing a `tiedGroupId` are collapsed into a single rank slot and
 * receive the same score, so "Too Close" ties stay tied across redistributions.
 *
 * Accepts either a plain string[] (legacy: all untied) or richer items with
 * tiedGroupId — both shapes are supported so existing callers keep working.
 */
export function recalculateTierScores(
  ranked: string[] | { id: string; tiedGroupId?: string | null }[],
  tier: Tier,
): { id: string; compositeScore: number }[] {
  const items: { id: string; tiedGroupId?: string | null }[] =
    ranked.length === 0
      ? []
      : typeof ranked[0] === 'string'
        ? (ranked as string[]).map((id) => ({ id }))
        : (ranked as { id: string; tiedGroupId?: string | null }[]);

  const { min, max } = TIER_RANGES[tier];
  if (items.length === 0) return [];

  // Build slots — each unique tiedGroupId is one slot; untied items are their own slot.
  const slots: string[][] = [];
  const groupKeyToSlot = new Map<string, number>();
  for (const item of items) {
    const key = item.tiedGroupId ? `g:${item.tiedGroupId}` : `s:${item.id}`;
    let idx = groupKeyToSlot.get(key);
    if (idx === undefined) {
      idx = slots.length;
      slots.push([]);
      groupKeyToSlot.set(key, idx);
    }
    slots[idx].push(item.id);
  }

  const slotCount = slots.length;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const slotScore = (i: number) =>
    slotCount === 1
      ? round1((min + max) / 2)
      : round1(min + (i / (slotCount - 1)) * (max - min));

  const out: { id: string; compositeScore: number }[] = [];
  slots.forEach((memberIds, i) => {
    const score = slotScore(i);
    for (const id of memberIds) out.push({ id, compositeScore: score });
  });
  return out;
}

/** Generate a v4-shaped UUID for use as a tied_group_id. */
export function newTiedGroupId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Occasion tag emoji map ────────────────────────────────────────
export const occasionEmojis: Record<OccasionTag, string> = {
  'Regular Meal': '🍽️',
  'Date Night': '💕',
  'Drinks': '🍷',
  'Friends Meal': '🍻',
  'Family Meal': '👨‍👩‍👧',
};

export const eateryEmojis: Record<EateryType, string> = {
  Restaurant: '🍴',
  'Fast Casual': '🥙',
  Cafe: '☕',
  Bakery: '🥐',
  Bar: '🍷',
  'Fine Dining': '🥂',
  Dessert: '🍰',
};



// ─── Search results (for Add Experience step 1) ──────────────────
export interface SearchResult {
  id: string;
  name: string;
  address: string;
  city?: string;          // from Foursquare locality field (structured, reliable)
  state?: string;         // from Foursquare region field
  distance: string;
  category: string;       // cuisine/category from Foursquare (e.g. "Italian", "Sushi", "Pizza")
  priceTier?: '$' | '$$' | '$$$' | '$$$$'; // from Foursquare price data (not always available)
  isVisited: boolean;
  isBookmarked: boolean;
  latitude?: number;
  longitude?: number;
}


// ─── Helper to get relative time ─────────────────────────────────
export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
