import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { LinkProps } from '@tanstack/react-router';
import type {
	DuplicateGroup,
	DuplicateReason,
	DuplicateRecordType,
	MergeableRecordType,
} from '../../hooks/use-merge-candidates';
import { todayInTimeZone } from '../../lib/local-date';
import { formatListDate } from '../../routes/larval-surveillance/-overview-data';

type RegistryIcon = typeof iconRegistry.entities.address.icon;

/**
 * What one cleanup page needs beyond its record type.
 *
 * Three routes render the same component, so everything that differs between an
 * address, a habitat and a contact is here rather than in three copies of the
 * page. The grouping rules are the server's, restated as the sentence the empty
 * state uses: a page that proposes nothing has to say what it was looking for,
 * or "no duplicates" reads as "this tool does nothing".
 */
export interface RecordCleanupConfig {
	readonly noun: { readonly one: string; readonly many: string };
	readonly icon: RegistryIcon;
	/** The detail route, for the link out of a candidate row. */
	readonly detailTo: NonNullable<LinkProps['to']>;
	/** Where a user goes to look at the whole set instead. */
	readonly listTo: NonNullable<LinkProps['to']>;
	/** What the label falls back to for a record that has no name. */
	readonly unnamed: string;
}

/**
 * What a cleanup page needs on top of that.
 *
 * Separate because habitats have no cleanup page. They merge the same way as an
 * address and are found a different way, from one habitat's own detail page, so
 * they carry the nouns and the routes above and nothing here.
 */
export interface DuplicatePageConfig {
	/** How the server groups this record type, for the empty state. */
	readonly groupingRule: string;
	/**
	 * Every reason this record type can be grouped for, in the order they appear.
	 *
	 * Declared rather than read off the results, so the filter offers the same
	 * choices on every visit. Taking them from the data would hide a match type
	 * the moment an agency had none of it, which is when a reader most wants to
	 * see that it was looked for and found nothing.
	 */
	readonly reasons: readonly DuplicateReason[];
}

export const RECORD_CLEANUP_CONFIGS: Record<MergeableRecordType, RecordCleanupConfig> = {
	address: {
		noun: { one: 'address', many: 'addresses' },
		icon: iconRegistry.entities.address.icon,
		detailTo: '/gis/addresses/$id',
		listTo: '/gis/addresses',
		unnamed: 'Unnamed address',
	},

	habitat: {
		noun: { one: 'habitat', many: 'habitats' },
		icon: iconRegistry.entities.habitat.icon,
		detailTo: '/larval-surveillance/habitats/$id',
		listTo: '/larval-surveillance/habitats',
		unnamed: 'Unnamed habitat',
	},

	contact: {
		noun: { one: 'contact', many: 'contacts' },
		icon: iconRegistry.entities.contact.icon,
		detailTo: '/public-engagement/contacts/$id',
		listTo: '/public-engagement/contacts',
		unnamed: 'Unnamed contact',
	},
};

export const DUPLICATE_PAGE_CONFIGS: Record<DuplicateRecordType, DuplicatePageConfig> = {
	address: {
		groupingRule:
			'Addresses are grouped when they share a display name, a street address, or the exact same coordinates.',
		reasons: ['same_name', 'same_street', 'same_coordinates'],
	},

	contact: {
		groupingRule:
			'Contacts are grouped when they share a name, an email address, or a phone number.',
		reasons: ['same_name', 'same_email', 'same_phone'],
	},
};

/** What the filter calls each way of matching, and what a group heading leads with. */
export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
	same_name: 'Same name',
	same_street: 'Same street address',
	same_email: 'Same email',
	same_phone: 'Same phone',
	same_coordinates: 'Same coordinates',
};

/**
 * The heading over a group: the evidence that put it together.
 *
 * The shared value is in the heading rather than under it because it is the
 * thing a reviewer checks first, and a heading reading only "Same name" makes
 * every group on the page look identical.
 *
 * A shared name is shown as the records spell it rather than as the key it was
 * compared on. The comparison is deliberately blind to case and padding, so the
 * key for a group of addresses is `113 north 2nd avenue, 1st floor`, and a
 * heading in that form reads as a typo sitting above rows that spell it
 * properly.
 *
 * A shared street address has the same problem and a different answer. It is
 * flattened the same way, and it is not the record's label either, because an
 * address is labelled by its display name. It comes off the column instead: the
 * candidate carries its own field values for the merge form, so the heading can
 * spell the street the way the records do.
 *
 * The rest keep the compared value, because for them it is the shared thing
 * itself rather than a flattened spelling of it: an email is written in lower
 * case anyway, a phone key is the digits with the punctuation taken out, which
 * is what makes two spellings of one number match, and a coordinate pair is
 * already exact.
 */
export function duplicateGroupHeading(group: DuplicateGroup): string {
	const reason = DUPLICATE_REASON_LABELS[group.reason];
	switch (group.reason) {
		case 'same_name':
			return `${reason}: ${asWritten(group, group.records[0]?.label)}`;
		case 'same_street':
			return `${reason}: ${asWritten(group, group.records[0]?.fields.address_line_1)}`;
		case 'same_email':
		case 'same_phone':
		case 'same_coordinates':
			return `${reason}: ${group.value ?? ''}`;
	}
}

/** The shared value as the first record spells it, falling back to the compared key. */
function asWritten(group: DuplicateGroup, written: string | null | undefined): string {
	const spelled = written?.trim() ?? '';
	return spelled === '' ? (group.value ?? '') : spelled;
}

/**
 * A record's name, or what to call it when it has none.
 *
 * Six surfaces were writing this comparison out, which is six chances for one of
 * them to render an empty string where a name goes. Habitats are the reason it
 * exists: `habitat_name` is nullable and the reader coalesces it to `''`, so a
 * blank label is a real value rather than a missing one.
 */
export function recordLabel(
	record: { readonly label: string },
	config: RecordCleanupConfig,
): string {
	return record.label.trim() === '' ? config.unnamed : record.label;
}

/** `3 addresses`, `1 address`. */
export function recordCountLabel(count: number, config: RecordCleanupConfig): string {
	return `${count} ${count === 1 ? config.noun.one : config.noun.many}`;
}

/**
 * The day a record was added, on the Organization's calendar.
 *
 * The oldest record is the survivor a group preselects, because it is the one
 * the Organization has had longest and so the one most likely already named by
 * the records that matter. The date is what makes that choice checkable rather
 * than arbitrary, and it is read across the rows of a group rather than on its
 * own.
 *
 * `created_at` is an instant, and which day an instant fell on is only a fact
 * once a zone says so. The zone is the Organization's, the way every other
 * operational date on this app reads: a contact added at 9pm Eastern was added
 * on the 4th, including for the colleague reading the page from UTC, where the
 * same instant is already the 5th.
 */
export function addedOn(createdAt: string, timeZone: string): string {
	const added = new Date(createdAt);
	if (Number.isNaN(added.getTime())) {
		return 'an unknown date';
	}
	return formatListDate(todayInTimeZone(timeZone, added));
}
