import { ExplorerRow } from '../../../components/explorer';
import { ResultList, ResultRows } from '../../../components/explorer/result-list';
import type { ActivityLookups } from '../../-activity-data';
import { RecordBadges } from '../../-record-badges';
import {
	type NearbyFamily,
	type NearbyItem,
	type NearbyRead,
	nearbyItemKey,
	nearbyRow,
	visibleNearbyItems,
} from './-service-request-nearby';

// The nearby records around a service request, drawn as the rows an explorer's
// results rail draws, with the distance from the request in a slot of its own.
// Takes the families to show rather than a list, so the page hands each family
// tab its family and nothing else changes.
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * The list, or the rail's own state standing in for it.
 *
 * The placeholders, the empty state and the failed state are `ResultList`'s,
 * because the page used to draw a skeleton, a dashed box and a sentence of its
 * own for each, and the sentence for a failed read told the reader to try
 * again shortly with nothing to try. The rail's failed state carries the retry.
 *
 * The rows are the rail's own virtualised list, which scrolls itself. They were
 * a plain list while the nearby panel was a card in a column that scrolled,
 * because a second scroller inside the first is what `ResultRows` would have
 * put there; a family tab owns the column's height now, so the list is the
 * scroller and gets the product's scrollbar the way every explorer's rail does.
 */
export function NearbyResultList({
	nearby,
	families,
	selectedKey,
	onSelect,
	lookups,
	emptyTitle,
	emptyDescription,
}: {
	/** The read, whole: the rail draws its state and its answer off the one object. */
	readonly nearby: NearbyRead;
	/** Which of the response's families to draw, nearest first. */
	readonly families: ReadonlySet<NearbyFamily>;
	/** The selected record's `nearbyItemKey`, shared with the map's selection. */
	readonly selectedKey: string | null;
	readonly onSelect: (key: string | null) => void;
	readonly lookups: ActivityLookups;
	/** What the rail says when nothing is drawn and nothing failed. */
	readonly emptyTitle: string;
	readonly emptyDescription?: string | undefined;
}) {
	// The rows and the unit their distance is written in come off one response,
	// so a row can never draw ahead of the radius that measures it.
	const response = nearby.data;
	const list =
		response === undefined
			? null
			: { items: visibleNearbyItems(response.items, families), unitCode: response.radius.unitCode };
	return (
		<ResultList
			emptyDescription={emptyDescription}
			emptyTitle={emptyTitle}
			isEmpty={list === null || list.items.length === 0}
			isError={nearby.isError}
			isLoading={nearby.isLoading}
			onRetry={() => void nearby.refetch()}
		>
			{list === null ? null : (
				<ResultRows rows={list.items}>
					{(item) => (
						<NearbyExplorerRow
							isSelected={nearbyItemKey(item) === selectedKey}
							item={item}
							lookups={lookups}
							onSelect={onSelect}
							unitCode={list.unitCode}
						/>
					)}
				</ResultRows>
			)}
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
	readonly onSelect: (key: string | null) => void;
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
			onSelect={() => onSelect(isSelected ? null : nearbyItemKey(item))}
			selectLabel={`Show ${row.title} on the map`}
			subtitle={row.subtitle}
			swatch={row.swatch}
			tags={row.tags}
			title={row.title}
			titleLink={row.link}
		/>
	);
}
