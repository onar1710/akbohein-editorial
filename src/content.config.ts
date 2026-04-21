import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		date: z.coerce.date(),
		category: z.string(),
		author: z.string().optional(),
		tags: z.array(z.string()).optional(),
		featuredImage: z.string().optional(),
		heroImage: z.string().optional(),
	}),
});

export const collections = {
	articles,
};
