import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { type AssessedRow, actionLabel } from './import-assessment';
import type { ParsedSummaryRow } from './import-parse';

/**
 * The readings a file holds, and what each one would do. The first rows as
 * SIMMER understood them are what catch a column mapped to the wrong field or
 * a date read a day off, and the verdict column is what the spec asks for:
 * "User reviews insert/update/no-change/fail counts and row details". Only
 * the columns the file carried are rendered.
 */
export function ImportPreview({ assessed }: { readonly assessed: readonly AssessedRow[] }) {
	if (assessed.length === 0) {
		return null;
	}

	const columns = METRIC_COLUMNS.filter((column) =>
		assessed.some((entry) => entry.row[column.key] !== null),
	);
	const shown = assessed.slice(0, PREVIEW_ROWS);

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
							<TableHead className="w-36">Result</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((entry) => (
							<TableRow key={entry.line}>
								<TableCell className="text-muted-foreground tabular-nums">{entry.line}</TableCell>
								<TableCell className="font-medium text-foreground">
									{periodLabel(entry.row)}
								</TableCell>
								{columns.map((column) => (
									<TableCell className="text-right tabular-nums" key={column.key}>
										{entry.row[column.key] ?? ','}
									</TableCell>
								))}
								<TableCell>
									<Badge tone={ACTION_TONE[entry.action]} variant="outline">
										{actionLabel(entry.action)}
									</Badge>
									{entry.issues.length === 0 ? null : (
										<span className="mt-1 block text-muted-foreground text-xs">
											{entry.issues[0]?.message}
										</span>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{assessed.length > shown.length ? (
				<p className="m-0 text-muted-foreground text-xs">
					Showing the first {shown.length} of {assessed.length.toLocaleString('en-US')} readings.
				</p>
			) : null}
		</div>
	);
}

/** Enough to see a mapping mistake without rendering five thousand rows. */
const PREVIEW_ROWS = 25;

const ACTION_TONE = {
	insert: 'success',
	update: 'info',
	noChange: 'neutral',
	fail: 'danger',
} as const;

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
 * The bucket a row covers, as the raw `YYYY-MM-DD`, so the user compares it
 * against what they typed.
 */
function periodLabel(row: { readonly startDate: string; readonly endDate: string }): string {
	return row.startDate === row.endDate ? row.startDate : `${row.startDate} → ${row.endDate}`;
}
