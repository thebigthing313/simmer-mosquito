/**
 * The address filters, drawn the same way on the Address Book Map and the
 * Addresses Table: the search box, the Region popover, and the chips for
 * whatever is set. It returns the blocks bare, so each surface puts them in
 * its own frame. Takes the binding from `useRecordSetFilters`.
 */

import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { FilterFieldsLayout } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import { defineFilterDeclarations, REGION_FILTER } from '../../explorer/filter-declarations';
import { type AddressFilters, addressRecordSet } from './addresses-search';

/** Each address filter's control and chip, in chip order. */
export const addressFilterDeclarations = defineFilterDeclarations(addressRecordSet, [
	{
		kind: 'text',
		key: 'search',
		label: 'Search addresses',
		placeholder: 'Search addresses…',
	},
	REGION_FILTER,
]);

export function AddressFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<AddressFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(addressFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={addressFilterDeclarations} />}
			controls={fields.search}
			popovers={fields.regions}
			wide={wide}
		/>
	);
}
