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
import { useBiocontrolMethodOptions } from '../../../hooks/explorer/use-biocontrol-method-options';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { LinkedTableRow } from '../../record/linked-table-row';
import { formatAmount } from '../control-display';
import {
	type BiocontrolListRow,
	biocontrolMethodName,
	biocontrolTechnicianName,
	linkedHabitatIds,
} from './biocontrol-row-parts';

/**
 * A page of Biocontrol Actions as a table, one row per action, each opening its detail page. Takes
 * the rows the route read.
 */
export function BiocontrolActionsTable({ rows }: { readonly rows: readonly BiocontrolListRow[] }) {
	const { nameById: methodNameById } = useBiocontrolMethodOptions();
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
						<TableHead className="text-right">Amount Released</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Technician</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<BiocontrolTableRow
							amount={formatAmount(row.amountReleased, unitById.get(row.releaseUnitId))}
							habitatName={
								row.habitatId === null ? null : (habitatNameById.get(row.habitatId) ?? null)
							}
							key={row.id}
							methodName={biocontrolMethodName(row, methodNameById)}
							row={row}
							technicianName={biocontrolTechnicianName(row, personNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function BiocontrolTableRow({
	row,
	methodName,
	amount,
	habitatName,
	technicianName,
}: {
	readonly row: BiocontrolListRow;
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
						state={{ breadcrumbVia: '/control-operations/biocontrol/table' }}
						to="/control-operations/biocontrol/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={methodName}>
				{methodName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.biocontrolDate)}</TableCell>
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
