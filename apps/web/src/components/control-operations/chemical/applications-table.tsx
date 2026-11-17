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
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useInsecticideOptions } from '../../../hooks/explorer/use-insecticide-options';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { LinkedTableRow } from '../../record/linked-table-row';
import {
	applicationMethodName,
	type TreatmentListRow,
	treatmentAmounts,
	treatmentProductNames,
} from './application-row-parts';

/**
 * A page of Treatments as a table, one row per Treatment with its products and
 * their amounts in the row, each opening the Treatment. Takes the rows the
 * route read.
 */
export function ApplicationsTable({ rows }: { readonly rows: readonly TreatmentListRow[] }) {
	const { nameById: insecticideNameById } = useInsecticideOptions();
	const { nameById: methodNameById } = useCatalogOptions(catalogs.applicationMethods);
	const unitById = useUnitLabels().byId;
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Insecticides</TableHead>
						<TableHead>Date</TableHead>
						<TableHead className="text-right">Amount</TableHead>
						<TableHead>Method</TableHead>
						<TableHead>Applicator</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TreatmentTableRow
							amounts={treatmentAmounts(row, unitById)}
							key={row.id}
							methodName={applicationMethodName(row, methodNameById)}
							productNames={treatmentProductNames(row, insecticideNameById)}
							row={row}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function TreatmentTableRow({
	row,
	productNames,
	amounts,
	methodName,
}: {
	readonly row: TreatmentListRow;
	readonly productNames: string;
	readonly amounts: string;
	readonly methodName: string | null;
}) {
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${productNames}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						search={{ via: 'table' }}
						to="/control-operations/chemical/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={productNames}>
				{productNames}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.applicationDate)}</TableCell>
			<TableCell className="text-right tabular-nums">{amounts}</TableCell>
			<TableCell className="text-muted-foreground">
				{methodName === null ? <AbsentValue /> : methodName}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.applicatorName === null ? <AbsentValue /> : row.applicatorName}
			</TableCell>
		</LinkedTableRow>
	);
}
