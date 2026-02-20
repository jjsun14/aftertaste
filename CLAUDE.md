# Food Journey App

## Project Overview
A React Native / Expo food journal app. Users log restaurant memories, rate meals, search nearby restaurants via Foursquare, and compare experiences.

## IMPORTANT: Working Directory
The real source code lives at: `C:\Users\jjsun\food-journey-app`

Do NOT work in `.claude/worktrees/*` — those are empty git worktrees used by Claude Code internally and do not contain the actual app code.

When in doubt, always check that files like `app/`, `components/`, `lib/`, `context/`, `data/` exist at the root before doing anything.

## Tech Stack
- **Framework**: Expo SDK 54 / React Native 0.81
- **Navigation**: Expo Router (file-based, lives in `app/`)
- **Language**: TypeScript
- **Backend**: Supabase (auth + database + storage)
- **Maps**: Mapbox (`@rnmapbox/maps`)
- **Restaurant Search**: Foursquare Legacy v2 API (Client ID + Secret in `.env`)
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
  foursquare.ts       Foursquare Places API search
theme/
  colors.ts           App color palette
```

## Environment Variables (`.env`)
```
EXPO_PUBLIC_FOURSQUARE_CLIENT_ID=...
EXPO_PUBLIC_FOURSQUARE_CLIENT_SECRET=...
```

## Common Commands
```bash
npx expo start          # Start dev server
npx expo start --clear  # Start with cleared Metro cache (use when code changes aren't reflecting)
```

## Current Status / Known Issues
- Photo upload to Supabase Storage: uses `lib/uploadPhoto.ts` with pure-JS base64 decoder (no external deps needed). Always run `npx expo start --clear` after changing this file.
- Foursquare search uses Legacy v2 API (`https://api.foursquare.com/v2/venues/search`) — NOT v3.
- `base64-arraybuffer` package is listed in package.json but NOT used — `uploadPhoto.ts` has its own decoder.
- Supabase Storage bucket `memory-photos` must exist and be public with RLS: INSERT `(auth.uid() IS NOT NULL)`, SELECT `(true)`.
