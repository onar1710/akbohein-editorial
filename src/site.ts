export type NavItem = {
	label: string;
	href: string;
};

export type Category = {
	slug: string;
	label: string;
};

export const CATEGORIES: Category[] = [
	{ slug: 'literature', label: 'Literature' },
	{ slug: 'education', label: 'Education' },
	{ slug: 'culture', label: 'Culture' },
	{ slug: 'books', label: 'Books' },
	{ slug: 'society', label: 'Society' },
	{ slug: 'policy', label: 'Policy' },
];

export const NAV_ITEMS: NavItem[] = [
	{ label: 'Home', href: '/' },
	...CATEGORIES.map((c) => ({ label: c.label, href: `/${c.slug}` })),
];

export const getArticleHref = (entry: { id: string; data: { category: string } }) => {
	const key = entry.id.replace(/\.(md|mdx)$/i, '');
	if (key === 'culture/ghosts-of-partition') return '/ghosts-of-partition';
	if (key === 'literature/newnhamwrites-never-ever-underestimate-a-child') return '/newnhamwrites-never-ever-underestimate-a-child';
	const parts = key.split('/');
	const slug = parts.length >= 2 ? parts.slice(1).join('/') : '';
	return `/${entry.data.category}/${slug}`;
};

export const SITE = {
	name: 'Akboheim Editorial',
};
