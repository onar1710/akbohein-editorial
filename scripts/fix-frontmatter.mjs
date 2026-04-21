import { promises as fs } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTENT_ROOT = path.join(PROJECT_ROOT, 'src', 'content', 'articles');

const KNOWN_CATEGORIES = new Set(['books', 'culture', 'education', 'literature', 'policy', 'society']);

const JUNK_BOLD_WORDS = new Set([
	'Editorial',
	'Understand',
	'Understanding',
	'Learn',
	'Walk',
	'Recognizing',
	'Effective',
	'Leaders',
	'Leader',
	'Students',
	'Schools',
	'Families',
	'People',
	'Different',
	'Culture',
	'Education',
	'Literature',
	'Policy',
	'Society',
	'Books',
	'Global',
	'Local',
]);

async function* walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) yield* walk(full);
		else if (e.isFile() && full.toLowerCase().endsWith('.md')) yield full;
	}
}

function inferCategoryFromPath(filePath) {
	const rel = path.relative(CONTENT_ROOT, filePath).replaceAll('\\', '/');
	const top = rel.split('/')[0]?.toLowerCase();
	if (top && KNOWN_CATEGORIES.has(top)) return top;
	return null;
}

function extractFirstMatching(str, re) {
	const m = str.match(re);
	return m ? m[0] : null;
}

function sanitizeFrontmatterLine(line) {
	// Remove common markdown noise inserted into YAML frontmatter.
	let out = line;

	// If there is markdown bold fragments, keep only the YAML-ish part.
	if (out.includes('**')) {
		out = out.split('**')[0];
	}

	// Normalize stray carriage returns.
	out = out.replace(/\r/g, '');

	// If a line contains a known key then junk, keep just `key: value`.
	// Special-case date: keep yyyy-mm-dd.
	if (/^\s*date\s*:/i.test(out)) {
		const date = extractFirstMatching(line, /\d{4}-\d{2}-\d{2}/);
		if (date) return `date: ${date}`;
		return out.trimEnd();
	}

	// Fix broken `...Image:` keys by turning them into featuredImage.
	if (/Image\s*:/i.test(out) && !/^\s*(featuredImage|heroImage)\s*:/i.test(out)) {
		// keep the part from Image: onward
		const idx = out.toLowerCase().indexOf('image:');
		if (idx >= 0) {
			const rest = out.slice(idx + 'image:'.length);
			out = `featuredImage:${rest}`;
		}
	}

	return out.trimEnd();
}

function extractFeaturedImageFromLine(line) {
	const m = line.match(/\/imagen-article\/[A-Za-z0-9/_-]+\.(?:jpe?g|png|webp|gif|svg)/i);
	return m ? m[0] : null;
}

function normalizeFeaturedImageValue(url) {
	// Ensure leading slash
	if (!url) return null;
	return url.startsWith('/') ? url : `/${url}`;
}

