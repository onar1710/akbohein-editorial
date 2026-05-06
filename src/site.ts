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

export const SITE = {
	name: 'Akboheim Editorial',
};
