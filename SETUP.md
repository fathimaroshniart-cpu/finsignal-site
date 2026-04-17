# FinSignal — Setup Guide

## Step 1 — Create a Strapi Cloud account
1. Go to https://cloud.strapi.io
2. Sign up (free tier available)
3. Click **Create project** → choose a name e.g. `finsignal`
4. Wait ~2 minutes for it to deploy

## Step 2 — Create the Blog content type
In your Strapi Cloud admin (https://your-project.api.strapi.io/admin):

1. Go to **Content-Type Builder** → **Create new collection type**
2. Name it: `Blog`
3. Add these fields:

| Field name       | Type        |
|------------------|-------------|
| title            | Text        |
| slug             | UID (from title) |
| seo_title        | Text        |
| seo_description  | Text        |
| category         | Enumeration: AI Engineering, Fintech, Legacy Modernisation, AI Governance, Engineering |
| author           | Text        |
| read_time        | Number      |
| excerpt          | Text        |
| tags             | JSON        |
| toc              | JSON        |
| body_html        | Rich Text   |

4. Click **Save** and wait for server to restart

## Step 3 — Create the Case Study content type
1. **Create new collection type** → Name: `Case Study`
2. Add these fields:

| Field name       | Type        |
|------------------|-------------|
| title            | Text        |
| slug             | UID (from title) |
| seo_title        | Text        |
| seo_description  | Text        |
| subtitle         | Text        |
| client_name      | Text        |
| industry         | Text        |
| service          | Text        |
| timeline         | Text        |
| stats            | JSON        |
| challenge_title  | Text        |
| challenge_html   | Rich Text   |
| solution_title   | Text        |
| solution_html    | Rich Text   |
| tech_stack       | JSON        |
| results_title    | Text        |
| results_cards    | JSON        |
| results_html     | Rich Text   |
| testimonial      | JSON        |

3. Click **Save**

## Step 4 — Enable public API access
1. Go to **Settings** → **Roles** → **Public**
2. Under **Blog**: check `find` and `findOne`
3. Under **Case-study**: check `find` and `findOne`
4. Click **Save**

## Step 5 — Create an API Token
1. Go to **Settings** → **API Tokens** → **Create new API Token**
2. Name: `finsignal-generate`
3. Token type: **Read-only**
4. Click **Save** and copy the token

## Step 6 — Configure your .env
```bash
cp .env.example .env
```
Fill in:
```
STRAPI_URL=https://your-project.api.strapi.io
STRAPI_TOKEN=your-token-here
```

## Step 7 — Install & run
```bash
npm install
node generate.js
```

## Day-to-day workflow
1. Log into Strapi Cloud admin
2. Go to **Blog** or **Case Study** → **Create new entry**
3. Fill in the fields and click **Publish**
4. In your terminal: `node generate.js`
5. Upload the `output/` folder contents to your server
