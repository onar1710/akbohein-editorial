import fs from 'node:fs';
import path from 'node:path';

function loadEnvFromFileIfPresent() {
  const candidates = ['.env', '.ENV'];
  for (const filename of candidates) {
    const envPath = path.join(process.cwd(), filename);
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
        const eqIndex = withoutExport.indexOf('=');
        if (eqIndex === -1) continue;
        const key = withoutExport.slice(0, eqIndex).trim();
        let value = withoutExport.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && !(key in process.env)) process.env[key] = value;
      }
      return;
    } catch {
      return;
    }
  }
}

loadEnvFromFileIfPresent();

const token = process.env.REPLICATE_API_TOKEN;
if (!token) {
  console.error('Error: REPLICATE_API_TOKEN no está configurado (usa .env o variable de entorno).');
  process.exit(1);
}

const MODEL = 'black-forest-labs/flux-schnell';
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const CONTENT_ARTICLES_DIR = path.resolve(process.cwd(), 'src', 'content', 'articles');
const PAGES_DIR = path.resolve(process.cwd(), 'src', 'pages');

function buildFallbackPrompt(fileBase, kind, meta) {
  const lower = fileBase.toLowerCase();
  const title = String(meta?.title || '').trim();
  const category = String(meta?.category || '').trim();
  const tags = String(meta?.tags || '').trim();

  const basePrompt = [
    'Professional blog hero image',
    'clean modern editorial illustration or realistic photography style',
    'high quality, sharp, well-lit',
    'no text, no letters, no words, no typography, no captions',
    'no logos, no watermarks, no signatures, no branding',
    'no readable UI text, no numbers, no labels',
    '16:9',
  ].join(', ');

  const topicBits = [
    title ? `topic: ${title}` : '',
    category ? `section: ${category}` : '',
    tags ? `keywords: ${tags}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  if (kind === 'hero') return `${basePrompt}${topicBits ? `, ${topicBits}` : ''}, editorial mood, rich but subtle composition`;
  return `${basePrompt}${topicBits ? `, ${topicBits}` : ''}, editorial mood, subtle composition`;
}

function getPromptForFileBase(fileBase, kind, meta) {
  return buildFallbackPrompt(fileBase, kind, meta);
}

function walkFiles(rootDir) {
  const results = [];
  if (!fs.existsSync(rootDir)) return results;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      results.push(fullPath);
    }
  }
  return results;
}

function parseFrontmatter(markdown) {
  const trimmed = String(markdown || '');
  if (!trimmed.startsWith('---')) return null;
  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) return null;
  const raw = trimmed.slice(3, endIdx).trim();
  const meta = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
    meta[key] = value;
  }
  return meta;
}

function collectImageTargetsFromBlogContent() {
  const map = new Map();
  const scanRoots = [CONTENT_ARTICLES_DIR, PAGES_DIR];
  for (const root of scanRoots) {
    for (const filePath of walkFiles(root)) {
    const lower = filePath.toLowerCase();
    if (!(lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.astro'))) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const meta = parseFrontmatter(content) || {};
    const fmImage = String(meta.featuredImage || meta.heroImage || meta.image || '').trim();
    const fmMatch = fmImage.match(/^\/(imagen-article|images)\/([a-z0-9-]+)\/([a-z0-9-]+)\.(png|jpg|jpeg|webp)$/i);
    if (fmMatch) {
      const dir = fmMatch[1].toLowerCase();
      const subdir = fmMatch[2].toLowerCase();
      const base = fmMatch[3].toLowerCase();
      const ext = fmMatch[4].toLowerCase();
      const rel = `${dir}/${subdir}/${base}.${ext}`;
      if (!map.has(rel)) map.set(rel, { kind: 'hero', meta });
    }

    const inlineRegex = /\/(images|imagen-article)\/([a-z0-9-]+)\/([a-z0-9-]+)\.(png|jpg|jpeg|webp)/gi;
    for (const match of content.matchAll(inlineRegex)) {
      const dir = (match[1] || '').toLowerCase();
      const subdir = (match[2] || '').toLowerCase();
      const base = (match[3] || '').toLowerCase();
      const ext = (match[4] || '').toLowerCase();
      if (!dir || !subdir || !base || !ext) continue;
      const rel = `${dir}/${subdir}/${base}.${ext}`;
      if (!map.has(rel)) map.set(rel, { kind: 'inline', meta });
    }
  }
  }
  return map;
}

const targets = collectImageTargetsFromBlogContent();
const items = [...targets.entries()].map(([relativePath, info]) => {
  const dot = relativePath.lastIndexOf('.');
  const fileBase = dot === -1 ? relativePath : relativePath.slice(0, dot);
  const ext = dot === -1 ? 'png' : relativePath.slice(dot + 1).toLowerCase();
  const outputFormat = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'webp' ? 'webp' : 'png';
  const promptOverride = info?.meta?.aiImagePrompt || info?.meta?.imagePrompt || '';
  return {
    relativePath,
    outputFormat,
    prompt: String(promptOverride).trim() || getPromptForFileBase(fileBase, info?.kind || 'hero', info?.meta),
  };
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let cachedModelVersionId;

async function getLatestModelVersionId(model) {
  if (cachedModelVersionId) return cachedModelVersionId;
  const [owner, name] = model.split('/');
  if (!owner || !name) throw new Error(`Invalid model id: ${model}`);

  const res = await fetch(`https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Replicate model lookup failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }

  const json = await res.json();
  const versionId = json?.latest_version?.id;
  if (!versionId) throw new Error('Could not resolve latest_version.id for model');
  cachedModelVersionId = versionId;
  return versionId;
}

