/**
 * Import parsing funnel (spec: docs/import-spec.md §2).
 *
 * Turns whatever the user pasted — spreadsheet cells (tab-separated),
 * header CSVs (incl. Google Takeout's Title,Note,URL), or freeform lines
 * from a Notes app — into candidate rows. The parse only needs to be good
 * enough to produce a Foursquare search query; resolution + human confirm
 * catch everything else.
 */

export interface ParsedRow {
  raw: string;      // original line (debugging / re-parse)
  name: string;     // best-guess restaurant name → FSQ query
  city?: string;    // per-row location hint, overrides batch bias
  coords?: { lat: number; lng: number }; // exact hint (e.g. from a Maps URL) — beats city
  note?: string;    // free text carried into the entry later
  rating?: number;  // normalized to 0–10 when detected (unused in WTT phase)
}

// ── Column header synonyms ─────────────────────────────────────────
const HEADER_SYNONYMS: Record<string, RegExp> = {
  name: /^(name|restaurant|place|title|spot|venue)s?$/i,
  city: /^(city|town|location|area|where)$/i,
  rating: /^(rating|score|stars?|rank)$/i,
  note: /^(note|notes|comment|comments|review|description)$/i,
  url: /^(url|link|maps? ?(url|link)?)$/i,
};

/**
 * Google Maps URLs (e.g. from Takeout CSVs) often embed the coordinates
 * even though the CSV has no location columns: `/@lat,lng,15z`,
 * `!3dlat!4dlng` data blobs, or dropped pins as `/maps/search/lat,lng`.
 */
function coordsFromUrl(url: string): { lat: number; lng: number } | undefined {
  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /maps\/search\/(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return undefined;
}

function classifyHeader(cell: string): string | null {
  const trimmed = cell.trim();
  for (const [kind, re] of Object.entries(HEADER_SYNONYMS)) {
    if (re.test(trimmed)) return kind;
  }
  return null;
}

// ── Rating extraction ──────────────────────────────────────────────
/** Returns rating normalized to 0–10, and the line with the rating removed. */
function extractRating(line: string): { rest: string; rating?: number } {
  // "9/10", "4.5/5", "87/100"
  const frac = line.match(/(\d+(?:\.\d+)?)\s*\/\s*(5|10|100)\b/);
  if (frac) {
    const value = parseFloat(frac[1]);
    const scale = parseInt(frac[2], 10);
    if (value <= scale) {
      return { rest: line.replace(frac[0], ' '), rating: (value / scale) * 10 };
    }
  }
  // "★★★★" (out of 5)
  const stars = line.match(/[★⭐]{1,5}/);
  if (stars) {
    return { rest: line.replace(stars[0], ' '), rating: (stars[0].length / 5) * 10 };
  }
  return { rest: line };
}

// ── Junk detection ─────────────────────────────────────────────────
// People's lists carry structure that isn't places: rating rows
// ("3.5  3.4  3.6 > 3.5"), rating-dimension headers ("value,
// atmosphere, delicious"), section tags ("<meal>"). Formats are
// infinite; junk is recognizable.
const RATING_VOCAB = new Set([
  'value', 'atmosphere', 'delicious', 'taste', 'vibe', 'vibes',
  'rating', 'ratings', 'score', 'scores', 'food', 'and', 'overall',
]);

function isJunkLine(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  // Section tags: <meal>, <dessert>, [breakfast], etc.
  if (/^[<[][^>\]]*[>\]]$/.test(t)) return true;
  // Score rows: almost nothing left once digits/punctuation are removed
  const alpha = t.replace(/[\d.,;:>→\-–—*()/\\\s]+/g, '');
  if (alpha.length < 2) return true;
  // Rating-dimension headers: every word is rating vocabulary
  const words = t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => RATING_VOCAB.has(w))) return true;
  return false;
}

// ── Freeform line → row ────────────────────────────────────────────
const BULLET = /^\s*(?:[-–—•*]|\d+[.)])\s*/;
const SEPARATORS = [' - ', ' – ', ' — ', ': ', ' | '];

