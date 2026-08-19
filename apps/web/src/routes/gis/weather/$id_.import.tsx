import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { RecordUnavailable } from '../../../components/record';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useWeatherStation, type WeatherStation } from '../../../hooks/queries/use-weather-station';
import { isBelowRole } from '../../../lib/write-access';
import { commitWeatherImport, type WeatherImportResult } from './-import-commit';
import {
	IMPORT_FILE_ACCEPT,
	MAX_IMPORT_ROWS,
	type ParseResult,
	parseWeatherFile,
} from './-import-parse';
import { IMPORT_REFUSALS } from './-weather-acknowledgements';

export const Route = createFileRoute('/gis/weather/$id_/import')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ params: { id: params.id }, replace: true, to: '/gis/weather/$id' });
		}
	},
	component: ImportWeatherRoute,
});

function ImportWeatherRoute() {
	const { id } = Route.useParams();
	const { station, isReady } = useWeatherStation(id);

	if (!isReady) {
		return null;
	}
	if (station === undefined) {
		return <RecordUnavailable layout="centered" noun="weather station" reason="not-found" />;
	}
	return <ImportWeatherPage station={station} />;
}

/**
 * Loading a spreadsheet of readings into one station.
 *
 * Three steps, and the middle one is the point: pick a file, look at what the
 * file says, then commit. The review is not decoration — an import overwrites
 * readings that already exist, and the two things a user has to agree to before
 * anything is written are how many rows would be overwritten and how many cannot
 * be written at all.
 *
 * ## The counts on screen are the client's, and the ones that matter are not
 *
 * What this page shows after parsing is what the *file* holds. The server
 * re-derives insert/update/no-change/fail against the station's rows inside the
 * write transaction, and its verdict is what writes — so the review is an
 * estimate a user acts on, and the result table underneath is the truth. They
 * usually agree; when they do not, it is because someone else recorded a reading
 * while this file was open, which is exactly the case the server-side re-check
 * exists for.
 */
