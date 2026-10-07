import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { ListEmpty, ListLoading, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { AddressFilterFields } from '../../../components/gis/addresses/address-filters';
import {
	type AddressListing,
	addressName,
	streetLine,
} from '../../../components/gis/addresses/address-row-parts';
import { AddressSurfaceSwitch } from '../../../components/gis/addresses/address-surface-switch';
import {
	addressFilterCodecs,
	addressListParams,
	addressTileFilters,
	sharedAddressSearch,
} from '../../../components/gis/addresses/addresses-search';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useAddressFilterState } from '../../../hooks/gis/use-address-filter-state';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/gis/addresses/table')({
	component: AddressesTableRoute,
	validateSearch: searchValidator(addressFilterCodecs),
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;

/**
 * Every Address as a table, by name, narrowed by the same filters as the
 * Address Book Map. It sends the Map's own `/map/addresses` request under a
 * box around the whole world, so the two surfaces list one set.
 */
function AddressesTableRoute() {
	const binding = useAddressFilterState();
	const { filters, activeCount, clearAll } = binding;
	const carried = sharedAddressSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...addressListParams(addressTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<AddressListing>({
			path: '/map/addresses',
			rowsKey: 'addresses',
			recordType: 'address',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<AddressSurfaceSwitch current="table" search={carried} />}
				description="Every address in the book, by name."
				icon={AddressIcon}
				// The Map's title, for the reason its heading gives.
				title="Address Book"
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<AddressFilterFields binding={binding} wide />
			</div>
			{isError ? <AddressesUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={clearAll}
				/>
			) : (
				<div className="grid gap-3">
					<AddressesTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('address')}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={total}
					/>
				</div>
			)}
		</OutletSimpleLayout>
	);
}

/**
 * Waiting, failed, filtered to nothing, or empty. A failure has its
 * own strip above, so here it draws nothing rather than a second one.
 */
function NoRows({
	isError,
	isFiltered,
	isLoading,
	onClearFilters,
}: {
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
				description="No address matches what is set above."
				icon={AddressIcon}
				title="No Addresses Match"
			/>
		);
	}
	return (
		<ListEmpty
			description="Addresses show here as they are added to the book."
			icon={AddressIcon}
			title="No Addresses Yet"
		/>
	);
}

function AddressesTable({ rows }: { readonly rows: readonly AddressListing[] }) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Name</TableHead>
						<TableHead>Street</TableHead>
						<TableHead>Locality</TableHead>
						<TableHead>Postal Code</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<AddressTableRowView key={row.id} row={row} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function AddressTableRowView({ row }: { readonly row: AddressListing }) {
	const name = addressName(row);
	const street = streetLine(row);
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/gis/addresses/table' }}
						to="/gis/addresses/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="text-muted-foreground">{textOrAbsent(street)}</TableCell>
			<TableCell className="text-muted-foreground">{textOrAbsent(row.locality)}</TableCell>
			<TableCell className="text-muted-foreground tabular-nums">
				{textOrAbsent(row.postalCode)}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The text, or the absent mark where there is none or it is blank. */
function textOrAbsent(text: string | null) {
	const trimmed = text?.trim() ?? '';
	return trimmed.length === 0 ? <AbsentValue /> : trimmed;
}

/** The read failed. Says so whether or not there are rows behind it. */
function AddressesUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Addresses could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}
