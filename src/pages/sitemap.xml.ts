import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { CATEGORIES } from '../site';

const escapeXml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

const ensureTrailingSlash = (pathname: string) => (pathname.endsWith('/') ? pathname : `${pathname}/`);

const formatLastmod = (date: Date) => date.toISOString();

type UrlEntry = {
	loc: string;
	lastmod?: string;
	changefreq?: string;
	priority?: string;
	alternates?: { hreflang: string; href: string }[];
};

export const GET: APIRoute = async ({ site }) => {
	const base = site ? site.origin : 'https://akboheim.com';
	const now = new Date();

	const articles = (await getCollection('articles')).slice().sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

	const lastArticleDate = articles[0]?.data.date ?? now;

	const urls: UrlEntry[] = [];

	urls.push({
		loc: `${base}/`,
		lastmod: formatLastmod(lastArticleDate),
		changefreq: 'daily',
		priority: '1.0',
	});

	const staticPages: UrlEntry[] = [
		{ loc: `${base}/about-us/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'monthly', priority: '0.6' },
		{ loc: `${base}/contact/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'yearly', priority: '0.4' },
		{ loc: `${base}/contacto/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'yearly', priority: '0.4' },
		{ loc: `${base}/testimonials/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'monthly', priority: '0.4' },
		{ loc: `${base}/privacy-policy/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'yearly', priority: '0.2' },
		{ loc: `${base}/terms-of-service/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'yearly', priority: '0.2' },
		{ loc: `${base}/cookie-policy/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'yearly', priority: '0.2' },
		{ loc: `${base}/disclaimer/`, lastmod: formatLastmod(lastArticleDate), changefreq: 'yearly', priority: '0.2' },
	];

	urls.push(...staticPages);

	for (const c of CATEGORIES) {
		const latestInCategory = articles.find((a) => a.data.category === c.slug)?.data.date;
		urls.push({
			loc: `${base}${ensureTrailingSlash(`/${c.slug}`)}`,
			lastmod: formatLastmod(latestInCategory ?? lastArticleDate),
			changefreq: 'weekly',
			priority: '0.8',
		});
	}

	for (const entry of articles) {
		const id = entry.id;
		const rawSlug = typeof id === 'string' ? id.replace(/\.(md|mdx)$/i, '').split('/').slice(1).join('/') : '';
		const loc = `${base}${ensureTrailingSlash(`/${entry.data.category}/${rawSlug}`)}`;
		urls.push({
			loc,
			lastmod: formatLastmod(entry.data.date),
			changefreq: 'monthly',
			priority: '0.7',
		});
	}

	const contactLoc = `${base}/contact/`;
	const contactoLoc = `${base}/contacto/`;

	const withAlternates = urls.map((u) => {
		if (u.loc === contactLoc || u.loc === contactoLoc) {
			return {
				...u,
				alternates: [
					{ hreflang: 'en', href: contactLoc },
					{ hreflang: 'es', href: contactoLoc },
				],
			};
		}
		return u;
	});

	const xml =
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
		withAlternates
			.map((u) => {
				const parts: string[] = [];
				parts.push(`  <url>`);
				parts.push(`    <loc>${escapeXml(u.loc)}</loc>`);
				if (u.lastmod) parts.push(`    <lastmod>${escapeXml(u.lastmod)}</lastmod>`);
				if (u.changefreq) parts.push(`    <changefreq>${escapeXml(u.changefreq)}</changefreq>`);
				if (u.priority) parts.push(`    <priority>${escapeXml(u.priority)}</priority>`);
				if (u.alternates?.length) {
					for (const a of u.alternates) {
						parts.push(
							`    <xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}" />`,
						);
					}
				}
				parts.push(`  </url>`);
				return parts.join('\n');
			})
			.join('\n') +
		`\n</urlset>\n`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
		},
	});
};
