// ─── Types ────────────────────────────────────────────────────────
export type RatingLevel = 'Great' | 'Okay' | 'Poor';

export type OccasionTag =
  | 'Quick Bite'
  | 'Date Night'
  | 'Drinks'
  | 'Travel'
  | 'Celebration'
  | 'Regular Meal'
  | 'Special Moment';

export type MoodTag =
  | 'Comforting'
  | 'Craving'
  | 'Nostalgic'
  | 'Adventurous'
  | 'Calm'
  | 'Perfect';

export type EateryType = 'Restaurant' | 'Bar' | 'Cafe' | 'Bakery' | 'Dessert';

export interface SquadMember {
  id: string;
  name: string;
  avatar: string; // placeholder URL
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
}

// ─── Helpers ──────────────────────────────────────────────────────
function computeComposite(taste: number, vibe: number, value: number): number {
  return Math.round((taste * 0.5 + vibe * 0.25 + value * 0.25) * 10) / 10;
}

// ─── Squad Members ────────────────────────────────────────────────
const squad: Record<string, SquadMember> = {
  keshav: { id: 's1', name: 'Keshav', avatar: 'https://i.pravatar.cc/100?img=11' },
  lulu: { id: 's2', name: 'Lulu', avatar: 'https://i.pravatar.cc/100?img=5' },
  marcus: { id: 's3', name: 'Marcus', avatar: 'https://i.pravatar.cc/100?img=12' },
  aria: { id: 's4', name: 'Aria', avatar: 'https://i.pravatar.cc/100?img=9' },
  jay: { id: 's5', name: 'Jay', avatar: 'https://i.pravatar.cc/100?img=3' },
};

// ─── Occasion tag emoji map ────────────────────────────────────────
export const occasionEmojis: Record<OccasionTag, string> = {
  'Quick Bite': '🏃',
  'Date Night': '💕',
  'Drinks': '🍻',
  'Travel': '🌍',
  'Celebration': '🎉',
  'Regular Meal': '🍽️',
  'Special Moment': '✨',
};

export const eateryEmojis: Record<EateryType, string> = {
  Restaurant: '🍴',
  Bar: '🍷',
  Cafe: '☕',
  Bakery: '🧁',
  Dessert: '🍰',
};

