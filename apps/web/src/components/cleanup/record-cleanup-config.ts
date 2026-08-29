import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { LinkProps } from '@tanstack/react-router';
import type { DuplicateGroup, MergeableRecordType } from '../../hooks/use-merge-candidates';

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
	},

	habitat: {
		noun: { one: 'habitat', many: 'habitats' },
		icon: iconRegistry.entities.habitat.icon,
		detailTo: '/larval-surveillance/habitats/$id',
		listTo: '/larval-surveillance/habitats',
		unnamed: 'Unnamed habitat',
		groupingRule:
			'Habitats are grouped when they share a name, or when they sit within ten metres of each other.',
	},

	contact: {
		noun: { one: 'contact', many: 'contacts' },
		icon: iconRegistry.entities.contact.icon,
		detailTo: '/public-engagement/contacts/$id',
		listTo: '/public-engagement/contacts',
		unnamed: 'Unnamed contact',
		groupingRule:
			'Contacts are grouped when they share a name, an email address, or a phone number.',
	},
};

/**
 * The heading over a group: the evidence that put it together.
 *
 * The shared value is in the heading rather than under it because it is the
 * thing a reviewer checks first, and a heading reading only "Same name" makes
 * every group on the page look identical.
 */
export function duplicateGroupHeading(group: DuplicateGroup): string {
	switch (group.reason) {
		case 'same_name':
			return `Same name: ${group.value ?? ''}`;
		case 'same_email':
			return `Same email: ${group.value ?? ''}`;
		case 'same_phone':
			return `Same phone: ${group.value ?? ''}`;
		case 'same_place':
			return 'Within ten metres';
	}
}

/** `3 addresses`, `1 address`. */
export function recordCountLabel(count: number, config: RecordCleanupConfig): string {
	return `${count} ${count === 1 ? config.noun.one : config.noun.many}`;
}
