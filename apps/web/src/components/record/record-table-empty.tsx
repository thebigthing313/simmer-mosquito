import { ListEmpty, ListLoading } from '@simmer-mosquito/ui-web/components/page';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { RecordType } from '../../lib/record-nouns';
import { type RecordEmptyScope, recordEmptyTitle } from './record-empty-title';

/**
 * A record table with no rows: nothing on a failed read, placeholder rows while
 * loading, a filtered-empty state with Clear Filters, or the unfiltered empty
 * state. Both titles come from `recordEmptyTitle`, the builder the Map's rail
 * reads; the two descriptions and the icon are the surface's.
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
	/** What the table holds with nothing set, which the unfiltered title names. */
	readonly scope: RecordEmptyScope;
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
				title={recordEmptyTitle(recordType, { kind: 'match' })}
			/>
		);
	}
	return (
		<ListEmpty
			description={emptyDescription}
			icon={icon}
			title={recordEmptyTitle(recordType, scope)}
		/>
	);
}