function parseFreeformLine(line: string): ParsedRow | null {
  const raw = line;
  if (isJunkLine(line)) return null;
  let s = line.replace(BULLET, '').trim();
  if (!s || isJunkLine(s)) return null;

  const { rest, rating } = extractRating(s);
  s = rest.trim();

  // Trailing parenthetical is stripped from the name (it hurts search
  // matching) and kept as note text. It is NOT treated as a location —
  // guessing "(fries)" vs "(Ellicott City)" was too inaccurate; location
  // hints only come from trusted sources (City columns, Maps-URL coords),
  // and any row's search location is editable on the review screen.
  let parenNote: string | undefined;
  const paren = s.match(/\(([^)]{2,30})\)\s*$/);
  if (paren) {
    parenNote = paren[1].trim();
    s = s.slice(0, paren.index).trim();
  }

  // First separator splits name from note
  let name = s;
  let note: string | undefined;
  for (const sep of SEPARATORS) {
    const idx = s.indexOf(sep);
    if (idx > 0) {
      name = s.slice(0, idx).trim();
      note = s.slice(idx + sep.length).trim() || undefined;
      break;
    }
  }

  name = name.replace(/[\s,;]+$/, '').trim();
  if (!name) return null;
  const fullNote = [note, parenNote].filter(Boolean).join(' · ') || undefined;
  return { raw, name, note: fullNote, rating };
}

// ── Tabular (tab-separated or simple CSV with a header row) ────────
function splitCsvLine(line: string): string[] {
  // Handles simple quoted CSV cells; good enough for Takeout/Sheets output
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseTabular(lines: string[], delimiter: 'tab' | 'csv'): ParsedRow[] | null {
  const split = (l: string) => (delimiter === 'tab' ? l.split('\t').map((c) => c.trim()) : splitCsvLine(l));

  const headerCells = split(lines[0]);
  const columns = headerCells.map(classifyHeader);
  const hasHeader = columns.some((c) => c !== null);

  let nameIdx = columns.indexOf('name');
  const cityIdx = columns.indexOf('city');
  const ratingIdx = columns.indexOf('rating');
  const noteIdx = columns.indexOf('note');
  const urlIdx = columns.indexOf('url');

  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (nameIdx === -1) nameIdx = 0; // convention: first column is the name

  const rows: ParsedRow[] = [];
  for (const line of dataLines) {
    const cells = split(line);
    const name = (cells[nameIdx] ?? '').trim();
    if (!name) continue;

    let rating: number | undefined;
    if (ratingIdx !== -1 && cells[ratingIdx]) {
      const parsed = extractRating(cells[ratingIdx]);
      rating = parsed.rating;
      if (rating === undefined) {
        const n = parseFloat(cells[ratingIdx]);
        // Bare number: infer scale from magnitude (≤5 → 5-scale, ≤10 → 10-scale)
        if (!Number.isNaN(n) && n >= 0) rating = n <= 5 ? n * 2 : n <= 10 ? n : undefined;
      }
    }

    // Coordinates hidden in a Maps URL (explicit URL column, or any
    // http(s) cell) give this row an exact location hint.
    let coords: { lat: number; lng: number } | undefined;
    const urlCell =
      (urlIdx !== -1 ? cells[urlIdx] : undefined) ??
      cells.find((c) => /^https?:\/\//i.test(c));
    if (urlCell) coords = coordsFromUrl(urlCell);

    rows.push({
      raw: line,
      name,
      city: cityIdx !== -1 ? cells[cityIdx]?.trim() || undefined : undefined,
      coords,
      note: noteIdx !== -1 ? cells[noteIdx]?.trim() || undefined : undefined,
      rating,
    });
  }
  return rows.length > 0 ? rows : null;
}

// ── Entry point ────────────────────────────────────────────────────
export function parseImportText(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Tab-separated (spreadsheet copy/paste)
  const tabbed = lines.filter((l) => l.includes('\t')).length;
  if (tabbed >= lines.length / 2) {
    const rows = parseTabular(lines, 'tab');
    if (rows) return rows;
  }

  // CSV with a recognizable header row (e.g. Google Takeout "Title,Note,URL")
  if (lines.length >= 2 && lines[0].includes(',')) {
    const headerHits = splitCsvLine(lines[0]).map(classifyHeader).filter(Boolean).length;
    if (headerHits >= 1) {
      const rows = parseTabular(lines, 'csv');
      if (rows) return rows;
    }
  }

  // Freeform: one place per line
  return lines
    .map(parseFreeformLine)
    .filter((r): r is ParsedRow => r !== null);
}
