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
import { useOutreachMethodOptions } from '../../../hooks/explorer/use-outreach-method-options';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { formatListDate } from '../../../lib/local-date';
import { LinkedTableRow } from '../../record/linked-table-row';
import { formatReach } from '../public-engagement-display';
import {
	type OutreachListRow,
	outreachMethodName,
	outreachTechnicianName,
} from './outreach-row-parts';

/**
 * A page of Outreach Actions as a table, one row per action, each opening its detail page. Takes the rows the route read.
 */
export function OutreachActionsTable({ rows }: { readonly rows: readonly OutreachListRow[] }) {
	const { nameById: methodNameById } = useOutreachMethodOptions();
	const { nameById: personNameById } = usePersonnelOptions();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Method</TableHead>
						<TableHead>Date</TableHead>
						<TableHead className="text-right">Reach</TableHead>
						<TableHead>Technician</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<OutreachTableRow
							key={row.id}
							methodName={outreachMethodName(row, methodNameById)}
							row={row}
							technicianName={outreachTechnicianName(row, personNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function OutreachTableRow({
	row,
	methodName,
	technicianName,
}: {
	readonly row: OutreachListRow;
	readonly methodName: string;
	readonly technicianName: string | null;
}) {
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${methodName}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/public-engagement/outreach/table' }}
						to="/public-engagement/outreach/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={methodName}>
				{methodName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.outreachDate)}</TableCell>
			<TableCell className="text-right tabular-nums">{formatReach(row.reach)}</TableCell>
			<TableCell className="text-muted-foreground">
				{technicianName === null ? <AbsentValue /> : technicianName}
			</TableCell>
		</LinkedTableRow>
	);
}