// ─── Mock Memories ────────────────────────────────────────────────
export const memories: Memory[] = [
  {
    id: '1',
    restaurantName: "Joe's Pizza",
    priceTier: '$',
    eateryType: 'Restaurant',
    cuisineType: 'Pizza Restaurant',
    address: '1435 Broadway, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7536,
    longitude: -73.9862,
    date: '2026-02-15',
    photos: [
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600',
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600',
    ],
    whatIHad: ['Pizza', 'Garlic Knots'],
    occasionTag: 'Quick Bite',
    moodTag: 'Craving',
    tasteRating: 'Great',
    vibeRating: 'Okay',
    valueRating: 'Great',
    tasteScore: 8.5,
    vibeScore: 7.0,
    valueScore: 9.0,
    compositeScore: computeComposite(8.5, 7.0, 9.0),
    eatAgain: true,
    squad: [squad.keshav, squad.jay],
    memoryNote:
      'Classic New York slice. The garlic knots were perfect — crispy outside, soft inside. Nothing fancy, just exactly what you want at 1am.',
    isFavorite: false,
  },
  {
    id: '2',
    restaurantName: "Fookem's Fabulous",
    priceTier: '$',
    eateryType: 'Bakery',
    cuisineType: 'Bakery',
    address: '3606 Grand Ave, Miami, FL',
    city: 'Miami',
    state: 'FL',
    latitude: 25.7617,
    longitude: -80.1918,
    date: '2026-01-01',
    photos: [
      'https://images.unsplash.com/photo-1519915028121-7d3463d20b13?w=600',
    ],
    whatIHad: ['Key Lime Pie', 'Key Lime Slushy'],
    occasionTag: 'Quick Bite',
    moodTag: 'Perfect',
    tasteRating: 'Great',
    vibeRating: 'Okay',
    valueRating: 'Okay',
    tasteScore: 9.8,
    vibeScore: 6.0,
    valueScore: 6.5,
    compositeScore: computeComposite(9.8, 6.0, 6.5),
    eatAgain: true,
    squad: [squad.keshav, squad.lulu, squad.marcus, squad.aria, squad.jay],
    memoryNote:
      "Went to a key lime pie bakery with friends and it was honestly the best key lime pie I have ever had. Perfect balance of tart and sweet, and the crust was really good too. We just sat around, talked, and shared slices. Simple day but one of those moments that sticks with you.",
    isFavorite: true,
  },
  {
    id: '3',
    restaurantName: 'Zuru Ramen',
    priceTier: '$$',
    eateryType: 'Restaurant',
    cuisineType: 'Ramen Restaurant',
    address: '2240 S University Dr, Davie, FL',
    city: 'Davie',
    state: 'FL',
    latitude: 26.0629,
    longitude: -80.2489,
    date: '2026-02-10',
    photos: [
      'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600',
      'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=600',
    ],
    whatIHad: ['Tonkotsu Ramen', 'Gyoza'],
    occasionTag: 'Regular Meal',
    moodTag: 'Comforting',
    tasteRating: 'Okay',
    vibeRating: 'Great',
    valueRating: 'Okay',
    tasteScore: 6.5,
    vibeScore: 8.0,
    valueScore: 6.0,
    compositeScore: computeComposite(6.5, 8.0, 6.0),
    eatAgain: true,
    squad: [squad.lulu],
    memoryNote:
      'Solid ramen spot. The broth was rich but could use a bit more depth. Vibes were great though — cozy and warm.',
    isFavorite: false,
  },
  {
    id: '4',
    restaurantName: "Culver's",
    priceTier: '$',
    eateryType: 'Restaurant',
    cuisineType: 'Fast Food Restaurant',
    address: '1900 S University Dr, Davie, FL',
    city: 'Davie',
    state: 'FL',
    latitude: 26.0665,
    longitude: -80.2490,
    date: '2026-02-08',
    photos: [
      'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600',
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
    ],
    whatIHad: ['ButterBurger', 'Cheese Curds', 'Concrete Mixer'],
    occasionTag: 'Quick Bite',
    moodTag: 'Craving',
    tasteRating: 'Great',
    vibeRating: 'Great',
    valueRating: 'Great',
    tasteScore: 9.0,
    vibeScore: 8.5,
    valueScore: 9.0,
    compositeScore: computeComposite(9.0, 8.5, 9.0),
    eatAgain: true,
    squad: [squad.marcus, squad.jay],
    memoryNote:
      'Culver\'s never misses. The ButterBurger is comfort food perfection and those cheese curds are addictive.',
    isFavorite: true,
  },
  {
    id: '5',
    restaurantName: 'Ootoya Times Square',
    priceTier: '$$',
    eateryType: 'Restaurant',
    cuisineType: 'Japanese Restaurant',
    address: '141 W 41st St, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7553,
    longitude: -73.9870,
    date: '2026-01-20',
    photos: [
      'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=600',
    ],
    whatIHad: ['Chicken Katsu', 'Miso Soup', 'Rice'],
    occasionTag: 'Regular Meal',
    moodTag: 'Calm',
    tasteRating: 'Okay',
    vibeRating: 'Okay',
    valueRating: 'Okay',
    tasteScore: 6.0,
    vibeScore: 6.5,
    valueScore: 5.5,
    compositeScore: computeComposite(6.0, 6.5, 5.5),
    eatAgain: false,
    squad: [],
    memoryNote:
      'Decent Japanese spot near Times Square. Nothing special but solid if you need a quick sit-down meal in the area.',
    isFavorite: false,
  },
  {
    id: '6',
    restaurantName: 'Birdland Jazz Club',
    priceTier: '$$$',
    eateryType: 'Bar',
    cuisineType: 'Jazz Bar',
    address: '315 W 44th St, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7590,
    longitude: -73.9910,
    date: '2026-01-15',
    photos: [
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600',
    ],
    whatIHad: ['Old Fashioned', 'Sliders'],
    occasionTag: 'Date Night',
    moodTag: 'Nostalgic',
    tasteRating: 'Okay',
    vibeRating: 'Great',
    valueRating: 'Poor',
    tasteScore: 6.0,
    vibeScore: 9.5,
    valueScore: 4.0,
    compositeScore: computeComposite(6.0, 9.5, 4.0),
    eatAgain: true,
    squad: [squad.aria],
    memoryNote:
      'The food is whatever but you go for the jazz. Incredible live music, dim lighting, classic NYC vibes. Worth every penny for the experience.',
    isFavorite: true,
  },
  {
    id: '7',
    restaurantName: 'Valla Table',
    priceTier: '$$',
    eateryType: 'Cafe',
    cuisineType: 'Mediterranean Cafe',
    address: '641 10th Ave, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7600,
    longitude: -73.9960,
    date: '2026-02-01',
    photos: [
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600',
    ],
    whatIHad: ['Shakshuka', 'Turkish Coffee', 'Baklava'],
    occasionTag: 'Special Moment',
    moodTag: 'Adventurous',
    tasteRating: 'Great',
    vibeRating: 'Great',
    valueRating: 'Okay',
    tasteScore: 8.0,
    vibeScore: 8.5,
    valueScore: 6.5,
    compositeScore: computeComposite(8.0, 8.5, 6.5),
    eatAgain: true,
    squad: [squad.keshav, squad.lulu],
    memoryNote:
      'Hidden gem in Hell\'s Kitchen. The shakshuka was phenomenal and the Turkish coffee hit different. Will be back.',
    isFavorite: false,
  },
];

