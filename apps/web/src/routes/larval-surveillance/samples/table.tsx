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
import { SampleFilterFields } from '../../../components/larval-surveillance/samples/sample-filters';
import {
	SampleContext,
	type SampleListRow,
	SpeciesResults,
	sampleSwatch,
} from '../../../components/larval-surveillance/samples/sample-row-parts';
import { SampleSurfaceSwitch } from '../../../components/larval-surveillance/samples/sample-surface-switch';
import {
	sampleFilterCodecs,
	sampleListParams,
	sampleTileFilters,
	sharedSampleSearch,
} from '../../../components/larval-surveillance/samples-search';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useSpeciesOptions } from '../../../hooks/explorer/use-species-options';
import { useSampleFilterState } from '../../../hooks/larval-surveillance/use-sample-filter-state';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { sampleName } from '../../../lib/sample-name';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/samples/table')({
	component: SamplesTableRoute,
	validateSearch: searchValidator(sampleFilterCodecs),
});

const SampleIcon = iconRegistry.entities.sample.icon;

/** How many species a row names before collapsing the rest to "+N". */
const RESULT_CHIP_LIMIT = 3;

/**
 * Every Sample as a table, newest inspection first, narrowed by the same
 * filters as the Samples Map.
 *
 * ## Why this reads the Map's endpoint and not the collection
 *
 * A Sample's own row holds almost nothing a reader filters by. Its date is its
 * inspection's, its status is decided by whether any `sample_species` row
 * exists, and what was identified in it is those rows. The `samples`
 * collection can only push a filter or a sort down to Postgres when it names a
 * column of `samples`, so read that way the table could neither sort nor
 * filter by date. `HabitatsTableRoute` makes the same trade for its own
 * reasons.
 *
 * So this sends the Map's own `/map/samples` request with a box around the
 * whole world. Every inspection carries geometry, so the box leaves nothing
 * out, and every filter the Map has applies here too.
 */
function SamplesTableRoute() {
	const binding = useSampleFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedSampleSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...sampleListParams(sampleTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<SampleListRow>({
			path: '/map/samples',
			rowsKey: 'samples',
			recordType: 'sample',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<SampleSurfaceSwitch current="table" search={carried} />}
				description="Every sample taken, newest inspection first."
				icon={SampleIcon}
				title={recordNoun('sample').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<SampleFilterFields binding={binding} wide />
			</div>
			{isError ? <SamplesUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
				/>
			) : (
				<div className="grid gap-3">
					<SamplesTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('sample')}
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
 * Waiting, failed, filtered to nothing, or genuinely empty. A failure has its
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
						Clear filters
					</Button>
				}
				description="No sample matches what is set above."
				icon={SampleIcon}
				title="No samples match"
			/>
		);
	}
	return (
		<ListEmpty
			description="Samples taken in the last 30 days show here."
			icon={SampleIcon}
			title="No samples in the last 30 days"
		/>
	);
}

function SamplesTable({ rows }: { readonly rows: readonly SampleListRow[] }) {
	const { nameById } = useSpeciesOptions();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Sample</TableHead>
						<TableHead>Inspected</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Species</TableHead>
						<TableHead className="text-right">Larvae</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<SampleRow key={row.id} nameById={nameById} row={row} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SampleRow({
	nameById,
	row,
}: {
	readonly nameById: ReadonlyMap<string, string>;
	readonly row: SampleListRow;
}) {
	const name = sampleName(row);
	const swatch = sampleSwatch(row);
	const isIdentified = row.status === 'identified';
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/larval-surveillance/samples/table' }}
						to="/larval-surveillance/samples/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[14rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.inspectionDate)}</TableCell>
			<TableCell className="max-w-[20rem]">
				<SampleContext sample={row} />
			</TableCell>
			<TableCell>
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
						style={{ backgroundColor: swatch.color }}
					/>
					{swatch.label}
				</span>
			</TableCell>
			<TableCell>
				{isIdentified ? (
					<SpeciesResults limit={RESULT_CHIP_LIMIT} nameById={nameById} sample={row} />
				) : (
					<AbsentValue />
				)}
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{isIdentified ? row.larvaeTotal.toLocaleString('en-US') : <AbsentValue />}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function SamplesUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Samples could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try again
				</Button>
			</AlertDescription>
		</Alert>
	);
}
