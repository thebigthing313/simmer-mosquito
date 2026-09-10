/**
 * How one record detail page is laid out, declared once and read twice.
 *
 * The frame draws the placeholder before the record arrives and the columns
 * draw it after, so both need the same answer to "how wide is the side column,
 * and what stands in each one". Splitting that across two prop lists is how the
 * fourteen hand-written pages ended up with skeletons that stood in for a
 * layout the page no longer had: three of them reserved a side column their
 * content column had absorbed.
 *
 * A page declares one of these as a module constant and hands it to both
 * {@link RecordDetailPage} and {@link RecordDetailColumns}.
 */

/**
 * The side column's width.
 *
 * One value, because the rail now holds one thing: the record's comments
 * thread. Its facts sit beside the map instead, in `RecordDetailColumns`'
 * `facts` slot, so the 18rem variant that existed for a rail of fact cards
 * alone has no page left to serve. A second width joins this when a second
 * kind of rail does.
 */
export type RecordDetailAside = 'wide';

/**
 * One placeholder in a column: a Tailwind height for a single card, or a list
 * of heights for cards that sit side by side.
 *
 * The pair is the larval inspection, whose map and its readings are two cards
 * on one row rather than one above the other.
 */
export type RecordDetailBlock = string | readonly string[];

/** What the frame draws while the record is still syncing. */
export interface RecordDetailSkeletonShape {
	/** Width of the eyebrow line. Omit on a page whose header has no eyebrow. */
	readonly eyebrow?: string | undefined;
	/** Width of the title line. */
	readonly title?: string | undefined;
	/** Width of the line under the title, on the pages whose header has three. */
	readonly subtitle?: string | undefined;
	/** The primary column's cards, top to bottom. */
	readonly main: readonly RecordDetailBlock[];
	/** The side column's cards. Omit on a page with no side column. */
	readonly aside?: readonly string[] | undefined;
}

export interface RecordDetailLayout {
	/** Omit for a page with no comments thread, which is the three GIS records. */
	readonly aside?: RecordDetailAside | undefined;
	/** The side column follows the scroll once the split is on. */
	readonly stickyAside?: boolean | undefined;
	/**
	 * The primary column's rhythm. `tight` for the pages whose primary column is
	 * a location band group rather than a stack of separate cards.
	 */
	readonly mainGap?: 'default' | 'tight' | undefined;
	readonly skeleton: RecordDetailSkeletonShape;
}
