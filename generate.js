/**
 * FinSignal — Static Site Generator
 * -----------------------------------
 * Fetches all published blogs and case studies from Strapi Cloud,
 * then builds fully-styled HTML pages into the output/ folder.
 *
 * Usage:
 *   node generate.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import 'dotenv/config';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const TMPL_DIR   = path.join(__dirname, 'templates');

const STRAPI_URL   = process.env.STRAPI_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

// ── HELPERS ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TMPL_DIR, name), 'utf8');
}

function writeFile(relPath, content) {
  const full = path.join(OUTPUT_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log(`   ✅ ${relPath}`);
}

// ── STRAPI FETCH ──────────────────────────────────────────────────────────────

async function strapiGet(endpoint) {
  const url = `${STRAPI_URL}/api/${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Strapi request failed: ${res.status} ${url}`);
  return res.json();
}

// ── BUILD BLOG POST PAGE ──────────────────────────────────────────────────────

function buildBlogPost(post) {
  const d = post.attributes || post; // Strapi v5 returns flat objects (no attributes)
  const slug = d.slug || slugify(d.title);
  const year = new Date().getFullYear();
  const date = formatDate(d.publishedAt || d.createdAt);

  const tags = (d.tags || [])
    .map(t => `<span class="tag">${t}</span>`).join(' ');

  const toc = (d.toc || [])
    .map(item => `<li><a href="#${item.id}">${item.title}</a></li>`).join('\n');

  const html = readTemplate('blog-post.html')
    .replace(/{{SEO_TITLE}}/g,     d.seo_title || d.title)
    .replace(/{{SEO_DESCRIPTION}}/g, d.seo_description || d.excerpt || '')
    .replace(/{{CANONICAL_URL}}/g, `${STRAPI_URL}/blog/${slug}.html`)
    .replace(/{{CATEGORY}}/g,      d.category || 'Insights')
    .replace(/{{TITLE}}/g,         d.title)
    .replace(/{{AUTHOR}}/g,        d.author || 'FinSignal Editorial')
    .replace(/{{DATE}}/g,          date)
    .replace(/{{READ_TIME}}/g,     d.read_time || '5')
    .replace(/{{TAGS}}/g,          tags)
    .replace(/{{TOC}}/g,           toc)
    .replace(/{{BODY}}/g,          d.body_html || `<p>${d.body || ''}</p>`)
    .replace(/{{YEAR}}/g,          year);

  writeFile(`blog/${slug}.html`, html);
  return { slug, title: d.title, excerpt: d.excerpt || '', category: d.category || 'Insights', date, read_time: d.read_time || 5 };
}

// ── BUILD BLOG CARD HTML ──────────────────────────────────────────────────────

function buildBlogCard(post, isFeatured = false) {
  if (isFeatured) {
    return `
    <div class="featured-post">
      <div class="featured-image">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="0.8">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
        </svg>
      </div>
      <div class="featured-content">
        <span class="post-category">${post.category}</span>
        <h2>${post.title}</h2>
        <p>${post.excerpt}</p>
        <div class="post-meta">
          <span>${post.date}</span>
          <span class="sep"></span>
          <span>${post.read_time} min read</span>
        </div>
        <a href="blog/${post.slug}.html" class="read-more">Read article →</a>
      </div>
    </div>`;
  }

  return `
    <a href="blog/${post.slug}.html" class="post-card">
      <div class="card-image">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
        </svg>
        <div class="card-image-label"><span class="post-category">${post.category}</span></div>
      </div>
      <div class="card-body">
        <h3>${post.title}</h3>
        <p>${post.excerpt}</p>
        <div class="card-footer">
          <span class="card-date">${post.date}</span>
          <span class="card-read">${post.read_time} min →</span>
        </div>
      </div>
    </a>`;
}

// ── BUILD CASE STUDY CARD HTML ────────────────────────────────────────────────

function buildCaseStudyCard(cs) {
  const stat = cs.stats?.[0];
  return `
    <a href="case-studies/${cs.slug}.html" class="cs-card">
      <span class="cs-tag">${cs.industry || 'Fintech'}</span>
      <h3>${cs.title}</h3>
      <p>${cs.subtitle || ''}</p>
      ${stat ? `<div><div class="cs-stat">${stat.value}</div><div class="cs-stat-label">${stat.label}</div></div>` : ''}
    </a>`;
}

// ── BUILD CASE STUDY PAGE ─────────────────────────────────────────────────────

function buildCaseStudyPage(cs) {
  const d = cs.attributes || cs; // Strapi v5 returns flat objects (no attributes)
  const slug = d.slug || slugify(d.title);
  const year = new Date().getFullYear();

  const stats = (d.stats || [])
    .map(s => `<div class="stat-item"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`)
    .join('');

  const techTags = (d.tech_stack || [])
    .map(t => `<span class="tech-tag">${t}</span>`).join(' ');

  const resultsCards = (d.results_cards || [])
    .map(r => `<div class="result-card"><div class="number">${r.number}</div><div class="label">${r.label}</div></div>`)
    .join('');

  const testimonial = d.testimonial?.quote
    ? `<div class="testimonial"><blockquote>"${d.testimonial.quote}"</blockquote><cite>— ${d.testimonial.attribution}</cite></div>`
    : '';

  // Use the panasa-cms case study template as base
  const template = fs.readFileSync(path.join(__dirname, '..', 'panasa-cms', 'templates', 'case-study.html'), 'utf8');

  const html = template
    .replace(/{{SEO_TITLE}}/g,       d.seo_title || d.title)
    .replace(/{{SEO_DESCRIPTION}}/g, d.seo_description || d.subtitle || '')
    .replace(/{{SLUG}}/g,            slug)
    .replace(/{{TITLE}}/g,           d.title)
    .replace(/{{SUBTITLE}}/g,        d.subtitle || '')
    .replace(/{{STATS}}/g,           stats)
    .replace(/{{CLIENT_NAME}}/g,     d.client_name || 'Confidential')
    .replace(/{{INDUSTRY}}/g,        d.industry || '')
    .replace(/{{SERVICE}}/g,         d.service || '')
    .replace(/{{TIMELINE}}/g,        d.timeline || '')
    .replace(/{{CHALLENGE_TITLE}}/g, d.challenge_title || 'The Challenge')
    .replace(/{{CHALLENGE_BODY}}/g,  d.challenge_html || '')
    .replace(/{{SOLUTION_TITLE}}/g,  d.solution_title || 'Our Approach')
    .replace(/{{SOLUTION_BODY}}/g,   d.solution_html || '')
    .replace(/{{TECH_TAGS}}/g,       techTags)
    .replace(/{{RESULTS_TITLE}}/g,   d.results_title || 'The Results')
    .replace(/{{RESULTS_CARDS}}/g,   resultsCards)
    .replace(/{{RESULTS_BODY}}/g,    d.results_html || '')
    .replace(/{{TESTIMONIAL}}/g,     testimonial)
    .replace(/{{YEAR}}/g,            year);

  writeFile(`case-studies/${slug}.html`, html);
  return {
    slug, title: d.title, subtitle: d.subtitle || '',
    industry: d.industry || 'Fintech', stats: d.stats || [],
  };
}

// ── UPDATE INDEX.HTML ─────────────────────────────────────────────────────────

function updateIndex(blogCards, csCards) {
  const indexPath = path.join(OUTPUT_DIR, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Replace featured post + grid
  if (blogCards.length > 0) {
    const featured = buildBlogCard(blogCards[0], true);
    const grid = blogCards.slice(1).map(p => buildBlogCard(p, false)).join('\n');

    html = html
      .replace(/<div id="featured-post">[\s\S]*?<\/div>/,
        `<div id="featured-post">${featured}</div>`)
      .replace(/<div class="posts-grid" id="posts-grid"><\/div>/,
        `<div class="posts-grid" id="posts-grid">${grid}</div>`);
  }

  // Replace case studies grid
  if (csCards.length > 0) {
    const csGrid = csCards.map(cs => buildCaseStudyCard(cs)).join('\n');
    html = html.replace(
      /<div class="cs-grid" id="cs-grid">[\s\S]*?<\/div>/,
      `<div class="cs-grid" id="cs-grid">${csGrid}</div>`
    );
  }

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('   ✅ index.html updated');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!STRAPI_URL || !STRAPI_TOKEN) {
    console.error('❌  Missing STRAPI_URL or STRAPI_TOKEN in .env');
    console.error('   Copy .env.example → .env and fill in your Strapi Cloud details.');
    process.exit(1);
  }

  console.log('\n🚀 FinSignal — Generating site from Strapi Cloud\n');

  // ── BLOGS ──
  console.log('📝 Fetching blogs...');
  const blogsRes = await strapiGet('blogs?populate=*&sort=publishedAt:desc&filters[publishedAt][$notNull]=true');
  const blogs = blogsRes.data || [];
  console.log(`   Found ${blogs.length} blog post(s)\n`);

  console.log('📄 Building blog pages...');
  const blogMeta = blogs.map(post => buildBlogPost(post));

  // ── CASE STUDIES ──
  console.log('\n📊 Fetching case studies...');
  const csRes = await strapiGet('case-studies?populate=*&sort=publishedAt:desc&filters[publishedAt][$notNull]=true');
  const caseStudies = csRes.data || [];
  console.log(`   Found ${caseStudies.length} case study(ies)\n`);

  console.log('📄 Building case study pages...');
  const csMeta = caseStudies.map(cs => buildCaseStudyPage(cs));

  // ── INDEX ──
  console.log('\n🏠 Updating homepage...');
  updateIndex(blogMeta, csMeta);

  console.log(`\n✨ Done! ${blogMeta.length} blog(s) + ${csMeta.length} case study(ies) generated.\n`);
  console.log('   Output folder: output/');
  console.log('   Upload the contents of output/ to your server to go live.\n');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
