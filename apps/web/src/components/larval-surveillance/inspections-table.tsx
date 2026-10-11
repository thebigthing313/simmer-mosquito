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
import { habitatLabel } from '../../lib/coordinate-label';
import { formatListDate } from '../../lib/local-date';
import { DensityBadge, LifeStageStrip, WetnessBadge } from '../larval-display';
import { LinkedTableRow } from '../record/linked-table-row';
import type { InspectionListing } from './inspection-listing';

/**
 * A page of Inspections as a table, one row per inspection, each opening its detail page. Takes the
 * rows the route read and the habitat type names to label them with.
 */
export function InspectionsTable({
	rows,
	typeNameById,
}: {
	readonly rows: readonly InspectionListing[];
	readonly typeNameById: ReadonlyMap<string, string>;
}) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Date</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Habitat Type</TableHead>
						<TableHead>Inspector</TableHead>
						<TableHead>Water</TableHead>
						<TableHead>Density</TableHead>
						<TableHead className="text-right">Dips</TableHead>
						<TableHead>Life Stages</TableHead>
						<TableHead className="text-right">Larvae</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<InspectionRow key={row.id} row={row} typeNameById={typeNameById} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/**
 * The Habitat's type, or what to say instead. A type id the catalog has not
 * loaded is worth saying rather than showing nothing; no type at all is absent.
 */
function typeLabel(
	row: InspectionListing,
	typeNameById: ReadonlyMap<string, string>,
): string | null {
	if (row.habitatTypeId === null) {
		return null;
	}
	return typeNameById.get(row.habitatTypeId) ?? 'Unknown type';
}

function InspectionRow({
	row,
	typeNameById,
}: {
	readonly row: InspectionListing;
	readonly typeNameById: ReadonlyMap<string, string>;
}) {
	const when = formatListDate(row.inspectionDate);
	const label = habitatLabel(row, {
		addressName: row.addressDisplayName,
		fallback: 'One-off inspection',
	});
	return (
		<LinkedTableRow
			action={
				<Button
					aria-label={`View the ${when} inspection of ${label}`}
					asChild
					size="icon-sm"
					variant="ghost"
				>
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/larval-surveillance/inspections/table' }}
						to="/larval-surveillance/inspections/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="tabular-nums">{when}</TableCell>
			<TableCell className="max-w-[22rem] truncate font-medium" title={label}>
				{label}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{typeLabel(row, typeNameById) ?? <AbsentValue />}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.inspectedByName ?? <AbsentValue />}
			</TableCell>
			<TableCell>
				<WetnessBadge isWet={row.isWet} />
			</TableCell>
			<TableCell>
				<DensityBadge density={row.density} />
			</TableCell>
			<TableCell className="text-right tabular-nums">{row.dipCount ?? <AbsentValue />}</TableCell>
			<TableCell>
				<LifeStageStrip size="sm" stages={row} />
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{row.larvaeCount ?? <AbsentValue />}
			</TableCell>
		</LinkedTableRow>
	);
}
