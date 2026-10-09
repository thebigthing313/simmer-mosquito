import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useCollectionMethodOptions } from '../../../hooks/explorer/use-collection-method-options';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { collectionEffectiveDate } from '../../../hooks/queries/collection-day';
import { useTrapNames } from '../../../hooks/queries/use-trap-names';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { formatListDate } from '../../../lib/local-date';
import { LinkedTableRow } from '../../record/linked-table-row';
import {
	type CollectionListRow,
	collectionPersonnelName,
	collectionRowLabel,
	collectionSwatch,
} from './collection-row-parts';

/**
 * A page of Collections as a table, one row per collection, each opening its detail page. Takes the
 * rows the route read.
 */
export function CollectionsTable({ rows }: { readonly rows: readonly CollectionListRow[] }) {
	const { nameById: methodNameById } = useCollectionMethodOptions();
	const trapNameById = useTrapNames();
	const personnel = usePersonnelOptions();
	const timeZone = useOrganizationTimeZone();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Collection</TableHead>
						<TableHead>Date</TableHead>
						<TableHead>Method</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Handled By</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<CollectionTableRow
							effectiveDate={collectionEffectiveDate(row, timeZone)}
							key={row.id}
							label={collectionRowLabel(row, trapNameById)}
							methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
							personnelName={collectionPersonnelName(row, personnel.nameById)}
							row={row}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function CollectionTableRow({
	row,
	label,
	effectiveDate,
	methodName,
	personnelName,
}: {
	readonly row: CollectionListRow;
	readonly label: string;
	readonly effectiveDate: string | null;
	readonly methodName: string;
	readonly personnelName: string | null;
}) {
	const swatch = collectionSwatch(row.status);
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${label}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/adult-surveillance/collections/table' }}
						to="/adult-surveillance/collections/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={label}>
				{label}
			</TableCell>
			<TableCell className="tabular-nums">
				{effectiveDate === null ? <AbsentValue /> : formatListDate(effectiveDate)}
			</TableCell>
			<TableCell className="text-muted-foreground">{methodName}</TableCell>
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
			<TableCell className="text-muted-foreground">
				{personnelName === null ? <AbsentValue /> : personnelName}
			</TableCell>
		</LinkedTableRow>
	);
}
