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
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 16000,
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

function buildBlogPrompt(content, { audience, tone, keywords, notes }) {
  return `TASK: Transform raw content into a JSON object for a fintech blog CMS.

IMPORTANT: Your response must be ONLY a valid JSON object. No intro text, no explanation, no markdown fences. Start your response with { and end with }.

Author context:
- Target audience: ${audience || 'Fintech professionals'}
- Tone: ${tone || 'Technical'}
- Keywords to target: ${keywords || ''}
- Additional notes: ${notes || 'none'}

Required JSON fields:
- title: string (compelling blog post title)
- slug: string (url-friendly, lowercase, hyphens only)
- seo_title: string (under 60 chars, include main keyword)
- seo_description: string (under 160 chars, include keywords)
- category: string (must be one of: AI Engineering, Fintech, Legacy Modernisation, AI Governance, Engineering)
- author: string (use "FinSignal Editorial")
- read_time: number (estimated minutes to read)
- excerpt: string (2-3 sentences summarising the post)
- tags: array of 4-5 keyword strings
- toc: array of objects with id (slug) and title fields
- body_html: string (full article as HTML, minimum 800 words, use h2 with id attributes matching toc ids, h3, p, ul, li, blockquote, strong. Add <div class='callout'> for key insights. IMPORTANT: use single quotes for all HTML attributes so the JSON stays valid)

Raw content to transform:
${content}`;
}

function buildCaseStudyPrompt(content, { clientType, outcome, keywords, notes }) {
  return `TASK: Transform raw content into a JSON object for a fintech case study CMS.

IMPORTANT: Your response must be ONLY a valid JSON object. No intro text, no explanation, no markdown fences. Start your response with { and end with }.

Author context:
- Client type: ${clientType || 'Confidential'}
- Key outcome to highlight: ${outcome || ''}
- Keywords to target: ${keywords || ''}
- Additional notes: ${notes || 'none'}

Required JSON fields:
- title: string (outcome-focused headline)
- slug: string (url-friendly, lowercase, hyphens only)
- seo_title: string (under 60 chars)
- seo_description: string (under 160 chars)
- subtitle: string (one sentence: client + outcome)
- client_name: string (e.g. European Neobank)
- industry: string (e.g. Fintech, Banking, Payments)
- service: string (primary service provided)
- timeline: string (e.g. 8 weeks)
- stats: array of objects with value (string) and label (string)
- challenge_title: string
- challenge_html: string (HTML paragraphs and lists describing the challenge)
- solution_title: string
- solution_html: string (HTML with full approach and solution details)
- tech_stack: array of technology name strings
- results_title: string
- results_cards: array of objects with number (string) and label (string)
- results_html: string (HTML narrative about results)
- testimonial: object with quote (string or null) and attribution (string)

Raw content to transform:
${content}`;
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
    const jsonText = response.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      // Try extracting just the outermost JSON object
      const start = jsonText.indexOf('{');
      const end   = jsonText.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
          data = JSON.parse(jsonText.slice(start, end + 1));
        } catch (e2) {
          throw new Error(`AI returned invalid JSON. Preview: "${jsonText.slice(0, 200)}"`);
        }
      } else {
        throw new Error(`AI returned invalid JSON. Preview: "${jsonText.slice(0, 200)}"`);
      }
    }

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
