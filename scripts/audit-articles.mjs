import { promises as fs } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(process.cwd());
const CONTENT_ROOT = path.join(PROJECT_ROOT, 'src', 'content', 'articles');

async function* walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) yield* walk(full);
		else if (e.isFile() && full.toLowerCase().endsWith('.md')) yield full;
	}
}

function findFrontmatterEnd(lines) {
	if (lines[0]?.trim() !== '---') return -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') return i;
	}
	return -1;
}

function suspiciousLineChecks(line) {
	const issues = [];

	// Remaining markdown bold markers glued to letters (common corruption)
	if (/\p{L}\*\*[^*]+\*\*\p{L}/u.test(line)) issues.push('glued_bold');

	// Very high density of asterisks or bold markers
	const boldCount = (line.match(/\*\*/g) || []).length;
	if (boldCount >= 6) issues.push('bold_density');

	// Corrupted image fragments
	if (/\bedImage\s*:/i.test(line) || /\bfeaturedImage\s*:/i.test(line) || /\bImage\s*:\s*"/i.test(line)) {
		issues.push('image_fragment');
	}

	// Weird title-like garbage embedded
	if (/(\*\*[^*]{1,40}\*\*){4,}/.test(line)) issues.push('many_bold_tokens');

	// Non-ascii control chars except tab
	if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(line)) issues.push('control_chars');

	// Words broken by stray asterisks
	if (/\w\*\w/.test(line)) issues.push('stray_asterisk_in_word');

	return issues;
}

async function main() {
	const report = [];
	let scanned = 0;

	for await (const file of walk(CONTENT_ROOT)) {
		scanned++;
		const text = await fs.readFile(file, 'utf8');
		const lines = text.split(/\r?\n/);
		const fmEnd = findFrontmatterEnd(lines);
		const start = fmEnd >= 0 ? fmEnd + 1 : 0;

		const fileIssues = [];
		for (let i = start; i < Math.min(lines.length, start + 250); i++) {
			const line = lines[i];
			if (!line || line.trim() === '') continue;
			const issues = suspiciousLineChecks(line);
			if (issues.length) {
				fileIssues.push({ line: i + 1, issues, text: line.slice(0, 200) });
				if (fileIssues.length >= 12) break;
			}
		}

		if (fileIssues.length) {
			report.push({ file: path.relative(PROJECT_ROOT, file), matches: fileIssues });
		}
	}

	process.stdout.write(
		JSON.stringify(
			{
				scanned,
				filesWithIssues: report.length,
				report,
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
