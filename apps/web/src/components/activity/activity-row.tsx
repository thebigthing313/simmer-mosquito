import { mapFamily } from '@simmer-mosquito/design-tokens';
import { ExplorerRow } from '../explorer';
import { hasDetailBadges, recordBadges, type StatusPlacement } from '../record/record-badges';
import {
	ACTIVITY_ROLE_LABEL,
	type ActivityEntry,
	type ActivityLookups,
	activityEntryKey,
	activityRow,
	formatActivityTime,
} from './activity-data';

/**
 * One entry, as its own explorer would list it, through `ExplorerRow` and the
 * parts {@link activityRow} resolves. Date and personnel are omitted: the
 * stepper is the date and the page is the person. The state arrives as a pill
 * because the dot is spent on the family. See {@link StatusPlacement}.
 */
export function ActivityRow({
	entry,
	isSelected,
	lookups,
	timeZone,
	onSelect,
}: {
	readonly entry: ActivityEntry;
	readonly isSelected: boolean;
	readonly lookups: ActivityLookups;
	readonly timeZone: string | undefined;
	readonly onSelect: (key: string) => void;
}) {
	const key = activityEntryKey(entry);
	const { title, subtitle, categoryLabel, link, facts, tags } = activityRow(entry, lookups);
	const verb = ACTIVITY_ROLE_LABEL[entry.role] ?? entry.role;

	return (
		<li>
			<ExplorerRow
				badges={recordBadges(facts, ACTIVITY_STATUS_PLACEMENT)}
				detailLabel={`View details for ${title}`}
				detailLink={link}
				isSelected={isSelected}
				onSelect={() => onSelect(key)}
				selectLabel={`Show ${title} on the map`}
				// A line of their own where the record draws more than its state; a state
				// pill alone stays beside the title.
				stackBadges={hasDetailBadges(facts)}
				// The verb leads, because what the person did to the record is what this page
				// adds over the record's own explorer. The time of day rides at the end for
				// the three kinds that have one.
				subtitle={[verb, subtitle, formatActivityTime(entry.occurredAt, timeZone)]
					.filter((part) => part !== null && part !== '')
					.join(' · ')}
				swatch={{
					color: mapFamily[entry.family],
					label: `${categoryLabel}, ${entry.involvement === 'assisting' ? 'assisted' : 'performed'}`,
				}}
				tags={tags}
				title={title}
				titleLink={link}
			/>
		</li>
	);
}

/** The dot is the family this work belongs to, so the record's state is a pill. */
const ACTIVITY_STATUS_PLACEMENT: StatusPlacement = 'badge';
