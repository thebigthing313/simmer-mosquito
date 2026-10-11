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
import { formatAmount } from '../control-display';
import {
	type ApplicationListRow,
	applicationMethodName,
	insecticideName,
} from './application-row-parts';

/**
 * A page of Chemical Applications as a table, one row per application, each opening its detail
 * page. Takes the rows the route read.
 */
export function ApplicationsTable({ rows }: { readonly rows: readonly ApplicationListRow[] }) {
	const { nameById: insecticideNameById } = useInsecticideOptions();
	const { nameById: methodNameById } = useCatalogOptions(catalogs.applicationMethods);
	const unitById = useUnitLabels().byId;
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Insecticide</TableHead>
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
						<ApplicationTableRow
							amount={formatAmount(row.amountApplied, unitById.get(row.applicationUnitId))}
							key={row.id}
							methodName={applicationMethodName(row, methodNameById)}
							productName={insecticideName(row.insecticideId, insecticideNameById)}
							row={row}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ApplicationTableRow({
	row,
	productName,
	amount,
	methodName,
}: {
	readonly row: ApplicationListRow;
	readonly productName: string;
	readonly amount: string;
	readonly methodName: string | null;
}) {
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${productName}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/control-operations/chemical/table' }}
						to="/control-operations/chemical/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={productName}>
				{productName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.applicationDate)}</TableCell>
			<TableCell className="text-right tabular-nums">{amount}</TableCell>
			<TableCell className="text-muted-foreground">
				{methodName === null ? <AbsentValue /> : methodName}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.applicatorName === null ? <AbsentValue /> : row.applicatorName}
			</TableCell>
		</LinkedTableRow>
	);
}
