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
 *               a long record doesn't end flush against the viewport, and
 *               `header` is the pinned bar above it.
 * - `measure` — how wide the column is allowed to get. See below.
 *
 * Route-level `className` should stay layout-local (a grid template, a local
 * width) rather than re-stating any of this.
 */
export const pageContainer = cva('mx-auto w-full', {
	variants: {
		/*
		 * How wide the column may get.
		 *
		 * `page` is the 1200px measure this file was written for: a column of
		 * prose, headings and stacked sections, where a longer line is a worse
		 * line.
		 *
		 * `record` is for the record detail frame, which holds almost no prose.
		 * It holds fact rows, a map, child-record tables and a comments rail,
		 * and those want different widths from each other rather than one
		 * shared one. Measured on a 1920 screen: the stage inside the two rails
		 * is 1616px, so the 1200 measure left 416px of it empty while a fact
		 * row's value column ran 600px wide around 81px of ink. Widening the
		 * page alone would have made that row worse, so the cards carry their
		 * own measures now (see `DetailList` and `detailCardRowClass`) and the
		 * page is free to fill the stage.
		 *
		 * The cap is 112rem rather than none. Past about that width a child
		 * record's table row gets long enough that the eye loses which row it
		 * is on, and the page header's title and its actions end up too far
		 * apart to read as one bar. On a 2560 screen it leaves 232px on each
		 * side, which reads as a margin rather than as waste.
		 */
		measure: {
			page: 'max-w-[1200px]',
			record: 'max-w-[112rem]',
		},
		/*
		 * Most pages stack sections on a grid so `gap` controls the rhythm.
		 * `block` exists for the plain padded column (see `OutletSimpleLayout`),
		 * which shares this measure but lets its children own their own spacing —
		 * the point is that the measure is decided here and nowhere else.
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
			/*
			 * The pinned bar a record detail page opens with. Same side padding as
			 * `detail`, so the header's title sits over the first card's edge, and a
			 * shorter vertical rhythm because a pinned bar costs every screen below it
			 * the room it takes.
			 */
			header: 'px-4 py-4 md:px-8',
			none: '',
		},
	},
	defaultVariants: {
		flow: 'grid',
		gap: 'overview',
		measure: 'page',
		padding: 'page',
	},
});

export type PageContainerVariants = VariantProps<typeof pageContainer>;
