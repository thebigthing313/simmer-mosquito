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
 * One entry, as its own explorer would list it.
 *
 * `ExplorerRow` is the shared list item every explorer already uses, and the
 * title, the link, the badges and the Tags are {@link activityRow}'s, the same
 * parts the nearby list on a service request draws, so a row here reads the way
 * the same record reads on the page it lives on: the same title, the same
 * subtitle, the same life-stage strip. Date and personnel are the two things it
 * omits, and they are the two things this page already knows — the stepper is
 * the date, and the page is the person.
 *
 * The state arrives as a pill rather than as the dot, because this page paints
 * nine record kinds on one map and spends the dot on which family the work
 * belongs to. See {@link StatusPlacement}.
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
				// A line of their own where the record draws more than its state, with
				// no date rail here to decide it. A state pill alone stays beside the
				// title and keeps the row short, which is what a 107-entry day needs.
				stackBadges={hasDetailBadges(facts)}
				// The verb leads, because what the person did to the record is the one
				// thing this page adds over the record's own explorer — and it says
				// "Assisted" in words rather than resting on the hollow pin alone. The
				// date rail is omitted: the stepper in the panel header already carries
				// the date, so the time of day rides at the end for the three kinds that
				// have one.
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

/**
 * The dot is the family this work belongs to, so the record's own state has
 * nowhere to go but a pill. Every explorer answers the other way.
 */
const ACTIVITY_STATUS_PLACEMENT: StatusPlacement = 'badge';
