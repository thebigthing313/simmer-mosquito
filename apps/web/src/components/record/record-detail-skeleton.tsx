import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { DetailPageHeaderSkeleton } from './detail-page-header';
import {
	detailAsideClass,
	detailBodyClass,
	detailCardRowClass,
	detailGridClass,
	detailMainClass,
} from './detail-page-shell';
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
	const { main, aside } = layout.skeleton;
	return (
		<>
			<DetailPageHeaderSkeleton />
			<div className={detailBodyClass()}>
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
		<div className={detailCardRowClass}>
			{keyedPlaceholders(block, 'card').map((card) => (
				<Skeleton className={card.value} key={card.key} />
			))}
		</div>
	);
}
