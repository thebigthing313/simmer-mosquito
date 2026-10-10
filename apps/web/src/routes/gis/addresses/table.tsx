import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { AddressFilterFields } from '../../../components/gis/addresses/address-filters';
import type { AddressListing } from '../../../components/gis/addresses/address-row-parts';
import { addressRecordSet } from '../../../components/gis/addresses/addresses-search';
import { AddressesTable } from '../../../components/gis/addresses/addresses-table';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/gis/addresses/table')({
	component: AddressesTableRoute,
	validateSearch: searchValidator(surfaceCodecs(addressRecordSet, 'table')),
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;

/**
 * Every Address as a table, by name, narrowed by the same filters as the
 * Address Book Map.
 */
function AddressesTableRoute() {
	const binding = useRecordSetFilters(addressRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Every address in the book, by name."
			empty={{
				emptyDescription: 'Addresses show here as they are added to the book.',
				filteredDescription: 'No address matches what is set above.',
				scope: { kind: 'yet' },
			}}
			filters={<AddressFilterFields binding={binding} wide />}
			icon={AddressIcon}
			search={search}
			set={addressRecordSet}
			table={(rows: readonly AddressListing[]) => <AddressesTable rows={rows} />}
			// The Map's title, for the reason its heading gives.
			title="Address Book"
		/>
	);
}