function fixFeaturedImageLine(line) {
	const m = line.match(/^(\s*featuredImage:\s*")([^"\r\n]*?\.(?:jpe?g|png|webp|gif|svg))("?)(.*)$/i);
	if (!m) return { line, changed: false };

	const prefix = m[1];
	const url = m[2];
	const hasClosingQuote = m[3] === '"';
	const rest = m[4] ?? '';

	// If there is extra junk after the URL (common in this repo), strip it.
	// Also ensure closing quote exists.
	if (rest.trim().length > 0 || !hasClosingQuote) {
		return { line: `${prefix}${url}"`, changed: true };
	}

	return { line, changed: false };
}

function fixYamlAliasValue(line) {
	// YAML treats unquoted values starting with * as an alias. Convert to plain string.
	const m = line.match(/^(\s*[A-Za-z0-9_-]+:\s*)\*(.+)$/);
	if (!m) return { line, changed: false };
	const keyPrefix = m[1];
	const value = m[2].trim();
	return { line: `${keyPrefix}"${value.replace(/"/g, '\\"')}"`, changed: true };
}

function isFrontmatterKeyLine(line) {
	return /^\s*[A-Za-z0-9_-]+\s*:\s*.*$/.test(line);
}

function ensureFrontmatterClosed(lines) {
	if (lines.length === 0) return { lines, changed: false };
	if (lines[0].trim() !== '---') return { lines, changed: false };

	// If already has a closing --- within the first 200 lines, we assume it's fine.
	for (let i = 1; i < Math.min(lines.length, 200); i++) {
		if (lines[i].trim() === '---') {
			return { lines, changed: false };
		}
	}

	// No closing delimiter found. Insert before first non-frontmatter line.
	let insertAt = 1;
	for (let i = 1; i < lines.length; i++) {
		const t = lines[i].trim();
		if (t === '') {
			insertAt = i + 1;
			continue;
		}
		if (isFrontmatterKeyLine(lines[i])) {
			insertAt = i + 1;
			continue;
		}
		insertAt = i;
		break;
	}

	const out = [...lines];
	out.splice(insertAt, 0, '---', '');
	return { lines: out, changed: true };
}

function parseFrontmatter(lines) {
	// Assumes lines[0] is ---
	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			end = i;
			break;
		}
	}
	if (end === -1) return { fmLines: lines.slice(1), endIndex: -1 };
	return { fmLines: lines.slice(1, end), endIndex: end };
}

function toFrontmatterMap(fmLines) {
	const map = new Map();
	for (const raw of fmLines) {
		const line = raw.trim();
		if (!line) continue;
		const idx = line.indexOf(':');
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		// If the value begins with a quote but doesn't end with it, treat it as broken and remove the leading quote.
		if ((value.startsWith('"') && !value.endsWith('"')) || (value.startsWith("'") && !value.endsWith("'"))) {
			value = value.slice(1).trim();
		}
		map.set(key, value);
	}
	return map;
}

function normalizeScalarValue(raw) {
	if (raw === undefined || raw === null) return '';
	let v = String(raw).replace(/\r/g, '').trim();
	// Strip enclosing quotes if they are balanced
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		v = v.slice(1, -1);
	}
	// If there is still a dangling leading quote, drop it.
	if (v.startsWith('"') || v.startsWith("'")) v = v.slice(1).trim();
	return v;
}

function rebuildFrontmatterLines(map) {
	const order = ['title', 'description', 'date', 'category', 'author', 'featuredImage', 'heroImage', 'tags'];
	const out = [];
	for (const k of order) {
		if (!map.has(k)) continue;
		const v = map.get(k);
		if (v === undefined || v === null || String(v).trim() === '') continue;
		// Keep quotes for strings unless already quoted
		if (k === 'date') {
			out.push(`date: ${String(v).replace(/^"|"$/g, '')}`);
			continue;
		}
		// Always normalize + re-quote common scalar string keys to avoid broken YAML (e.g. author: "Editorial)
		if (k === 'title' || k === 'description' || k === 'category' || k === 'author' || k === 'featuredImage' || k === 'heroImage') {
			const n = normalizeScalarValue(v);
			out.push(`${k}: "${n.replace(/"/g, '\\"')}"`);
			continue;
		}
		const raw = String(v);
		if (raw.startsWith('[') || raw.startsWith('{')) {
			out.push(`${k}: ${raw}`);
		} else {
			const n = normalizeScalarValue(raw);
			out.push(`${k}: "${n.replace(/"/g, '\\"')}"`);
		}
	}

	// Append any other keys not in order
	for (const [k, v] of map.entries()) {
		if (order.includes(k)) continue;
		const raw = String(v);
		if (raw.startsWith('[') || raw.startsWith('{')) {
			out.push(`${k}: ${raw}`);
		} else {
			const n = normalizeScalarValue(raw);
			out.push(`${k}: "${n.replace(/"/g, '\\"')}"`);
		}
	}

	return out;
}