// ─── Want to Try Entries ─────────────────────────────────────────
export const wantToTry: WantToTryEntry[] = [
  {
    id: 'w1',
    restaurantName: 'MEXiCUE',
    priceTier: '$$',
    eateryType: 'Restaurant',
    cuisineType: 'Mexican BBQ Fusion',
    address: '1440 Broadway, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7533,
    longitude: -73.9869,
  },
  {
    id: 'w2',
    restaurantName: "McDonald's",
    priceTier: '$',
    eateryType: 'Restaurant',
    cuisineType: 'Fast Food',
    address: '604 10th Ave, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7598,
    longitude: -73.9952,
  },
  {
    id: 'w3',
    restaurantName: 'Carnegie Diner & Cafe',
    priceTier: '$$',
    eateryType: 'Cafe',
    cuisineType: 'American Diner',
    address: '205 W 57th St, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7652,
    longitude: -73.9810,
  },
];

// ─── Search results (for Add Experience step 1) ──────────────────
export interface SearchResult {
  id: string;
  name: string;
  address: string;
  distance: string;
  isVisited: boolean;
  isBookmarked: boolean;
  latitude?: number;
  longitude?: number;
}

export const searchResults: SearchResult[] = [
  { id: 'sr1', name: "Joe's Pizza", address: '1435 Broadway, New York, NY', distance: '0.1 mi', isVisited: true, isBookmarked: false },
  { id: 'sr2', name: 'Ootoya Times Square', address: '141 W 41st St, New York, NY', distance: '0.4 mi', isVisited: true, isBookmarked: false },
  { id: 'sr3', name: 'MEXiCUE', address: '1440 Broadway, New York, NY', distance: '0.5 mi', isVisited: false, isBookmarked: true },
  { id: 'sr4', name: 'Birdland Jazz Club', address: '315 W 44th St, New York, NY', distance: '2.6 mi', isVisited: false, isBookmarked: false },
  { id: 'sr5', name: 'Valla Table', address: '641 10th Ave, New York, NY', distance: '7 mi', isVisited: true, isBookmarked: false },
  { id: 'sr6', name: "McDonald's", address: '604 10th Ave, New York, NY', distance: '8 mi', isVisited: false, isBookmarked: false },
  { id: 'sr7', name: 'Carnegie Diner & Cafe', address: '205 W 57th St, New York, NY', distance: '22 mi', isVisited: false, isBookmarked: true },
];

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
