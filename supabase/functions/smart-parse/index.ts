// Supabase Edge Function: smart-parse
// Turns a raw pasted restaurant list (any format) into structured rows
// using Claude Haiku with structured outputs. The app falls back to its
// deterministic parser if this function fails, so errors here are safe.
//
// Secrets required: ANTHROPIC_API_KEY (Dashboard → Edge Functions → Secrets)

import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_INPUT_CHARS = 20_000; // bounds cost; ~300 places is well under this

// Structured-output schema: the response is guaranteed to match this.
const SCHEMA = {
  type: 'object',
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          city: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          rating: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        },
        required: ['name', 'city', 'note', 'rating'],
        additionalProperties: false,
      },
    },
  },
  required: ['places'],
  additionalProperties: false,
} as const;

const SYSTEM = `You extract restaurant lists from messy personal notes.

The input is text a person pasted from their notes app, a spreadsheet, or a
message. Return every restaurant/cafe/bar/food place mentioned, one entry
each, preserving the order of appearance.

Rules:
- name: the place's name only. Strip bullets, numbering, and decorations.
- city: ONLY if the text indicates where the place is, and ONLY if it is a
  real-world location (city, neighborhood, beach town, zip code). Fix obvious
  misspellings (e.g. "maimi" → "Miami", "fort loadadale" → "Fort Lauderdale").
  Cuisine words, dishes, or anything that is not a location must be null —
  never guess a city that isn't indicated in the text.
- note: any leftover descriptive text about the place (dishes, cuisine,
  comments), lightly cleaned. null if none.
- rating: only if the line contains ONE clear personal rating for the place,
  normalized to a 0-10 scale (e.g. "9/10" → 9, "4.5/5" → 9, "★★★★" → 8).
  If there are score tables, multiple raters' scores, or per-dimension scores
  (e.g. rows of numbers under "value, atmosphere, delicious"), use null.
- Skip lines that are not places: list titles, section markers like <meal>,
  rating-dimension headers, rows of numbers, and stray text.
- Do not invent places. Do not merge distinct places. Do not translate names.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (typeof text !== 'string' || !text.trim()) {
      return new Response(JSON.stringify({ error: 'No text provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (text.length > MAX_INPUT_CHARS) {
      return new Response(JSON.stringify({ error: 'Text too long' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: text }],
    });

    if (response.stop_reason === 'refusal' || response.content.length === 0) {
      return new Response(JSON.stringify({ error: 'Could not parse' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const block = response.content.find((b) => b.type === 'text');
    const parsed = JSON.parse(block && 'text' in block ? block.text : '{"places":[]}');

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('smart-parse error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
