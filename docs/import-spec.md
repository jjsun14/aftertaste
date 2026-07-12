# Import Feature Spec — "Bring your list"

Goal: someone with an existing list of restaurants (Google Maps saved lists,
Excel/CSV, Notes app, texts) can get it into Aftertaste with minimal friction,
without compromising the integrity of the rating/tier system.

Core principles (settled during design):

1. **Import's job is "don't lose your list"** — never force bulk rating.
2. **Nothing unrated ever enters the library.** The buffer is the To Rate
   queue, not scoreless memories. Memory model keeps non-null scores.
3. **Every "been here" import graduates through the real Add Experience flow**
   (pre-filled, so it's taps not typing). Rating pills always required;
   comparison *precision* is skippable ("Don't Remember").
4. **The parser proposes, Foursquare disambiguates, the human confirms.**
   Parse errors must be visible and recoverable, never silent.

---

## 1. Intake

Entry points:
- Profile screen → "Import your lists"
- Library empty state CTA ("Already have a list? Import it")

Two intake modes on one screen:
- **Paste box** — accepts anything: freeform lines, Notes lists, and
  spreadsheet cells (copying cells in Excel/Sheets/Numbers yields
  tab-separated text, which parses as tabular).
- **File picker** (expo-document-picker) — `.csv` (incl. Google Takeout) and
  `.xlsx` (SheetJS, pure-JS, Hermes-compatible).

Not in scope: Beli (no export exists — paste is the opportunistic path),
Apple Maps guides, KML, share-sheet intake (later nicety).

## 2. Parsing funnel

Layer 1 — structure detection: extension for files; tabs → tabular;
consistent comma counts → headerless CSV; else freeform lines.

Layer 2 — column classification (tabular): header synonyms
(`name|restaurant|place|title|spot`, `rating|score|stars`,
`city|location|area`, `note|comment|review`, `date|visited`) plus content
statistics for headerless data (bounded numeric column → rating, and its max
implies the scale; date-parseable → date; highest-variety text → name).
Result shown in a **mapping preview** screen — one confirmation per file,
reassignable by tap.

Layer 3 — freeform line extraction (ordered, each pass removes its match):
1. strip list decorations (`1.`, `-`, `•`, `*`)
2. extract rating patterns (`9/10`, `4.5/5`, `★★★★`, `8.5`, "9 out of 10")
3. extract location hints (trailing `– NYC`, parentheticals, known city names)
4. split remainder on first separator (`-`, `–`, `:`, `|`):
   first chunk = name, rest = note

Layer 4 — safety net: Foursquare resolution + human confirm (below). The
parse only needs to produce a usable search query; FSQ fuzziness absorbs
imperfection.

**LLM fallback (phase 2)**: Supabase edge function → Claude (Haiku-class),
"return JSON rows {name, city, rating, note, date}" for chaotic pastes.
Surfaced as a "Try smart parse" button on the needs-attention pile, not the
default path. Note: sends raw pasted text to Anthropic; pennies per import.

Ratings normalization: whatever the scale, map to Great/Okay/Poor.
**Default thresholds align with the app's internal anchor scores**
(Great=8.5, Okay=6.0, Poor=3.5): on a 10-scale → ≥8.5 Great, 5.5–8.4 Okay,
<5.5 Poor; on a 5-scale → ≥4.5 / 3–4.4 / <3. Thresholds adjustable in the
mapping preview. (Rationale: prevents an import of mostly-8s flooding the
Elite tier.)

## 3. Resolution (Foursquare)

- Each row → `places/search` with `fsq_category_ids` food filter,
  biased by the **batch city** (picked once per import via the existing
  Mapbox location autocomplete; per-row city hints override the bias).
- The food filter is the restaurant sieve: museums/hotels in mixed Google
  lists simply don't match and drop to needs-attention for discard.
- Confidence: normalized-name similarity of top result vs query.
  - High → auto-checked ✓
  - Medium → show top 2–3 candidates, user taps
  - No match → needs-attention pile with an editable search field
- Google Takeout rows: the URL column often embeds the place name/query —
  usable as a secondary search string when Title alone fails (enhancement).

**Quota guard (important)**: a 100-row import = 100+ search calls, and the
account already bumps into FSQ free-tier limits on premium fields. Throttle
to ~4 concurrent with a progress bar, cap batches (e.g. 300 rows), and
resolve only after the user confirms the batch — never speculatively.

Dedupe (within batch, vs memories, vs want-to-try): normalized name
(lowercase, strip punctuation/diacritics) + city; prefer exact
`fsq_place_id` equality where available. Duplicates shown collapsed with an
"already in your library/list" note.

## 4. Destination

One question per file/batch: **"Been here"** / **"Want to try"** / **"Mixed"**.
- Takeout filename pre-selects only (`Want to go.csv` → Want to Try) —
  the user always confirms; pasted text always asks.
- Want to Try → rows insert into `want_to_try` immediately (with real FSQ
  coords/city/category — richer than the current bookmark defaults).
- Been here → rows insert into the To Rate queue.
- Mixed → everything lands in To Rate; each card gets an extra
  "actually, want to try" action during triage.

## 5. To Rate queue

New table `import_queue` (RLS: own rows only):

```
id, user_id, created_at
source          'paste' | 'csv' | 'xlsx' | 'takeout'
raw_text        original line/row (debugging + re-parse)
fsq_place_id, name, address, city, state, latitude, longitude, category
prefill_rating  Great|Okay|Poor (from normalization) or null
prefill_note, prefill_date
status          'pending' | 'needs_attention' | 'dismissed'
```

UI: **third tab in the Library screen — "To Rate" (working name)** with a
count badge. Rows show the static-map thumbnail, name, city, any pre-filled
rating chip. Swipe actions: dismiss, move to Want to Try.

Graduation: tap a row → the existing Add Experience flow, with:
- StepSearch **skipped** (restaurant pre-resolved)
- StepLog pre-filled: pills pre-selected from `prefill_rating` (same level
  on taste/vibe/value as a *starting point*), note, date
- StepCompare as normal, plus **"Don't Remember"** (import-origin only):
  ends the binary search immediately and inserts at the current mid
  position — coarse placement within the tier the pills chose. Uses the
  existing `forceSearchDone` mechanism. Does not count toward
  MAX_COMPARISONS (it ends the session, nothing follows).
  After placement, a small toast: "Placed #4 of 7 in Great tier — rerank
  anytime" (open decision: silent vs toast; recommendation: toast).
- On successful save: delete the queue row; memory gets
  `source: 'import'` for the badge / future analytics.

## 6. Photos

Imported memories have none. Placeholder = **Mapbox Static Images API**
mini-map (dark style, pin at the restaurant, cuisine emoji + tier color
overlay).

**Implementation constraint**: build the static-map URL at *render time*
from stored coords — do NOT store the URL (with embedded access token) in
the `photos` array. Token rotation must not break history, and tokens don't
belong in DB rows. Cache via expo-image. Applies to any photo-less memory,
not just imports — organic no-photo memories get prettier for free.

## 7. Schema additions

- `import_queue` table (above) + RLS policies.
- `memories.source` text nullable ('import' initially).
- **`memories.fsq_place_id` text nullable** — start storing it on ALL new
  memories (organic + imported). Payoff: exact dedupe, exact
  visited-detection for chains (fixes the name-only matching weakness),
  future FSQ enrichment. Cheap now, painful to backfill later.
- `want_to_try.fsq_place_id` — same reasoning.

## 8. Phasing

- **1a (smallest useful)**: paste box → parse → resolve → confirm →
  Want to Try. No queue, no schema change beyond `fsq_place_id`.
- **1b**: `import_queue` + To Rate tab + pre-filled Add Experience +
  Don't Remember + static-map placeholder.
- **2**: CSV/xlsx file picker + mapping preview + rating normalization +
  Takeout niceties (filename pre-select, URL fallback).
- **3**: LLM smart-parse fallback; placement toast polish; share-sheet.

## 9. Open decisions

1. Tab name: "To Rate" vs "Backlog" vs "From your list".
2. Don't-Remember placement feedback: silent vs toast (rec: toast).
3. Batch cap size and FSQ throttle numbers — confirm against actual FSQ
   free-tier limits before building phase 1a.

## 10. Edge cases checklist

- Duplicate rows within one paste (dedupe before resolving — saves quota)
- Chains: candidate picker shows addresses; city hint disambiguates
- International: FSQ handles (verified Tokyo/Seoul/Paris); city bias picker
  already speaks Mapbox autocomplete
- Emoji/diacritics/quotes in names: strip for matching, preserve for display
- Mid-import interruption: queue rows persist server-side after confirm, so
  triage survives app restarts; resolution step itself is re-runnable
- Empty/garbage paste: friendly zero-state, never a crash
- Rating column with mixed junk ("n/a", "-"): non-parseable → no prefill