function cleanCorruptedFirstBodyLine(lines, startIndex) {
	// Removes common corrupted line directly after frontmatter which contains image fragments.
	let idx = startIndex;
	while (idx < lines.length && lines[idx].trim() === '') idx++;
	if (idx >= lines.length) return { lines, changed: false };
	const l = lines[idx];
	if (/edImage\s*:/i.test(l) || /featuredImage\s*:/i.test(l) || /Image\s*:/i.test(l)) {
		const out = [...lines];
		out.splice(idx, 1);
		return { lines: out, changed: true };
	}
	return { lines, changed: false };
}

function stripBoldMarkersGluedToLetters(line) {
	// Fix patterns like edu**cation** -> education (remove ** markers, keep text).
	// Also handles **word**ing -> wording when glued.
	let out = line;
	out = out.replace(/([\p{L}\p{N}])\*\*([^*]+?)\*\*([\p{L}\p{N}])/gu, '$1$2$3');
	out = out.replace(/([\p{L}\p{N}])\*\*([^*]+?)\*\*/gu, '$1$2');
	out = out.replace(/\*\*([^*]+?)\*\*([\p{L}\p{N}])/gu, '$1$2');
	return out;
}

function fixStrayAsterisksInsideWords(line) {
	// Fix patterns like Homer*Iliad, Freytag*Pyramid, How Is*Law
	// Prefer inserting a space when * separates two words.
	let out = line;
	// letter/digit + * + Uppercase => insert space
	out = out.replace(/([\p{L}\p{N}])\*([\p{Lu}])/gu, '$1 $2');
	// letter/digit + * + letter/digit => remove *
	out = out.replace(/([\p{L}\p{N}])\*([\p{L}\p{N}])/gu, '$1$2');
	// multiple stray asterisks inside tokens
	out = out.replace(/([\p{L}\p{N}])\*{2,}([\p{L}\p{N}])/gu, '$1$2');
	return out;
}

function removeInjectedJunkBoldWords(line) {
	// Remove tokens like **Editorial** inserted mid-sentence.
	return line.replace(/\*\*([^*]+?)\*\*/g, (m, inner) => {
		const txt = String(inner).trim();
		if (JUNK_BOLD_WORDS.has(txt)) return '';
		return m;
	});
}

