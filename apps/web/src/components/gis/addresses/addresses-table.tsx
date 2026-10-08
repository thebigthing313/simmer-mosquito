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
import { LinkedTableRow } from '../../record/linked-table-row';
import { type AddressListing, addressName, streetLine } from './address-row-parts';

/**
 * A page of the Address Book as a table, one row per address, each opening its detail page. Takes the rows the route read.
 */
export function AddressesTable({ rows }: { readonly rows: readonly AddressListing[] }) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Name</TableHead>
						<TableHead>Street</TableHead>
						<TableHead>Locality</TableHead>
						<TableHead>Postal Code</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<AddressTableRowView key={row.id} row={row} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function AddressTableRowView({ row }: { readonly row: AddressListing }) {
	const name = addressName(row);
	const street = streetLine(row);
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/gis/addresses/table' }}
						to="/gis/addresses/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="text-muted-foreground">{textOrAbsent(street)}</TableCell>
			<TableCell className="text-muted-foreground">{textOrAbsent(row.locality)}</TableCell>
			<TableCell className="text-muted-foreground tabular-nums">
				{textOrAbsent(row.postalCode)}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The text, or the absent mark where there is none or it is blank. */
function textOrAbsent(text: string | null) {
	const trimmed = text?.trim() ?? '';
	return trimmed.length === 0 ? <AbsentValue /> : trimmed;
}
