import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import type { WeatherImportResult, WeatherImportRowResult } from './import-commit';

export function ImportResultCard({
	result,
	stationName,
	onDone,
}: {
	readonly result: WeatherImportResult;
	readonly stationName: string;
	readonly onDone: () => void;
}) {
	const failed = result.rows.filter((row) => row.status === 'failed');
	const written = result.counts.inserted + result.counts.updated;

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Imported</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<div className="flex flex-wrap gap-2">
					<Badge tone="success" variant="outline">
						{result.counts.inserted.toLocaleString('en-US')} added
					</Badge>
					<Badge tone="info" variant="outline">
						{result.counts.updated.toLocaleString('en-US')} updated
					</Badge>
					<Badge tone="neutral" variant="outline">
						{result.counts.noChange.toLocaleString('en-US')} unchanged
					</Badge>
					{result.counts.failed === 0 ? null : (
						<Badge tone="danger" variant="outline">
							{result.counts.failed.toLocaleString('en-US')} failed
						</Badge>
					)}
				</div>

				<FailedRows rows={failed} />

				{/* The ending action, and the only one: an import is finished when the
				    readings are on the station, so the page says so and sends the user
				    to look at them. A second "import another file" button would invite a
				    rerun of the file just committed, which is the commonest way to
				    double-enter a month of weather. */}
				<div className="flex flex-wrap items-center justify-between gap-3 border-border/40 border-t pt-3">
					<p className="m-0 text-muted-foreground text-sm">
						{written === 0
							? `Nothing changed on ${stationName}.`
							: `${written.toLocaleString('en-US')} ${written === 1 ? 'reading is' : 'readings are'} now on ${stationName}.`}
					</p>
					<Button onClick={onDone} type="button">
						View Readings
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * The rows the server would not write, and what it said about each: lines
 * that read fine and were still refused, usually for overlapping a bucket the
 * station already holds. `clientRowId` is the spreadsheet line.
 */
function FailedRows({ rows }: { readonly rows: readonly WeatherImportRowResult[] }) {
	if (rows.length === 0) {
		return null;
	}
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-20">Line</TableHead>
						<TableHead>Why</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.clientRowId}>
							<TableCell className="tabular-nums">{row.clientRowId}</TableCell>
							<TableCell className="text-muted-foreground">
								{row.issues.map((issue) => issue.message).join(' ') ||
									'This row could not be written.'}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
