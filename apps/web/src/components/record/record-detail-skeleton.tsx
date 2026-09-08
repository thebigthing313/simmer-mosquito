import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { detailAsideClass, detailGridClass, detailMainClass } from './record-detail-columns';
import type { RecordDetailBlock, RecordDetailLayout } from './record-detail-layout';
import { keyedPlaceholders } from './skeleton-keys';

/**
 * The record's shape before the record.
 *
 * Every detail page wrote its own, and because the skeleton and the layout were
 * declared in different functions they drifted apart: a page whose side column
 * had been folded into the main one still reserved the rail while loading, so
 * the content jumped sideways the moment it arrived. Here both read the same
 * {@link RecordDetailLayout}, so a column that moves moves in both.
 *
 * Exported for the one page whose readiness is a Suspense boundary rather than
 * a flag, which hands this to `fallback` instead of letting the frame fork.
 */
export function RecordDetailSkeleton({ layout }: { readonly layout: RecordDetailLayout }) {
	const { eyebrow, title, subtitle, main, aside } = layout.skeleton;
	return (
		<>
			<div className="grid gap-2">
				{eyebrow === undefined ? null : <Skeleton className={`h-4 ${eyebrow}`} />}
				<Skeleton className={`h-8 ${title ?? 'w-64'}`} />
				{subtitle === undefined ? null : <Skeleton className={`h-4 ${subtitle}`} />}
			</div>
			<div className={detailGridClass(layout.aside)}>
				<div className={detailMainClass(layout)}>
					{keyedPlaceholders(main, 'main').map((block) => (
						<SkeletonBlock block={block.value} key={block.key} />
					))}
				</div>
				{aside === undefined ? null : (
					<div className={detailAsideClass(layout)}>
						{keyedPlaceholders(aside, 'aside').map((card) => (
							<Skeleton className={card.value} key={card.key} />
						))}
					</div>
				)}
			</div>
		</>
	);
}

/** A card, or a row of cards that share the column's width. */
function SkeletonBlock({ block }: { readonly block: RecordDetailBlock }) {
	if (typeof block === 'string') {
		return <Skeleton className={block} />;
	}
	return (
		<div className="grid gap-5 lg:grid-cols-2">
			{keyedPlaceholders(block, 'card').map((card) => (
				<Skeleton className={card.value} key={card.key} />
			))}
		</div>
	);
}