async function replicateCreatePrediction({ prompt, outputFormat = 'png' }) {
  const version = await getLatestModelVersionId(MODEL);
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version,
        input: {
          prompt,
          num_outputs: 1,
          aspect_ratio: '16:9',
          output_format: outputFormat,
          output_quality: 100,
        },
      }),
    });

    if (res.status === 429) {
      let retryAfterSeconds = 10;
      const headerRetry = res.headers.get('retry-after');
      if (headerRetry && Number.isFinite(Number(headerRetry))) retryAfterSeconds = Number(headerRetry);
      try {
        const body = await res.json();
        if (Number.isFinite(Number(body?.retry_after))) retryAfterSeconds = Number(body.retry_after);
      } catch {
        // ignore
      }
      await sleep((retryAfterSeconds + 1) * 1000);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Replicate create prediction failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`
      );
    }

    return res.json();
  }

  throw new Error('Replicate create prediction failed: exceeded retries');
}

async function replicateGetPrediction(id) {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Replicate get prediction failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }

  return res.json();
}

async function waitForPrediction(id) {
  let delayMs = 1200;
  for (let i = 0; i < 120; i++) {
    const pred = await replicateGetPrediction(id);
    if (pred.status === 'succeeded') return pred;
    if (pred.status === 'failed' || pred.status === 'canceled') {
      const detail = pred?.error ? ` - ${pred.error}` : '';
      throw new Error(`Prediction ${pred.status}${detail}`);
    }
    await sleep(delayMs);
    delayMs = Math.min(Math.round(delayMs * 1.25), 4000);
  }
  throw new Error('Prediction timeout');
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
}

if (items.length === 0) {
  console.log('No se encontraron imágenes objetivo en el contenido (busca /imagen-article/... o /images/...).');
  process.exit(0);
}

for (const item of items) {
  const outPath = path.join(PUBLIC_DIR, item.relativePath);
  if (fs.existsSync(outPath)) {
    console.log(`SKIP: ${path.relative(process.cwd(), outPath)}`);
    continue;
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  console.log(`Generando: ${item.relativePath}`);
  const created = await replicateCreatePrediction({ prompt: item.prompt, outputFormat: item.outputFormat });
  const predictionId = created?.id;
  if (!predictionId) throw new Error('Replicate did not return a prediction id');
  const done = await waitForPrediction(predictionId);
  const output = done?.output;
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (!imageUrl) throw new Error('Replicate did not return an image URL');
  await downloadToFile(imageUrl, outPath);
  console.log(`OK: ${path.relative(process.cwd(), outPath)}`);
  await sleep(9000);
}
