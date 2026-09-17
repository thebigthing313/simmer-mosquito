import { ExplorerRow } from '../../../components/explorer';
import { ResultList } from '../../../components/explorer/result-list';
import type { ActivityLookups } from '../../-activity-data';
import { RecordBadges } from '../../-record-badges';
import { type NearbyItem, type NearbyResponse, nearbyRow } from './-service-request-nearby';

// The nearby records around a service request, drawn as the rows an explorer's
// results rail draws, with the distance from the request in a slot of its own.
// Takes a list already filtered and ordered by the caller, so a page that lists
// one family per tab hands each tab its own slice and nothing else changes.
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * The list, or the rail's own state standing in for it.
 *
 * The placeholders, the empty state and the failed state are `ResultList`'s,
 * because the page used to draw a skeleton, a dashed box and a sentence of its
 * own for each, and the sentence for a failed read told the reader to try
 * again shortly with nothing to try. The rail's failed state carries the retry.
 *
 * The rows are a plain list rather than the rail's virtualised one. The rail
 * scrolls its own viewport and mounts a page of fifty in a window; this list is
 * a card in a column that scrolls, bounded by the radius and the window rather
 * than by a page, and a second scroller inside the first is what the rail's
 * `ResultRows` would put here.
 */
export function NearbyResultList({
	response,
	items,
	isLoading,
	isError,
	onRetry,
	selectedId,
	onSelect,
	lookups,
	emptyTitle,
	emptyDescription,
}: {
	readonly response: NearbyResponse | undefined;
	/** The records to draw, already family-filtered and nearest first. */
	readonly items: readonly NearbyItem[];
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly onRetry: () => void;
	readonly selectedId: string | null;
	readonly onSelect: (id: string | null) => void;
	readonly lookups: ActivityLookups;
	/** What the rail says when `items` is empty and nothing failed. */
	readonly emptyTitle: string;
	readonly emptyDescription?: string | undefined;
}) {
	return (
		<ResultList
			emptyDescription={emptyDescription}
			emptyTitle={emptyTitle}
			isEmpty={items.length === 0}
			isError={isError}
			isLoading={isLoading}
			onRetry={onRetry}
		>
			<ul className="grid">
				{items.map((item) => (
					<li
						className="border-border/40 border-t first:border-t-0"
						key={`${item.category}:${item.id}`}
					>
						<NearbyExplorerRow
							isSelected={item.id === selectedId}
							item={item}
							lookups={lookups}
							onSelect={onSelect}
							unitCode={response?.radius.unitCode ?? ''}
						/>
					</li>
				))}
			</ul>
		</ResultList>
	);
}

/**
 * One nearby record as `ExplorerRow` draws it: the family colour as the dot,
 * the describer's title and subtitle, the date, the badge register's badges,
 * the Tags, the distance and the chevron to the record's own page.
 *
 * The state rides as a pill rather than as the dot, for Daily Work's reason:
 * the dot is spent on which family the record belongs to.
 */
function NearbyExplorerRow({
	item,
	isSelected,
	onSelect,
	lookups,
	unitCode,
}: {
	readonly item: NearbyItem;
	readonly isSelected: boolean;
	readonly onSelect: (id: string | null) => void;
	readonly lookups: ActivityLookups;
	readonly unitCode: string;
}) {
	const row = nearbyRow(item, lookups, unitCode);
	return (
		<ExplorerRow
			badges={<RecordBadges facts={row.facts} status="badge" />}
			date={row.date}
			detailLabel={`View details for ${row.title}`}
			detailLink={row.link}
			distance={row.distance}
			isSelected={isSelected}
			// A second click on the selected row clears it, which is how the focus
			// card over the map closes from the list.
			onSelect={() => onSelect(isSelected ? null : item.id)}
			selectLabel={`Show ${row.title} on the map`}
			subtitle={row.subtitle}
			swatch={row.swatch}
			tags={row.tags}
			title={row.title}
			titleLink={row.link}
		/>
	);
}
