import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { ListEmpty, ListLoading, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ChevronRightIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { HabitatFilterFields } from '../../../components/larval-surveillance/habitats/habitat-filters';
import { HabitatSurfaceSwitch } from '../../../components/larval-surveillance/habitats/habitat-surface-switch';
import {
	habitatFilterCodecs,
	habitatListParams,
	habitatTileFilters,
	sharedHabitatSearch,
} from '../../../components/larval-surveillance/habitats/habitats-search';
import { ClampedTextCell, LinkedTableRow } from '../../../components/record/linked-table-row';
import { TagBadge } from '../../../components/tag-badge';
import { useEntityTags } from '../../../hooks/explorer/use-entity-tags';
import { useHabitatTypeOptions } from '../../../hooks/explorer/use-habitat-type-options';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useHabitatFilterState } from '../../../hooks/larval-surveillance/use-habitat-filter-state';
import type { Tag } from '../../../hooks/queries/tag-view';
import { habitatName, habitatTypeName } from '../../../lib/habitat-name';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/habitats/table')({
	component: HabitatsTableRoute,
	validateSearch: searchValidator(habitatFilterCodecs),
});

const HabitatIcon = iconRegistry.entities.habitat.icon;

const NO_TAGS: readonly Tag[] = [];

/** One Habitat as `/map/habitats` answers it, cut to what the table draws. */
interface HabitatTableRow {
	readonly id: string;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly description: string;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}

/**
 * Every Habitat as a table, in name order, narrowed by the same filters as the
 * Habitats Map.
 *
 * ## Why this reads the Map's endpoint and not the collection
 *
 * The Inspections Table reads the `inspections` collection, which lets
 * Postgres sort by any indexed column, but only lets it filter by a column of
 * the table itself. Three of the Map's seven habitat filters are not columns:
 * Tags are rows in `entity_tags`, Region is ADR 0015's spatial membership, and
 * Untreated is the server's rule over inspections and control actions. The
 * Dashboard links to the Map with Untreated set, so a Table that dropped it
 * would list habitats the link says are gone.
 *
 * So this sends the Map's own `/map/habitats` request with a box around the
 * whole world, which gets every filter, the Map's name order, and a total, at
 * the cost of the column sort. The switch between the two carries every
 * filter for the same reason.
 */
function HabitatsTableRoute() {
	const binding = useHabitatFilterState();
	const { filters, activeCount, clearAll } = binding;
	const carried = sharedHabitatSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...habitatListParams(habitatTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<HabitatTableRow>({
			path: '/map/habitats',
			rowsKey: 'habitats',
			recordType: 'habitat',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<HabitatSurfaceSwitch current="table" search={carried} />}
				description="Every habitat on record, by name."
				icon={HabitatIcon}
				title={recordNoun('habitat').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<HabitatFilterFields binding={binding} wide />
			</div>
			{isError ? <HabitatsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={clearAll}
				/>
			) : (
				<div className="grid gap-3">
					<HabitatsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('habitat')}
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
				description="No habitat matches what is set above."
				icon={HabitatIcon}
				title="No habitats match"
			/>
		);
	}
	return (
		<ListEmpty
			description="Active habitats show here as crews add them."
			icon={HabitatIcon}
			title="No active habitats"
		/>
	);
}

function HabitatsTable({ rows }: { readonly rows: readonly HabitatTableRow[] }) {
	const { nameById: typeNameById } = useHabitatTypeOptions();
	// Tags for the rows on this page, so the subset request stays small.
	const { byId: tagsByHabitatId } = useEntityTags(
		'habitat',
		rows.map((row) => row.id),
	);
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Name</TableHead>
						<TableHead>Habitat type</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Access</TableHead>
						<TableHead>Tags</TableHead>
						<TableHead>Description</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<HabitatRow
							key={row.id}
							row={row}
							tags={tagsByHabitatId.get(row.id) ?? NO_TAGS}
							typeName={habitatTypeName(row.habitatTypeId, typeNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function HabitatRow({
	row,
	tags,
	typeName,
}: {
	readonly row: HabitatTableRow;
	readonly tags: readonly Tag[];
	readonly typeName: string;
}) {
	const name = habitatName(row);
	const description = row.description.trim();
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/larval-surveillance/habitats/table' }}
						to="/larval-surveillance/habitats/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="text-muted-foreground">{typeName}</TableCell>
			<TableCell>
				{row.isActive ? (
					<Badge tone="success" variant="outline">
						<CheckCircle2Icon aria-hidden="true" />
						Active
					</Badge>
				) : (
					<Badge tone="neutral" variant="outline">
						Inactive
					</Badge>
				)}
			</TableCell>
			<TableCell>
				{row.isInaccessible ? (
					<Badge tone="danger" variant="outline">
						<AlertTriangleIcon aria-hidden="true" />
						Inaccessible
					</Badge>
				) : (
					<span className="text-muted-foreground">Accessible</span>
				)}
			</TableCell>
			<TableCell>
				{tags.length === 0 ? (
					<AbsentValue />
				) : (
					<div className="flex flex-wrap gap-1">
						{tags.map((tag) => (
							<TagBadge key={tag.id} tag={tag} />
						))}
					</div>
				)}
			</TableCell>
			<ClampedTextCell empty={<AbsentValue />} text={description} />
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function HabitatsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Habitats could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try again
				</Button>
			</AlertDescription>
		</Alert>
	);
}
