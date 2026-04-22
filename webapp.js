/**
 * FinSignal — Content Creator Web App
 * -------------------------------------
 * Browser-based UI for creating blog posts and case studies.
 * Uses Groq API for AI generation, uploads to Strapi, then rebuilds the site.
 *
 * Usage:
 *   node webapp.js
 *   Open http://localhost:3000
 */

import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const app        = express();
const PORT       = 3000;

const STRAPI_URL   = process.env.STRAPI_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(path.join(__dirname, 'output')));

// ── GROQ API ──────────────────────────────────────────────────────────────────

async function askGroq(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gemma2-9b-it',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  return json.choices[0].message.content.trim();
}

// ── BUILD PROMPTS ─────────────────────────────────────────────────────────────
// We use a two-section format to avoid JSON escaping issues with HTML content.
// Section 1: JSON metadata (no HTML fields)
// Section 2: Raw HTML body (outside JSON, no escaping needed)

function buildBlogPrompt(content, { audience, tone, keywords, notes }) {
  return `TASK: Transform raw content into a structured fintech blog post.

Author context:
- Target audience: ${audience || 'Fintech professionals'}
- Tone: ${tone || 'Technical'}
- Keywords to target: ${keywords || ''}
- Additional notes: ${notes || 'none'}

OUTPUT FORMAT — two sections, exactly as shown:

<<<JSON
{
  "title": "...",
  "slug": "url-friendly-lowercase-hyphens",
  "seo_title": "under 60 chars with main keyword",
  "seo_description": "under 160 chars with keywords",
  "category": "one of: AI Engineering, Fintech, Legacy Modernisation, AI Governance, Engineering",
  "author": "FinSignal Editorial",
  "read_time": 5,
  "excerpt": "2-3 sentence summary",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "toc": [{"id": "section-slug", "title": "Section Title"}]
}
JSON>>>

<<<HTML
Full article HTML here — minimum 800 words.
Use <h2 id="section-slug">, <h3>, <p>, <ul>, <li>, <blockquote>, <strong>.
Add <div class="callout"> for key insights.
HTML>>>

Raw content to transform:
${content}`;
}

function buildCaseStudyPrompt(content, { clientType, outcome, keywords, notes }) {
  return `TASK: Transform raw content into a structured fintech case study.

Author context:
- Client type: ${clientType || 'Confidential'}
- Key outcome to highlight: ${outcome || ''}
- Keywords to target: ${keywords || ''}
- Additional notes: ${notes || 'none'}

OUTPUT FORMAT — two sections, exactly as shown:

<<<JSON
{
  "title": "outcome-focused headline",
  "slug": "url-friendly-lowercase-hyphens",
  "seo_title": "under 60 chars",
  "seo_description": "under 160 chars",
  "subtitle": "one sentence: client + outcome",
  "client_name": "e.g. European Neobank",
  "industry": "e.g. Fintech, Banking, Payments",
  "service": "primary service provided",
  "timeline": "e.g. 8 weeks",
  "stats": [{"value": "60%", "label": "Cost Reduction"}],
  "challenge_title": "The Challenge",
  "solution_title": "Our Approach",
  "tech_stack": ["Tech1", "Tech2"],
  "results_title": "The Results",
  "results_cards": [{"number": "3x", "label": "Faster Deployments"}],
  "testimonial": {"quote": "quote text or null", "attribution": "Name, Role"}
}
JSON>>>

<<<CHALLENGE_HTML
HTML for the challenge section — paragraphs and lists.
CHALLENGE_HTML>>>

<<<SOLUTION_HTML
HTML for the solution section — full approach details.
SOLUTION_HTML>>>

<<<RESULTS_HTML
HTML narrative about the results.
RESULTS_HTML>>>

Raw content to transform:
${content}`;
}

// ── PARSE GROQ RESPONSE ───────────────────────────────────────────────────────

function parseGroqResponse(response, type) {
  const extract = (tag) => {
    const match = response.match(new RegExp(`<<<${tag}([\\s\\S]*?)${tag}>>>`));
    return match ? match[1].trim() : '';
  };

  const jsonText = extract('JSON');
  if (!jsonText) throw new Error('AI response missing JSON section');

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`AI returned invalid JSON. Preview: "${jsonText.slice(0, 200)}"`);
  }

  if (type === 'blog') {
    data.body_html = extract('HTML');
  } else {
    data.challenge_html = extract('CHALLENGE_HTML');
    data.solution_html  = extract('SOLUTION_HTML');
    data.results_html   = extract('RESULTS_HTML');
  }

  return data;
}

// ── UPLOAD TO STRAPI ──────────────────────────────────────────────────────────

async function uploadToStrapi(type, data) {
  const endpoint = type === 'blog' ? 'blogs' : 'case-studies';
  const res = await fetch(`${STRAPI_URL}/api/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STRAPI_TOKEN}`,
    },
    body: JSON.stringify({ data }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Strapi upload failed (${res.status}): ${errText}`);
  }

  return res.json();
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    strapi: !!STRAPI_URL,
    groq: !!GROQ_API_KEY,
  });
});

// Main content creation endpoint
app.post('/api/create', async (req, res) => {
  const { type, content, audience, tone, keywords, notes, clientType, outcome } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not set in .env' });
  }
  if (!STRAPI_URL || !STRAPI_TOKEN) {
    return res.status(500).json({ error: 'STRAPI_URL or STRAPI_TOKEN not set in .env' });
  }

  try {
    // Step 1: Build prompt
    const prompt = type === 'blog'
      ? buildBlogPrompt(content, { audience, tone, keywords, notes })
      : buildCaseStudyPrompt(content, { clientType, outcome, keywords, notes });

    // Step 2: Call Groq
    const response = await askGroq(prompt);
    const data = parseGroqResponse(response, type);

    // Step 3: Upload to Strapi
    const result = await uploadToStrapi(type, data);
    const id = result?.data?.id || result?.data?.documentId || '—';

    // Step 4: Rebuild site (run generate.js)
    try {
      execSync('node generate.js', {
        cwd: __dirname,
        timeout: 60000,
        stdio: 'pipe',
      });
    } catch (genErr) {
      console.warn('⚠️  generate.js warning:', genErr.message);
      // Don't fail the whole request if generate.js has issues
    }

    // Return success
    res.json({
      success: true,
      title: data.title,
      slug: data.slug,
      category: data.category || data.industry || '',
      excerpt: data.excerpt || data.subtitle || '',
      id,
      type,
    });

  } catch (e) {
    console.error('❌ Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🚀 FinSignal Content Creator Web App');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Open: http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!GROQ_API_KEY)  console.warn('  ⚠️  GROQ_API_KEY not found in .env');
  if (!STRAPI_URL)    console.warn('  ⚠️  STRAPI_URL not found in .env');
  if (!STRAPI_TOKEN)  console.warn('  ⚠️  STRAPI_TOKEN not found in .env');
});
