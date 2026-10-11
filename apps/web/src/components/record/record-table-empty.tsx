import { ListEmpty, ListLoading } from '@simmer-mosquito/ui-web/components/page';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { type RecordType, recordNoun } from '../../lib/record-nouns';

/**
 * What an empty table with no filters set is empty of, which is the one part of
 * the title a surface decides: `No Active Habitats`, `No Inspections Yet`,
 * `No Samples in the Last 30 Days`, `No Service Requests This Year`.
 */
export type RecordTableScope =
	| { readonly kind: 'active' }
	| { readonly kind: 'yet' }
	| { readonly kind: 'lastDays'; readonly days: number }
	| { readonly kind: 'thisYear' };

/**
 * A record table with no rows: nothing on a failed read, placeholder rows while
 * loading, a filtered-empty state with Clear Filters, or the unfiltered empty
 * state. Both titles read the record's plural from the register; the two
 * descriptions and the icon are the surface's.
 */
export function RecordTableEmpty({
	recordType,
	icon,
	scope,
	filteredDescription,
	emptyDescription,
	isError,
	isFiltered,
	isLoading,
	onClearFilters,
}: {
	readonly recordType: RecordType;
	readonly icon: RegistryIcon;
	readonly scope: RecordTableScope;
	readonly filteredDescription: string;
	readonly emptyDescription: string;
	readonly isError: boolean;
	readonly isFiltered: boolean;
	readonly isLoading: boolean;
	readonly onClearFilters: () => void;
}) {
	if (isError) {
		return null;
	}
	if (isLoading) {
		return <ListLoading rows={8} />;
	}
	const { titleMany } = recordNoun(recordType);
	if (isFiltered) {
		return (
			<ListEmpty
				action={
					<Button onClick={onClearFilters} type="button" variant="outline">
						Clear Filters
					</Button>
				}
				description={filteredDescription}
				icon={icon}
				title={`No ${titleMany} Match`}
			/>
		);
	}
	return (
		<ListEmpty description={emptyDescription} icon={icon} title={emptyTitle(titleMany, scope)} />
	);
}

function emptyTitle(titleMany: string, scope: RecordTableScope): string {
	switch (scope.kind) {
		case 'active':
			return `No Active ${titleMany}`;
		case 'yet':
			return `No ${titleMany} Yet`;
		case 'lastDays':
			return `No ${titleMany} in the Last ${scope.days} Days`;
		case 'thisYear':
			return `No ${titleMany} This Year`;
	}
}
