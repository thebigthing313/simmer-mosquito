import type { ActivityLookups } from '../../activity/activity-data';
import { ExplorerRow } from '../../explorer';
import { ResultList, ResultRows } from '../../explorer/result-list';
import { recordBadges } from '../../record/record-badges';
import {
	type NearbyFamily,
	type NearbyItem,
	type NearbyRead,
	nearbyItemKey,
	nearbyRow,
	visibleNearbyItems,
} from './service-request-nearby';
// The nearby records around a service request, drawn as the rows an
// explorer's results rail draws, with the distance from the request in a slot
// of its own. Takes the families to show rather than a list.

/**
 * The list, or the rail's own state standing in for it. The placeholders, the
 * empty state and the failed state are `ResultList`'s, so the failed state
 * carries the retry. The rows are the rail's virtualised list, which scrolls
 * itself; a family tab owns the column's height.
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
 * the describer's title and subtitle, the date, the badges, the Tags, the
 * distance and the chevron. The state is a pill because the dot is the
 * family.
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
			badges={recordBadges(row.facts, 'badge')}
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
