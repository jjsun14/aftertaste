# Aftertaste

## Project Overview
A React Native / Expo food journal app. Users log restaurant memories, rate meals, search nearby restaurants via Google Places, and compare experiences.

## IMPORTANT: Working Directory
The real source code lives at: `/Users/jjsun/food-journey-app`

Do NOT work in `.claude/worktrees/*` — those are empty git worktrees used by Claude Code internally and do not contain the actual app code.

When in doubt, always check that files like `app/`, `components/`, `lib/`, `context/`, `data/` exist at the root before doing anything.

## Tech Stack
- **Framework**: Expo SDK 54 / React Native 0.81
- **Navigation**: Expo Router (file-based, lives in `app/`)
- **Language**: TypeScript
- **Backend**: Supabase (auth + database + storage)
- **Maps**: Mapbox (`@rnmapbox/maps`)
- **Restaurant Search**: Google Places API (New) — `lib/googlePlaces.ts`, key `EXPO_PUBLIC_GOOGLE_PLACES_KEY` in `.env`. IMPORTANT: search field masks must stay Pro-tier only; priceLevel is fetched via a separate details call on selection (Enterprise tier). Old Foursquare integration (`lib/foursquare.ts`) kept as fallback — FSQ free tier dropped to 500 calls/mo in June 2026.
- **Storage**: Supabase Storage bucket `memory-photos` (public)
- **State**: React Context — `context/DataContext.tsx`, `context/AuthContext.tsx`

## Key Directories
```
app/                  Expo Router screens
  (tabs)/             Tab screens: index, library, add, map, profile
  entry/[id].tsx      Memory detail screen
components/
  add/                StepSearch, StepLog, StepCompare
  library/            MemoryCard, WantToTryList, etc.
  shared/             RatingPills, etc.
context/
  DataContext.tsx     useMemories(), useWantToTry() hooks
  AuthContext.tsx     useAuth() hook
data/
  mockData.ts         Type definitions + mock seed data
lib/
  supabase.ts         Supabase client
  uploadPhoto.ts      Photo upload to Supabase Storage
  googlePlaces.ts     Restaurant search — Google Places API (New)
  foursquare.ts       Fallback (unused) — Foursquare Places search
  mapboxLocation.ts   City/location autocomplete (Mapbox Search Box)
theme/
  colors.ts           App color palette
```

## Environment Variables (`.env`)
```
EXPO_PUBLIC_FOURSQUARE_API_KEY=...
```

## Common Commands
```bash
npx expo start          # Start dev server
npx expo start --clear  # Start with cleared Metro cache (use when code changes aren't reflecting)
```

## Current Status / Known Issues
- Photo upload to Supabase Storage: uses `lib/uploadPhoto.ts` with pure-JS base64 decoder (no external deps needed). Always run `npx expo start --clear` after changing this file.
- Restaurant search: Google Places API (New) via POST places:searchText / places:searchNearby. Free tiers: 5K Pro calls/mo (searches), 1K Enterprise/mo (price details). Never add rating/hours/photo fields to search masks — it re-tiers the whole call.
- Supabase Storage bucket `memory-photos` must exist and be public with RLS: INSERT `(auth.uid() IS NOT NULL)`, SELECT `(true)`.
