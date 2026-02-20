/**
 * Seeds 4 sample memories for a brand-new user so the app feels alive.
 * Only runs if the user currently has 0 memories.
 */
import { supabase } from '@/lib/supabase';

function computeComposite(taste: number, vibe: number, value: number) {
  return Math.round((taste * 0.5 + vibe * 0.25 + value * 0.25) * 10) / 10;
}

const SEEDS = [
  {
    restaurant_name: "Joe's Pizza",
    price_tier: '$',
    eatery_type: 'Restaurant',
    cuisine_type: 'Pizza Restaurant',
    address: '1435 Broadway, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7536,
    longitude: -73.9862,
    date: '2026-02-15',
    photos: ['https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600'],
    what_i_had: ['Pizza', 'Garlic Knots'],
    occasion_tag: 'Quick Bite',
    mood_tag: 'Craving',
    taste_rating: 'Great',
    vibe_rating: 'Okay',
    value_rating: 'Great',
    taste_score: 8.5,
    vibe_score: 7.0,
    value_score: 9.0,
    composite_score: computeComposite(8.5, 7.0, 9.0),
    eat_again: true,
    squad: [{ id: 's1', name: 'Keshav', avatar: 'https://i.pravatar.cc/100?img=11' }],
    memory_note: 'Classic New York slice. The garlic knots were perfect — crispy outside, soft inside. Nothing fancy, just exactly what you want at 1am.',
    is_favorite: false,
  },
  {
    restaurant_name: "Fookem's Fabulous",
    price_tier: '$',
    eatery_type: 'Bakery',
    cuisine_type: 'Bakery',
    address: '3606 Grand Ave, Miami, FL',
    city: 'Miami',
    state: 'FL',
    latitude: 25.7617,
    longitude: -80.1918,
    date: '2026-01-01',
    photos: ['https://images.unsplash.com/photo-1519915028121-7d3463d20b13?w=600'],
    what_i_had: ['Key Lime Pie', 'Key Lime Slushy'],
    occasion_tag: 'Quick Bite',
    mood_tag: 'Perfect',
    taste_rating: 'Great',
    vibe_rating: 'Okay',
    value_rating: 'Okay',
    taste_score: 9.8,
    vibe_score: 6.0,
    value_score: 6.5,
    composite_score: computeComposite(9.8, 6.0, 6.5),
    eat_again: true,
    squad: [
      { id: 's1', name: 'Keshav', avatar: 'https://i.pravatar.cc/100?img=11' },
      { id: 's2', name: 'Lulu', avatar: 'https://i.pravatar.cc/100?img=5' },
    ],
    memory_note: "Went to a key lime pie bakery with friends and it was honestly the best key lime pie I have ever had. Perfect balance of tart and sweet.",
    is_favorite: true,
  },
  {
    restaurant_name: "Culver's",
    price_tier: '$',
    eatery_type: 'Restaurant',
    cuisine_type: 'Fast Food Restaurant',
    address: '1900 S University Dr, Davie, FL',
    city: 'Davie',
    state: 'FL',
    latitude: 26.0665,
    longitude: -80.2490,
    date: '2026-02-08',
    photos: ['https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600'],
    what_i_had: ['ButterBurger', 'Cheese Curds', 'Concrete Mixer'],
    occasion_tag: 'Quick Bite',
    mood_tag: 'Craving',
    taste_rating: 'Great',
    vibe_rating: 'Great',
    value_rating: 'Great',
    taste_score: 9.0,
    vibe_score: 8.5,
    value_score: 9.0,
    composite_score: computeComposite(9.0, 8.5, 9.0),
    eat_again: true,
    squad: [{ id: 's3', name: 'Marcus', avatar: 'https://i.pravatar.cc/100?img=12' }],
    memory_note: "Culver's never misses. The ButterBurger is comfort food perfection and those cheese curds are addictive.",
    is_favorite: true,
  },
  {
    restaurant_name: 'Birdland Jazz Club',
    price_tier: '$$$',
    eatery_type: 'Bar',
    cuisine_type: 'Jazz Bar',
    address: '315 W 44th St, New York, NY',
    city: 'New York City',
    state: 'NY',
    latitude: 40.7590,
    longitude: -73.9910,
    date: '2026-01-15',
    photos: ['https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600'],
    what_i_had: ['Old Fashioned', 'Sliders'],
    occasion_tag: 'Date Night',
    mood_tag: 'Nostalgic',
    taste_rating: 'Okay',
    vibe_rating: 'Great',
    value_rating: 'Poor',
    taste_score: 6.0,
    vibe_score: 9.5,
    value_score: 4.0,
    composite_score: computeComposite(6.0, 9.5, 4.0),
    eat_again: true,
    squad: [{ id: 's4', name: 'Aria', avatar: 'https://i.pravatar.cc/100?img=9' }],
    memory_note: 'The food is whatever but you go for the jazz. Incredible live music, dim lighting, classic NYC vibes.',
    is_favorite: true,
  },
];

export async function seedMemoriesIfEmpty(userId: string): Promise<boolean> {
  // Check if user already has memories
  const { count } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true });

  if ((count ?? 0) > 0) return false; // already has data, skip

  const rows = SEEDS.map((s) => ({ ...s, user_id: userId }));
  const { error } = await supabase.from('memories').insert(rows);

  if (error) {
    console.warn('Seed failed:', error.message);
    return false;
  }
  return true;
}
