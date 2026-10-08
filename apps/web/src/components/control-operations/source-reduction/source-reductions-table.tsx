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
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useSourceReductionMethodOptions } from '../../../hooks/explorer/use-source-reduction-method-options';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { LinkedTableRow } from '../../record/linked-table-row';
import { formatAmount } from '../control-display';
import {
	linkedHabitatIds,
	type SourceReductionListRow,
	sourceReductionMethodName,
	sourceReductionTechnicianName,
} from './source-reduction-row-parts';

/**
 * A page of Source Reductions as a table, one row per source reduction, each opening its detail
 * page. Takes the rows the route read.
 */
export function SourceReductionsTable({
	rows,
}: {
	readonly rows: readonly SourceReductionListRow[];
}) {
	const { nameById: methodNameById } = useSourceReductionMethodOptions();
	const { nameById: personNameById } = usePersonnelOptions();
	const unitById = useUnitLabels().byId;
	// `habitats` syncs on demand, so resolve only the referenced ids.
	const habitatNameById = useHabitatNames(linkedHabitatIds(rows));
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Method</TableHead>
						<TableHead>Date</TableHead>
						<TableHead className="text-right">Sources Eliminated</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Technician</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<SourceReductionTableRow
							amount={formatAmount(
								row.sourcesEliminatedAmount,
								unitById.get(row.sourcesEliminatedUnitId),
							)}
							habitatName={
								row.habitatId === null ? null : (habitatNameById.get(row.habitatId) ?? null)
							}
							key={row.id}
							methodName={sourceReductionMethodName(row, methodNameById)}
							row={row}
							technicianName={sourceReductionTechnicianName(row, personNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SourceReductionTableRow({
	row,
	methodName,
	amount,
	habitatName,
	technicianName,
}: {
	readonly row: SourceReductionListRow;
	readonly methodName: string;
	readonly amount: string;
	readonly habitatName: string | null;
	readonly technicianName: string | null;
}) {
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${methodName}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/control-operations/source-reduction/table' }}
						to="/control-operations/source-reduction/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={methodName}>
				{methodName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.sourceReductionDate)}</TableCell>
			<TableCell className="text-right tabular-nums">{amount}</TableCell>
			<TableCell className="text-muted-foreground">
				{habitatName === null ? <AbsentValue /> : habitatName}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{technicianName === null ? <AbsentValue /> : technicianName}
			</TableCell>
		</LinkedTableRow>
	);
}
