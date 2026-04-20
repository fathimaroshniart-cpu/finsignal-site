/**
 * FinSignal Content Creator
 * --------------------------
 * Interactive CLI tool — paste your content, answer a few questions,
 * and it automatically uploads a fully structured entry to Strapi.
 *
 * Usage:
 *   node create-content.js
 */

import readline from 'readline';
import { execSync, spawnSync } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STRAPI_URL   = process.env.STRAPI_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

// ── COLOURS ───────────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
};

const log  = (msg) => console.log(msg);
const info = (msg) => console.log(`${c.cyan}${msg}${c.reset}`);
const ok   = (msg) => console.log(`${c.green}✅ ${msg}${c.reset}`);
const err  = (msg) => console.log(`${c.red}❌ ${msg}${c.reset}`);
const bold = (msg) => `${c.bold}${msg}${c.reset}`;
const dim  = (msg) => `${c.dim}${msg}${c.reset}`;

// ── READLINE HELPERS ──────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function askChoice(question, choices) {
  return new Promise(resolve => {
    log(`\n${bold(question)}`);
    choices.forEach((choice, i) => log(`  ${c.cyan}${i + 1}.${c.reset} ${choice}`));
    rl.question(`\n${c.yellow}>${c.reset} `, answer => {
      const index = parseInt(answer.trim()) - 1;
      if (index >= 0 && index < choices.length) {
        resolve({ index, value: choices[index] });
      } else {
        resolve({ index: 0, value: choices[0] });
      }
    });
  });
}

// Collect multi-line input — user presses Enter twice to finish
function askMultiline(prompt) {
  return new Promise(resolve => {
    log(`\n${bold(prompt)}`);
    log(dim('(Press Enter twice when done)\n'));
    let content = '';
    let lastWasEmpty = false;

    rl.on('line', line => {
      if (line === '' && lastWasEmpty) {
        resolve(content.trim());
      } else {
        content += line + '\n';
        lastWasEmpty = line === '';
      }
    });
  });
}

// ── CLAUDE CODE CLI ───────────────────────────────────────────────────────────