function ImportWeatherPage({ station }: { readonly station: WeatherStation }) {
	const navigate = useNavigate();
	const { run, dialog } = useAcknowledgedWrite(IMPORT_REFUSALS, {
		title: 'Import anyway?',
		confirm: 'Import',
		fallbackReason: 'Some of these rows cannot be written as they are.',
	});

	const [fileName, setFileName] = useState<string | null>(null);
	const [parsed, setParsed] = useState<ParseResult | null>(null);
	const [result, setResult] = useState<WeatherImportResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);

	const onFile = useCallback(async (file: File | undefined) => {
		if (file === undefined) {
			return;
		}
		setError(null);
		setResult(null);
		setFileName(file.name);
		setIsBusy(true);
		try {
			setParsed(await parseWeatherFile(file));
		} finally {
			setIsBusy(false);
		}
	}, []);

	const onCommit = useCallback(async () => {
		if (parsed === null || parsed.rows.length === 0) {
			return;
		}
		setError(null);
		setIsBusy(true);
		try {
			// The ids are minted here, one per line, and the server honours them for
			// the rows it inserts and ignores them for the rows it updates — an
			// existing bucket keeps its own id, because anything already pointing at
			// it has to keep resolving.
			const rows = parsed.rows.map((row) => ({
				clientRowId: String(row.line),
				weatherSummaryId: newRecordId(),
				startDate: row.startDate,
				endDate: row.endDate,
				temperatureMinF: row.temperatureMinF,
				temperatureMaxF: row.temperatureMaxF,
				precipitationInches: row.precipitationInches,
				relativeHumidityMin: row.relativeHumidityMin,
				relativeHumidityMax: row.relativeHumidityMax,
				windSpeedMinMph: row.windSpeedMinMph,
				windSpeedMaxMph: row.windSpeedMaxMph,
			}));

			// Sent with neither acknowledgement. Whether this file overwrites anything
			// is the server's to answer, and it answers by refusing once and naming
			// what it found — which is a better question than one asked up front off
			// the client's own guess.
			await run(async (acknowledgements) => {
				setResult(
					await commitWeatherImport({
						weatherStationId: station.id,
						rows,
						acknowledgedUpdates: acknowledgements.acknowledgedUpdates === true,
						acknowledgedPartialImport: acknowledgements.acknowledgedPartialImport === true,
					}),
				);
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to import these readings.');
		} finally {
			setIsBusy(false);
		}
	}, [parsed, run, station.id]);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[900px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link className={backLink()} params={{ id: station.id }} to="/gis/weather/$id">
					<ArrowLeftIcon aria-hidden="true" />
					Back to {station.name}
				</Link>

				<div className="grid gap-1.5">
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						Import Readings
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						Load a CSV or Excel file of readings for {station.name}.
					</p>
				</div>

				<Card variant="surface">
					<CardHeader className="px-4 py-4">
						<CardTitle>Choose a File</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3" padding="compact">
						<Input
							accept={IMPORT_FILE_ACCEPT}
							aria-label="Spreadsheet of readings"
							disabled={isBusy}
							onChange={(event) => void onFile(event.target.files?.[0])}
							type="file"
						/>
						<p className="m-0 text-muted-foreground text-xs">
							The first row names the columns. A date column is required; readings are read in °F,
							inches, percent and mph. Up to {MAX_IMPORT_ROWS.toLocaleString()} rows.
						</p>
					</CardContent>
				</Card>

				{error === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Import</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{parsed === null ? null : (
					<ParsedFileCard
						canCommit={parsed.rows.length > 0 && !isBusy}
						fileName={fileName ?? 'the file'}
						onCommit={() => void onCommit()}
						parsed={parsed}
					/>
				)}

				{result === null ? null : (
					<ImportResultCard
						onDone={() => void navigate({ to: '/gis/weather/$id', params: { id: station.id } })}
						result={result}
					/>
				)}
			</div>
			{dialog}
		</div>
	);
}

function ParsedFileCard({
	parsed,
	fileName,
	canCommit,
	onCommit,
}: {
	readonly parsed: ParseResult;
	readonly fileName: string;
	readonly canCommit: boolean;
	readonly onCommit: () => void;
}) {
	if (parsed.error !== undefined) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Unable to Read {fileName}</AlertTitle>
				<AlertDescription>{parsed.error}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card variant="surface">
			<CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
				<CardTitle>{fileName}</CardTitle>
				<Button disabled={!canCommit} onClick={onCommit} type="button">
					Import {parsed.rows.length.toLocaleString()} Rows
				</Button>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<div className="flex flex-wrap gap-2">
					<Badge tone="success" variant="outline">
						{parsed.rows.length.toLocaleString()} readable
					</Badge>
					{parsed.rejected.length === 0 ? null : (
						<Badge tone="warning" variant="outline">
							{parsed.rejected.length.toLocaleString()} skipped
						</Badge>
					)}
					{parsed.truncated ? (
						<Badge tone="warning" variant="outline">
							Only the first {MAX_IMPORT_ROWS.toLocaleString()} kept
						</Badge>
					) : null}
				</div>

				{parsed.unmappedColumns.length === 0 ? null : (
					<p className="m-0 text-muted-foreground text-sm">
						Columns not recognised and ignored: {parsed.unmappedColumns.join(', ')}.
					</p>
				)}

				{parsed.rejected.length === 0 ? null : (
					<div className="grid gap-1 rounded-md border border-border/40 bg-muted/30 p-3">
						{/* Named individually rather than counted, because "line 84 has no
						    readings" is something a person can go and fix. */}
						{parsed.rejected.slice(0, 10).map((entry) => (
							<p className="m-0 text-muted-foreground text-xs" key={entry.line}>
								Line {entry.line}: {entry.reason}
							</p>
						))}
						{parsed.rejected.length > 10 ? (
							<p className="m-0 text-muted-foreground text-xs">
								…and {(parsed.rejected.length - 10).toLocaleString()} more.
							</p>
						) : null}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function ImportResultCard({
	result,
	onDone,
}: {
	readonly result: WeatherImportResult;
	readonly onDone: () => void;
}) {
	const failed = result.rows.filter((row) => row.status === 'failed');

	return (
		<Card variant="surface">
			<CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
				<CardTitle>Imported</CardTitle>
				<Button onClick={onDone} type="button" variant="outline">
					Back to Station
				</Button>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<div className="flex flex-wrap gap-2">
					<Badge tone="success" variant="outline">
						{result.counts.inserted.toLocaleString()} added
					</Badge>
					<Badge tone="info" variant="outline">
						{result.counts.updated.toLocaleString()} updated
					</Badge>
					<Badge tone="neutral" variant="outline">
						{result.counts.noChange.toLocaleString()} unchanged
					</Badge>
					{result.counts.failed === 0 ? null : (
						<Badge tone="danger" variant="outline">
							{result.counts.failed.toLocaleString()} failed
						</Badge>
					)}
				</div>

				{failed.length === 0 ? null : (
					<div className="overflow-x-auto rounded-md border border-border/40">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="w-20">Line</TableHead>
									<TableHead>Why</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{failed.map((row) => (
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
				)}
			</CardContent>
		</Card>
	);
}
