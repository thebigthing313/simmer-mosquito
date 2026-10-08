import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
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
import { CheckCircle2Icon, ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useCollectionMethodOptions } from '../../../hooks/explorer/use-collection-method-options';
import { trapDisplayName } from '../../../hooks/queries/trap-view';
import { ClampedTextCell, LinkedTableRow } from '../../record/linked-table-row';
import { TRAP_STATUS_LABELS } from './legend';

/** One Trap as `/map/traps` answers it, cut to what the table draws. */
export interface TrapTableRow {
	readonly id: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly collectionMethodId: string;
	readonly description: string | null;
	readonly isActive: boolean;
}

/**
 * A page of Traps as a table, one row per trap, each opening its detail page. Takes the rows the
 * route read.
 */
export function TrapsTable({ rows }: { readonly rows: readonly TrapTableRow[] }) {
	const { nameById: methodNameById } = useCollectionMethodOptions();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Name</TableHead>
						<TableHead>Method</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Description</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TrapTableRowView
							key={row.id}
							methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
							row={row}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function TrapTableRowView({
	row,
	methodName,
}: {
	readonly row: TrapTableRow;
	readonly methodName: string;
}) {
	const name = trapDisplayName(row);
	const description = row.description?.trim() ?? '';
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/adult-surveillance/traps/table' }}
						to="/adult-surveillance/traps/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="text-muted-foreground">{methodName}</TableCell>
			<TableCell>
				{row.isActive ? (
					<Badge tone="success" variant="outline">
						<CheckCircle2Icon aria-hidden="true" />
						{TRAP_STATUS_LABELS.active}
					</Badge>
				) : (
					<Badge tone="neutral" variant="outline">
						{TRAP_STATUS_LABELS.inactive}
					</Badge>
				)}
			</TableCell>
			<ClampedTextCell empty={<AbsentValue />} text={description} />
		</LinkedTableRow>
	);
}
