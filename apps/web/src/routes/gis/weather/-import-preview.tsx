import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import type { ParsedSummaryRow } from './-import-parse';

/**
 * The readings a file holds, before any of them are written.
 *
 * Counts alone tell someone the file parsed; they do not tell them it parsed
 * *correctly*. A column mapped to the wrong field, a date read a day off, a
 * decimal point in the wrong place: each of those produces a perfectly healthy
 * "412 readable" and a spreadsheet's worth of wrong data. Seeing the first rows
 * as SIMMER understood them is what catches it, and it has to happen here,
 * because after the commit the fix is deleting rows one at a time.
 *
 * ## Only the columns the file carried
 *
 * A summary can hold seven metrics and most files carry two or three. Rendering
 * all seven would be four columns of dashes wide enough to push the real ones off
 * screen, and would say nothing — an absent column and an empty cell are already
 * the same thing to the writer. So the columns are derived from what actually
 * arrived.
 */
export function ImportPreview({ rows }: { readonly rows: readonly ParsedSummaryRow[] }) {
	if (rows.length === 0) {
		return null;
	}

	const columns = METRIC_COLUMNS.filter((column) => rows.some((row) => row[column.key] !== null));
	const shown = rows.slice(0, PREVIEW_ROWS);

	return (
		<div className="grid gap-2">
			<div className="overflow-x-auto rounded-md border border-border/40">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-16">Line</TableHead>
							<TableHead>Period</TableHead>
							{columns.map((column) => (
								<TableHead className="text-right" key={column.key}>
									{column.label}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((row) => (
							<TableRow key={row.line}>
								<TableCell className="text-muted-foreground tabular-nums">{row.line}</TableCell>
								<TableCell className="font-medium text-foreground">{periodLabel(row)}</TableCell>
								{columns.map((column) => (
									<TableCell className="text-right tabular-nums" key={column.key}>
										{row[column.key] ?? '—'}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{rows.length > shown.length ? (
				<p className="m-0 text-muted-foreground text-xs">
					Showing the first {shown.length} of {rows.length.toLocaleString()} readings. All of them
					are imported.
				</p>
			) : null}
		</div>
	);
}

/** Enough to see a mapping mistake without rendering five thousand rows. */
const PREVIEW_ROWS = 25;

const METRIC_COLUMNS = [
	{ key: 'temperatureMinF', label: 'Min °F' },
	{ key: 'temperatureMaxF', label: 'Max °F' },
	{ key: 'precipitationInches', label: 'Precip in' },
	{ key: 'relativeHumidityMin', label: 'Min RH %' },
	{ key: 'relativeHumidityMax', label: 'Max RH %' },
	{ key: 'windSpeedMinMph', label: 'Min mph' },
	{ key: 'windSpeedMaxMph', label: 'Max mph' },
] as const satisfies readonly {
	readonly key: keyof ParsedSummaryRow;
	readonly label: string;
}[];

/**
 * The bucket a row covers.
 *
 * The raw `YYYY-MM-DD` rather than a formatted date, on purpose: this table is
 * for checking that SIMMER read the file the way the file meant it, and a
 * reformatted date is one more step between what the user typed and what they are
 * being shown.
 */
function periodLabel(row: ParsedSummaryRow): string {
	return row.startDate === row.endDate ? row.startDate : `${row.startDate} → ${row.endDate}`;
}
