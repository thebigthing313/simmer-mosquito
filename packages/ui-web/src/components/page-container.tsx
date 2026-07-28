import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The measure and rhythm every non-map route page sits in.
 *
 * This geometry was duplicated as a literal class string across ~20 route files,
 * which meant the app's content measure was a decision no single file owned.
 * The variants below are not invented — they are exactly the shapes the routes
 * had already converged on, so migrating a call site is a rename, not a
 * redesign:
 *
 * - `gap`     — how far apart stacked page sections sit. Overview and stats
 *               pages breathe (`overview`); record detail pages run tighter
 *               (`detail`) because they stack many small fact groups.
 * - `padding` — `page` is the standard framed page. `detail` adds bottom room so
 *               a long record doesn't end flush against the viewport. `trailing`
 *               is for pages whose horizontal padding already comes from a
 *               parent layout, leaving only that bottom room to add.
 *
 * Route-level `className` should stay layout-local (a grid template, a local
 * width) rather than re-stating any of this.
 */
export const pageContainer = cva('mx-auto w-full max-w-[1200px]', {
	variants: {
		/*
		 * Most pages stack sections on a grid so `gap` controls the rhythm.
		 * `block` exists for the plain padded column (see `OutletSimpleLayout`),
		 * which shares this measure but lets its children own their own spacing —
		 * the point is that the 1200px measure is decided here and nowhere else.
		 */
		flow: {
			grid: 'grid content-start',
			block: '',
		},
		gap: {
			none: '',
			compact: 'gap-3',
			snug: 'gap-4',
			detail: 'gap-5',
			overview: 'gap-6',
		},
		padding: {
			page: 'px-4 py-6 md:px-8 md:py-8',
			detail: 'px-4 py-6 pb-10 md:px-8',
			trailing: 'pb-10',
			none: '',
		},
	},
	defaultVariants: {
		flow: 'grid',
		gap: 'overview',
		padding: 'page',
	},
});

export type PageContainerVariants = VariantProps<typeof pageContainer>;