function dropCorruptedImageFragmentLine(line) {
	// Drop lines that are clearly conversion junk.
	if (/\bedImage\s*:/i.test(line)) return '';
	if (/\bfeaturedImage\s*:/i.test(line)) return '';
	if (/\bImage\s*:\s*"/i.test(line)) return '';
	// Lines with extremely high bold density are usually junk (from corrupted conversions)
	const boldCount = (line.match(/\*\*/g) || []).length;
	if (boldCount >= 10 && line.length < 400) return '';
	return line;
}

function normalizeSpaces(line) {
	return line
		.replace(/\s{2,}/g, ' ')
		.replace(/\s+([,.;:!?])/g, '$1')
		.trimEnd();
}

function cleanBodyLines(bodyLines) {
	let changed = false;
	const out = [];
	for (let i = 0; i < bodyLines.length; i++) {
		let line = bodyLines[i];
		const original = line;

		line = dropCorruptedImageFragmentLine(line);
		line = stripBoldMarkersGluedToLetters(line);
		line = fixStrayAsterisksInsideWords(line);
		line = removeInjectedJunkBoldWords(line);
		line = normalizeSpaces(line);

		if (line !== original) changed = true;
		// Keep blank lines; just skip lines that were dropped completely.
		if (line === '' && original.trim() !== '') {
			// dropped
			continue;
		}
		out.push(line);
	}
	return { lines: out, changed };
}

function fixFileText(text, filePath) {
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	let lines = text.split(/\r?\n/);
	let changed = false;

	// Only attempt YAML fixes if file starts with frontmatter.
	if (lines[0]?.trim() === '---') {
		// Ensure it has a closing delimiter first so we can parse reliably.
		const c = ensureFrontmatterClosed(lines);
		if (c.changed) {
			lines = c.lines;
			changed = true;
		}

		const { fmLines, endIndex } = parseFrontmatter(lines);
		let sanitizedFm = fmLines.map((l) => sanitizeFrontmatterLine(l));
		if (sanitizedFm.join('\n') !== fmLines.join('\n')) changed = true;

		// Per-line fixes inside FM
		let featuredFromAny = null;
		for (let i = 0; i < sanitizedFm.length; i++) {
			const a = fixFeaturedImageLine(sanitizedFm[i]);
			if (a.changed) {
				sanitizedFm[i] = a.line;
				changed = true;
			}

			const b = fixYamlAliasValue(sanitizedFm[i]);
			if (b.changed) {
				sanitizedFm[i] = b.line;
				changed = true;
			}

			featuredFromAny = featuredFromAny ?? extractFeaturedImageFromLine(sanitizedFm[i]);
		}

		const fmMap = toFrontmatterMap(sanitizedFm);

		// Ensure required-ish keys
		if (!fmMap.has('category') || String(fmMap.get('category') ?? '').trim() === '') {
			const cat = inferCategoryFromPath(filePath);
			if (cat) {
				fmMap.set('category', cat);
				changed = true;
			}
		}
		if (!fmMap.has('author') || String(fmMap.get('author') ?? '').trim() === '') {
			fmMap.set('author', 'Editorial');
			changed = true;
		}
		if (!fmMap.has('featuredImage') || String(fmMap.get('featuredImage') ?? '').trim() === '') {
			const url = normalizeFeaturedImageValue(featuredFromAny);
			if (url) {
				fmMap.set('featuredImage', url);
				changed = true;
			}
		}

		// Normalize featuredImage path if present anywhere
		if (fmMap.has('featuredImage')) {
			const raw = String(fmMap.get('featuredImage'));
			const u = extractFeaturedImageFromLine(raw) ?? raw.replace(/^"|"$/g, '');
			const n = normalizeFeaturedImageValue(u);
			if (n && n !== raw.replace(/^"|"$/g, '')) {
				fmMap.set('featuredImage', n);
				changed = true;
			}
		}

		// Rebuild FM with consistent ordering and quoting.
		const rebuilt = rebuildFrontmatterLines(fmMap);
		const newLines = ['---', ...rebuilt, '', '---'];

		if (endIndex !== -1) {
			// Replace existing FM block
			lines.splice(0, endIndex + 1, ...newLines);
			changed = true;
		}

		// Remove the common corrupted first body line after FM.
		const cleanedBody = cleanCorruptedFirstBodyLine(lines, newLines.length);
		if (cleanedBody.changed) {
			lines = cleanedBody.lines;
			changed = true;
		}

		// Clean body text in batch (remove glued **...**, injected bold junk words, and corrupted fragment lines).
		const bodyStart = newLines.length;
		const cleaned = cleanBodyLines(lines.slice(bodyStart));
		if (cleaned.changed) {
			lines = [...lines.slice(0, bodyStart), ...cleaned.lines];
			changed = true;
		}
	}

	return { text: lines.join(eol), changed };
}

async function main() {
	let scanned = 0;
	let modified = 0;
	const modifiedFiles = [];

	for await (const file of walk(CONTENT_ROOT)) {
		scanned++;
		const original = await fs.readFile(file, 'utf8');
		const fixed = fixFileText(original, file);
		if (!fixed.changed) continue;

		await fs.writeFile(file, fixed.text, 'utf8');
		modified++;
		modifiedFiles.push(path.relative(PROJECT_ROOT, file));
	}

	process.stdout.write(
		JSON.stringify(
			{
				scanned,
				modified,
				modifiedFiles,
			},
			null,
			2,
		) + '\n',
	);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
