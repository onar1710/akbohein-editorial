import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { CATEGORIES } from '../site';

const SITE = 'https://www.akboheim.com';

function escapeXml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function toIsoDate(date: Date) {
	return date.toISOString().slice(0, 10);
}

function getEntrySlug(entry: { id: string }) {
	const raw = entry.id.replace(/\.(md|mdx)$/, '');
	const parts = raw.split('/');
	return parts.length >= 2 ? parts.slice(1).join('/') : raw;
}

function urlNode(loc: string, lastmod: string, changefreq: string, priority: string) {
	return [
		'  <url>',
		`    <loc>${escapeXml(loc)}</loc>`,
		`    <lastmod>${escapeXml(lastmod)}</lastmod>`,
		`    <changefreq>${escapeXml(changefreq)}</changefreq>`,
		`    <priority>${escapeXml(priority)}</priority>`,
		'  </url>',
	].join('\n');
}

export const GET: APIRoute = async () => {
	const lastmod = toIsoDate(new Date());

	const urls: string[] = [];

	urls.push(urlNode(`${SITE}/`, lastmod, 'weekly', '1.0'));

	for (const c of CATEGORIES) {
		urls.push(urlNode(`${SITE}/${c.slug}/`, lastmod, 'weekly', '0.7'));
	}

	const entries = await getCollection('articles');
	for (const entry of entries) {
		const slug = getEntrySlug(entry);
		urls.push(urlNode(`${SITE}/${entry.data.category}/${slug}/`, lastmod, 'weekly', '0.9'));
	}

	const xml =
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			urls.join('\n'),
			'</urlset>',
			'',
		].join('\n');

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
		},
	});
};