function askClaude(prompt) {
  // Write prompt to temp file
  const tmpFile = path.join(__dirname, '.tmp_prompt.txt');
  fs.writeFileSync(tmpFile, prompt, 'utf8');

  try {
    // Use Git Bash to run claude with the prompt piped from a file
    // This avoids Windows cmd.exe argument length and escaping issues
    const bashPath = 'C:\\Users\\artlptp276user\\AppData\\Local\\Programs\\Git\\bin\\bash.exe';
    const tmpFileUnix = tmpFile.replace(/\\/g, '/').replace('C:', '/c');

    const result = spawnSync(bashPath, ['-c', `claude --dangerously-skip-permissions -p "$(cat '${tmpFileUnix}')"`], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000,
      env: {
        ...process.env,
        CLAUDE_CODE_GIT_BASH_PATH: bashPath,
      },
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'Claude returned non-zero exit');
    return result.stdout.trim();
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// ── GENERATE BLOG DATA ────────────────────────────────────────────────────────

function generateBlogData(content, answers) {
  const prompt = `TASK: Transform raw content into a JSON object for a fintech blog CMS.

IMPORTANT: Your response must be ONLY a valid JSON object. No intro text, no explanation, no markdown fences. Start your response with { and end with }.

Author context:
- Target audience: ${answers.audience}
- Tone: ${answers.tone}
- Keywords to target: ${answers.keywords}
- Additional notes: ${answers.notes || 'none'}

Required JSON fields:
- title: string (compelling blog post title)
- slug: string (url-friendly, lowercase, hyphens only)
- seo_title: string (under 60 chars, include main keyword)
- seo_description: string (under 160 chars, include keywords)
- category: string (must be one of: AI Engineering, Fintech, Legacy Modernisation, AI Governance, Engineering)
- author: string (use "FinSignal Editorial")
- read_time: number (estimated minutes)
- excerpt: string (2-3 sentences summarising the post)
- tags: array of 4-5 keyword strings
- toc: array of objects with id (slug) and title fields
- body_html: string (full article as HTML, minimum 800 words, use h2 with id attributes, h3, p, ul, li, blockquote, strong. Add callout divs for key insights)

Raw content to transform:
${content}`;

  log(`\n${c.yellow}⚙️  Claude is generating your content...${c.reset}`);
  const response = askClaude(prompt);
  const jsonText = response.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Claude returned: "${jsonText.slice(0, 120)}..."`);
  }
}

// ── GENERATE CASE STUDY DATA ──────────────────────────────────────────────────

function generateCaseStudyData(content, answers) {
  const prompt = `TASK: Transform raw content into a JSON object for a fintech case study CMS.

IMPORTANT: Your response must be ONLY a valid JSON object. No intro text, no explanation, no markdown fences. Start your response with { and end with }.

Author context:
- Client type: ${answers.clientType}
- Key outcome to highlight: ${answers.outcome}
- Keywords to target: ${answers.keywords}
- Additional notes: ${answers.notes || 'none'}

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
- stats: array of objects with value and label strings
- challenge_title: string
- challenge_html: string (HTML paragraphs and lists)
- solution_title: string
- solution_html: string (HTML with full approach details)
- tech_stack: array of technology name strings
- results_title: string
- results_cards: array of objects with number and label strings
- results_html: string (HTML narrative)
- testimonial: object with quote (string or null) and attribution (string)

Raw content to transform:
${content}`;

  log(`\n${c.yellow}⚙️  Claude is generating your content...${c.reset}`);
  const response = askClaude(prompt);
  const jsonText = response.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(jsonText);
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

// ── BLOG QUESTIONS ────────────────────────────────────────────────────────────

async function askBlogQuestions() {
  const toneChoice = await askChoice('What tone should this have?', [
    'Technical — for developers and engineers',
    'Strategic — for CTOs and executives',
    'Educational — for general fintech audience',
  ]);

  const audience = await ask(`\n${bold('Who is the target audience?')}\n${c.yellow}>${c.reset} `);

  const keywords = await ask(`\n${bold('Any specific keywords to target? (comma separated)')}\n${dim('e.g. AI banking, core banking modernisation, payments infrastructure')}\n${c.yellow}>${c.reset} `);

  const notes = await ask(`\n${bold('Any other notes for Claude? (press Enter to skip)')}\n${c.yellow}>${c.reset} `);

  return {
    tone: toneChoice.value.split(' — ')[0],
    audience: audience.trim() || 'Fintech professionals',
    keywords: keywords.trim() || '',
    notes: notes.trim(),
  };
}

// ── CASE STUDY QUESTIONS ──────────────────────────────────────────────────────

async function askCaseStudyQuestions() {
  const clientType = await ask(`\n${bold('What type of client is this? (keep confidential if needed)')}\n${dim('e.g. European Neobank, UK Payment Provider, Global Bank')}\n${c.yellow}>${c.reset} `);

  const outcome = await ask(`\n${bold('What is the key outcome to highlight?')}\n${dim('e.g. 3x faster deployments, 60% cost reduction')}\n${c.yellow}>${c.reset} `);

  const keywords = await ask(`\n${bold('Any specific keywords to target? (comma separated)')}\n${dim('e.g. fintech modernisation, cloud migration, payments infrastructure')}\n${c.yellow}>${c.reset} `);

  const notes = await ask(`\n${bold('Any other notes for Claude? (press Enter to skip)')}\n${c.yellow}>${c.reset} `);

  return {
    clientType: clientType.trim() || 'Confidential',
    outcome: outcome.trim() || '',
    keywords: keywords.trim() || '',
    notes: notes.trim(),
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  // Check config
  if (!STRAPI_URL || !STRAPI_TOKEN) {
    err('Missing STRAPI_URL or STRAPI_TOKEN in .env');
    process.exit(1);
  }

  // Check Git Bash is available (required on Windows)
  if (process.platform === 'win32') {
    const bashPath = 'C:\\Users\\artlptp276user\\AppData\\Local\\Programs\\Git\\bin\\bash.exe';
    if (!fs.existsSync(bashPath)) {
      err('Git Bash not found at C:\\Users\\artlptp276user\\AppData\\Local\\Programs\\Git\\bin\\bash.exe');
      err('Please install Git from https://git-scm.com/downloads/win');
      process.exit(1);
    }
  }

  // Header
  log(`\n${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  log(`${c.bold}${c.blue}  🚀 FinSignal Content Creator${c.reset}`);
  log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  // Step 1: Content type
  const typeChoice = await askChoice('What type of content are you creating?', [
    'Blog post',
    'Case study',
  ]);
  const type = typeChoice.index === 0 ? 'blog' : 'case-study';

  // Step 2: Paste content
  const rawContent = await askMultiline('📝 Paste your content below:');

  if (!rawContent) {
    err('No content provided. Exiting.');
    process.exit(1);
  }

  log(ok(`Content received (${rawContent.length} characters)`));

  // Step 3: Ask relevant questions
  log(`\n${c.bold}${c.yellow}💬 A few quick questions to get it right:${c.reset}`);
  const answers = type === 'blog'
    ? await askBlogQuestions()
    : await askCaseStudyQuestions();

  // Step 4: Generate with Claude
  let data;
  try {
    data = type === 'blog'
      ? generateBlogData(rawContent, answers)
      : generateCaseStudyData(rawContent, answers);
  } catch (e) {
    err(`Failed to generate content: ${e.message}`);
    process.exit(1);
  }

  ok(`Content generated — "${data.title}"`);

  // Step 5: Confirm before uploading
  log(`\n${c.bold}📋 Here's what will be uploaded to Strapi:${c.reset}`);
  log(`   ${bold('Title:')}    ${data.title}`);
  log(`   ${bold('Slug:')}     ${data.slug}`);
  log(`   ${bold('Category:')} ${data.category || data.industry || ''}`);
  log(`   ${bold('Tags:')}     ${(data.tags || data.tech_stack || []).join(', ')}`);
  log(`   ${bold('SEO:')}      ${data.seo_description}`);

  const confirm = await ask(`\n${c.yellow}Upload to Strapi? (y/n)${c.reset} `);
  if (confirm.trim().toLowerCase() !== 'y') {
    log('\nCancelled. No changes made.');
    rl.close();
    return;
  }

  // Step 6: Upload to Strapi
  log(`\n${c.yellow}📤 Uploading to Strapi...${c.reset}`);
  try {
    const result = await uploadToStrapi(type, data);
    const id = result?.data?.id || result?.data?.documentId || '—';

    log(`\n${c.bold}${c.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    ok(`Successfully uploaded to Strapi!`);
    log(`   ${bold('Title:')}  ${data.title}`);
    log(`   ${bold('Slug:')}   ${data.slug}`);
    log(`   ${bold('ID:')}     ${id}`);
    log(`\n   ${c.dim}Next: run ${c.reset}${bold('node generate.js')}${c.dim} then upload output/ to Netlify${c.reset}`);
    log(`${c.bold}${c.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
  } catch (e) {
    err(`Upload failed: ${e.message}`);
  }

  rl.close();
}

main().catch(e => {
  err(e.message);
  process.exit(1);
});
