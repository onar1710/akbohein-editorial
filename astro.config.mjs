import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

// https://astro.build/config
const SITE_URL = 'https://akboheim.com';

const ensureTrailingSlash = (pathname) => (pathname.endsWith('/') ? pathname : `${pathname}/`);

const posixify = (p) => p.split(path.sep).join('/');

const getFileMtime = (filePath) => {
	try {
		return fs.statSync(filePath).mtime;
	} catch {
		return undefined;
	}
};

const projectRoot = process.cwd();
const articlesDir = path.join(projectRoot, 'src', 'content', 'articles');
const pagesDir = path.join(projectRoot, 'src', 'pages');

const lastmodByPathname = new Map();
const categoryLastmod = new Map();
const articleMtimes = [];

if (fs.existsSync(articlesDir)) {
	const articleRelPaths = globSync('**/*.{md,mdx}', { cwd: articlesDir, nodir: true });
	for (const rel of articleRelPaths) {
		const abs = path.join(articlesDir, rel);
		const mtime = getFileMtime(abs);
		if (!mtime) continue;

		const withoutExt = rel.replace(/\.(md|mdx)$/i, '');
		const pathname = ensureTrailingSlash(`/${posixify(withoutExt)}`);
		lastmodByPathname.set(pathname, mtime);
		articleMtimes.push(mtime);

		const category = posixify(withoutExt).split('/')[0];
		if (category) {
			const prev = categoryLastmod.get(category);
			if (!prev || mtime > prev) categoryLastmod.set(category, mtime);
		}
	}
}

if (fs.existsSync(pagesDir)) {
	const pageRelPaths = globSync('*.astro', { cwd: pagesDir, nodir: true });
	for (const rel of pageRelPaths) {
		const abs = path.join(pagesDir, rel);
		const mtime = getFileMtime(abs);
		if (!mtime) continue;

		const base = rel.replace(/\.astro$/i, '');
		const pathname = base === 'index' ? '/' : ensureTrailingSlash(`/${base}`);
		lastmodByPathname.set(pathname, mtime);
	}
}

const siteWideLastmod = articleMtimes.length
	? new Date(Math.max(...articleMtimes.map((d) => d.valueOf())))
	: new Date();

for (const [category, mtime] of categoryLastmod.entries()) {
	lastmodByPathname.set(ensureTrailingSlash(`/${category}`), mtime);
}

lastmodByPathname.set('/', siteWideLastmod);

export default defineConfig({
	site: SITE_URL,
	integrations: [
		sitemap({
			namespaces: { news: false, image: false, video: false, xhtml: true },
			serialize(item) {
				const url = typeof item.url === 'string' ? new URL(item.url, SITE_URL) : item.url;
				const pathname = ensureTrailingSlash(url.pathname === '/' ? '/' : url.pathname);

				const isHome = pathname === '/';
				const isCategory = pathname.split('/').filter(Boolean).length === 1;
				const isLegal = ['/privacy-policy/', '/terms-of-service/', '/cookie-policy/', '/disclaimer/'].includes(pathname);
				const isContact = pathname === '/contact/' || pathname === '/contacto/';

				const lastmod = lastmodByPathname.get(pathname) ?? siteWideLastmod;

				/** @type {import('@astrojs/sitemap').SitemapItem} */
				const out = {
					...item,
					lastmod,
					changefreq: isHome ? 'daily' : isCategory ? 'weekly' : isLegal ? 'yearly' : 'monthly',
					priority: isHome ? 1 : isCategory ? 0.8 : isLegal ? 0.2 : 0.7,
				};

				if (isContact) {
					out.links = [
						{ lang: 'en', url: new URL('/contact/', SITE_URL).href },
						{ lang: 'es', url: new URL('/contacto/', SITE_URL).href },
					];
				}

				return out;
			},
		}),
	],
});
