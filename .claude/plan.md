# Food Journey App — Implementation Plan

## Overview
Build a 3-screen React Native Expo app (Map, Add Experience, Library) with mock data, dark theme, and bottom tab navigation. The existing Expo template will be completely replaced.

## Phase 0: Foundation Setup
### 0a. Install dependencies
- `@rnmapbox/maps` (Mapbox GL for React Native)
- `react-native-pager-view` (for photo carousel/swipe)
- `expo-image-picker` (for photo upload placeholder)
- `expo-linear-gradient` (for gradient overlays on cards)

### 0b. Theme — `theme/colors.ts`
Extract exact colors from the Figma screenshots:
- `background`: deep dark navy (~#0B1120)
- `surface`: slightly lighter navy for cards/inputs (~#141B2D)
- `surfaceBorder`: subtle border color (~#1E293B)
- `primary`: teal/mint accent (~#2DD4A8)
- `textPrimary`: white (#FFFFFF)
- `textSecondary`: muted gray (~#8B95A5)
- `ratingGreat`: green/teal (matches primary)
- `ratingOkay`: yellow (~#F5C518)
- `ratingPoor`: red (~#EF4444)
- `tagOccasion`: purple-ish tint
- `tagEatery`: green tint
- Score badge colors: teal for high, yellow for mid, red for low

### 0c. Mock Data — `data/mockData.ts`
~6-8 entries with varied:
- Restaurant names, locations, dates
- Photos (use placeholder URLs or local assets)
- Ratings (taste/vibe/value — Great/Okay/Poor + computed composite scores)
- Tags (occasion, mood, eatery type)
- Squad members
- Memory notes
- "Eat Again" toggle values
- 2-3 "Want to Try" entries (bookmarked but not visited)

### 0d. Folder Structure
```
app/
  _layout.tsx              → Root layout (dark theme forced, Stack)
  (tabs)/
    _layout.tsx            → Bottom tab bar (Map | + Add | Library)
    index.tsx              → Map screen (first tab)
    add.tsx                → Add Experience screen
    library.tsx            → Library/Memories screen
  entry/
    [id].tsx               → Full detail view for a memory
theme/
  colors.ts                → Color tokens
data/
  mockData.ts              → Mock entries + types
components/
  map/
    MapView.tsx            → Mapbox map with pins
  add/
    StepSearch.tsx          → Step 1: restaurant search
    StepLog.tsx             → Step 2: log the experience
    StepCompare.tsx         → Step 3: comparison swipe card
  library/
    MemoryGrid.tsx          → 2-column photo grid
    MemoryCard.tsx          → Individual card in the grid
    WantToTryList.tsx       → List view for Want to Try tab
  shared/
    ScoreBadge.tsx          → Composite score badge (color-coded)
    RatingPills.tsx         → Great/Okay/Poor toggle buttons
    TagChip.tsx             → Colored tag chips
    PhotoCarousel.tsx       → Swipeable photo strip with dots
```

## Phase 1: Root Layout + Tab Navigation
- Replace `app/_layout.tsx` — force dark theme, set up Stack navigator
- Replace `app/(tabs)/_layout.tsx` — 3 tabs: Map (triangle icon), + Add (plus icon), Library (book icon)
- Tab bar styling: dark background matching the app theme, teal active tint
- Clean out all existing template components we won't use

## Phase 2: Library Screen (Memories)
Build this first since the designs are most detailed in the screenshots.

### 2a. Library main screen — `app/(tabs)/library.tsx`
- "Memories" title (bold, white, large)
- 3 tabs: All Entries | Want to Try | Favorites (teal underline on active)
- Filter row: sort icon + dropdown chips (Restaurants, Score)
- All Entries + Favorites: 2-column photo grid (`MemoryGrid` + `MemoryCard`)
- Want to Try: list view (`WantToTryList`)

### 2b. MemoryCard component
- Photo fill with rounded corners
- Score badge overlay (top-left, star icon + score, color-coded by range)
- Restaurant name (white, bold) overlaid at bottom
- Location + time ago (small, gray) below name
- Tap → navigate to `entry/[id]`

### 2c. Detail view — `app/entry/[id].tsx`
- Photo carousel at top (swipeable, dot indicators, back arrow)
- Restaurant name + edit icon
- Price tier + eatery type
- Location (green pin) + date (calendar icon)
- Three sub-scores (heart=Taste, sparkle=Vibe, wallet=Value) on right
- Large composite score badge (teal, rounded)
- "What I Had" section with dark chips + add button
- "Tags" section with colored chips + add button
- "The Squad" with avatar stack + names
- Memory note in bordered card
- Eat Again indicator

## Phase 3: Add Experience Screen
### 3a. Step 1 — Restaurant Search (`StepSearch`)
- Search bar with magnifying glass icon
- "Current Location" button with teal pin
- Filter tabs: All | Nearby | Visited
- Restaurant list: distance, pin icon, name + address, bookmark/checkmark icons
- Teal checkmark = visited, filled teal bookmark = Want to Try
- Tap to select → advance to step 2

### 3b. Step 2 — Log Details (`StepLog`)
- Progress bar at top
- Dashed photo upload area (camera icon + text)
- Selected restaurant card (name, type, address, edit icon)
- "What did you eat?" text input
- "What's the occasion?" horizontal scrollable tag chips with emoji
- "Type of eatery?" horizontal tag row
- "How was it?" — Taste/Vibe/Value each with Great/Okay/Poor toggles (green/yellow/red)
- "Eat Again?" toggle
- "Who did you go with?" expandable row
- "Add Notes" expandable row
- Teal next arrow button (bottom right)

### 3c. Step 3 — Comparison Card (`StepCompare`)
- Progress bar (further along)
- "Is [New] better or worse than [Old]" prompt
- Tinder-style swipeable card with restaurant info + score
- "Worse ←" and "Better →" labels
- Bottom controls: back, "Too Tough" skip button, forward/done
- Uses `react-native-gesture-handler` + `react-native-reanimated` for swipe gesture

## Phase 4: Map Screen
- Full-screen dark-style Mapbox map
- Pins for all visited restaurants, color-coded by composite score (teal/yellow/red)
- Tap a pin → show a small popup card with restaurant name, score, photo thumbnail
- Keep it minimal and clean — no floating search bar
- Cluster pins if too many are close together

## Phase 5: Polish
- Ensure consistent spacing, typography, and colors across all screens
- Bottom tab bar icon alignment and styling
- Safe area handling (notch, bottom bar)
- StatusBar light content

## Dependencies to Install
```
npm install @rnmapbox/maps react-native-pager-view expo-image-picker expo-linear-gradient
```

## What's NOT in scope (deferred)
- Supabase / real API calls
- Foursquare API integration (mock data only)
- Friends tab
- Actual photo capture/upload
- Real geolocation
- Authentication
