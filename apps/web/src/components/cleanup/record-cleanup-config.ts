import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { LinkProps } from '@tanstack/react-router';
import type {
	DuplicateGroup,
	DuplicateReason,
	MergeableRecordType,
} from '../../hooks/use-merge-candidates';

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
		groupingRule:
			'Addresses are grouped when they share a display name, or when they sit within ten metres of each other.',
		reasons: ['same_name', 'same_place'],
	},

	habitat: {
		noun: { one: 'habitat', many: 'habitats' },
		icon: iconRegistry.entities.habitat.icon,
		detailTo: '/larval-surveillance/habitats/$id',
		listTo: '/larval-surveillance/habitats',
		unnamed: 'Unnamed habitat',
		groupingRule:
			'Habitats are grouped when they share a name, or when they sit within ten metres of each other.',
		reasons: ['same_name', 'same_place'],
	},

	contact: {
		noun: { one: 'contact', many: 'contacts' },
		icon: iconRegistry.entities.contact.icon,
		detailTo: '/public-engagement/contacts/$id',
		listTo: '/public-engagement/contacts',
		unnamed: 'Unnamed contact',
		groupingRule:
			'Contacts are grouped when they share a name, an email address, or a phone number.',
		reasons: ['same_name', 'same_email', 'same_phone'],
	},
};

/** What the filter calls each way of matching, and what a group heading leads with. */
export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
	same_name: 'Same name',
	same_email: 'Same email',
	same_phone: 'Same phone',
	same_place: 'Within ten metres',
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
 * The other two keep the compared value, because for them it is the shared thing
 * itself rather than a flattened spelling of it: an email is written in lower
 * case anyway, and a phone key is the digits with the punctuation taken out,
 * which is what makes two spellings of one number match. Neither can come off a
 * record's label, which for a contact is their name.
 */
export function duplicateGroupHeading(group: DuplicateGroup): string {
	const reason = DUPLICATE_REASON_LABELS[group.reason];
	switch (group.reason) {
		case 'same_name':
			return `${reason}: ${asWritten(group)}`;
		case 'same_email':
		case 'same_phone':
			return `${reason}: ${group.value ?? ''}`;
		case 'same_place':
			return reason;
	}
}

/** The shared name as the first record spells it, falling back to the compared key. */
function asWritten(group: DuplicateGroup): string {
	const written = group.records[0]?.label.trim() ?? '';
	return written === '' ? (group.value ?? '') : written;
}

/** `3 addresses`, `1 address`. */
export function recordCountLabel(count: number, config: RecordCleanupConfig): string {
	return `${count} ${count === 1 ? config.noun.one : config.noun.many}`;
}
