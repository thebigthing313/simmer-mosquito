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
import { useSpeciesOptions } from '../../../hooks/explorer/use-species-options';
import { formatListDate } from '../../../lib/local-date';
import { sampleName } from '../../../lib/sample-name';
import { LinkedTableRow } from '../../record/linked-table-row';
import {
	SampleContext,
	type SampleListRow,
	SpeciesResults,
	sampleSwatch,
} from './sample-row-parts';

/** How many species a row names before collapsing the rest to "+N". */
const RESULT_CHIP_LIMIT = 3;

/**
 * A page of Samples as a table, one row per sample with its species results, each opening its detail page. Takes the rows the route read.
 */
export function SamplesTable({ rows }: { readonly rows: readonly SampleListRow[] }) {
	const { nameById } = useSpeciesOptions();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Sample</TableHead>
						<TableHead>Inspected</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Species</TableHead>
						<TableHead className="text-right">Larvae</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<SampleRow key={row.id} nameById={nameById} row={row} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SampleRow({
	nameById,
	row,
}: {
	readonly nameById: ReadonlyMap<string, string>;
	readonly row: SampleListRow;
}) {
	const name = sampleName(row);
	const swatch = sampleSwatch(row);
	const isIdentified = row.status === 'identified';
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/larval-surveillance/samples/table' }}
						to="/larval-surveillance/samples/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[14rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.inspectionDate)}</TableCell>
			<TableCell className="max-w-[20rem]">
				<SampleContext sample={row} />
			</TableCell>
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
			<TableCell>
				{isIdentified ? (
					<SpeciesResults limit={RESULT_CHIP_LIMIT} nameById={nameById} sample={row} />
				) : (
					<AbsentValue />
				)}
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{isIdentified ? row.larvaeTotal.toLocaleString('en-US') : <AbsentValue />}
			</TableCell>
		</LinkedTableRow>
	);
}
