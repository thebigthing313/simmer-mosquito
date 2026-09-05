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
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useWeatherStation, type WeatherStation } from '../../../hooks/queries/use-weather-station';
import { useAllWeatherSummaries } from '../../../hooks/queries/use-weather-summaries';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { IMPORT_REFUSALS } from '../../../lib/acknowledgement-copy';
import { todayInTimeZone } from '../../../lib/local-date';
import { isBelowRole } from '../../../lib/write-access';
import { assessParsedRows, type FileAssessment } from './-import-assessment';
import {
	commitWeatherImport,
	type WeatherImportResult,
	type WeatherImportRowResult,
} from './-import-commit';
import {
	IMPORT_COLUMNS,
	IMPORT_FILE_ACCEPT,
	type ImportColumn,
	MAX_IMPORT_ROWS,
	type ParseResult,
	parseWeatherFile,
} from './-import-parse';
import { ImportPreview } from './-import-preview';

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
 * file says, then commit. The review is not decoration, an import overwrites
 * readings that already exist, and the two things a user has to agree to before
 * anything is written are how many rows would be overwritten and how many cannot
 * be written at all.
 *
 * ## The counts on screen are the client's, and the ones that matter are not
 *
 * The review names what each line would do, worked out against the readings this
 * station already holds. The server re-derives the same verdict inside the write
 * transaction, against the rows actually stored, and that is the one that writes.
 * So the review is an estimate a user acts on and the result underneath is the
 * truth. They usually agree; when they do not, someone else recorded a reading
 * while the file was open, which is what the server-side re-check exists for.
 *
 * Only rows the review did not fail are submitted. That is step 7 of the spec's
 * upload flow, "commits selected attemptable rows", and it is also what keeps one
 * repeated date in a spreadsheet from being an argument about the whole batch.
 */
/**
 * Choosing a file, working out what it would do, and committing it.
 *
 * The page's whole state machine, kept out of the component that draws it: six
 * pieces of state, an assessment that has to be computed once rather than per
 * render, and a commit that answers a refusal with a dialog.
 */
function useWeatherUpload(stationId: string) {
	// The organization's calendar day, so the review and the server agree about
	// which rows are dated in the future.
	const today = todayInTimeZone(useOrganizationTimeZone());
	// Every reading the station holds, not the year the detail page was showing.
	// The assessment answers insert, update, no change or fail per row against
	// what is already stored, so a narrower window would report a row overwriting
	// a 2019 reading as an insert.
	const { summaries, isReady } = useAllWeatherSummaries(stationId);
	const { run, dialog } = useAcknowledgedWrite({ askable: IMPORT_REFUSALS, ask: true });

	const [fileName, setFileName] = useState<string | null>(null);
	const [parsed, setParsed] = useState<ParseResult | null>(null);
	const [assessment, setAssessment] = useState<FileAssessment | null>(null);
	const [result, setResult] = useState<WeatherImportResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);

	const chooseFile = useCallback(
		(file: File | undefined) => {
			if (file === undefined) {
				return;
			}
			setError(null);
			setResult(null);
			setFileName(file.name);
			setIsBusy(true);
			void parseWeatherFile(file)
				.then((read) => {
					setParsed(read);
					// Assessed once, here, rather than on every render: the ids it mints
					// are the ones the commit sends, and re-minting them would make a
					// retry insert under different ids.
					setAssessment(assessParsedRows(read.rows, summaries, newRecordId, today));
				})
				.finally(() => setIsBusy(false));
		},
		[summaries, today],
	);

	const commit = useCallback(() => {
		if (assessment === null || assessment.attemptable.length === 0) {
			return;
		}
		setError(null);
		setIsBusy(true);
		// Only the rows the review did not fail. The server assesses again and can
		// still refuse one, but it is not asked to write a line the user has already
		// been shown as unwritable.
		//
		// Both acknowledgements go out withheld, which `ask: true` sends as `false`
		// so the guards run at all. What the file would overwrite is the server's to
		// answer against stored rows, and it answers by refusing once and naming what
		// it found, which is a better question than one asked from the client's own
		// estimate.
		void run(async (acknowledgements) => {
			setResult(
				await commitWeatherImport({
					weatherStationId: stationId,
					rows: assessment.attemptable,
					acknowledgedUpdates: acknowledgements.acknowledgedUpdates === true,
					acknowledgedPartialImport: acknowledgements.acknowledgedPartialImport === true,
				}),
			);
		})
			.catch((cause: unknown) =>
				setError(cause instanceof Error ? cause.message : 'Unable to import these readings.'),
			)
			.finally(() => setIsBusy(false));
	}, [assessment, run, stationId]);

	return {
		fileName,
		parsed,
		assessment,
		result,
		error,
		isBusy,
		dialog,
		chooseFile,
		commit,
		canCommit: (assessment?.attemptable.length ?? 0) > 0 && !isBusy && isReady,
	};
}

function ImportWeatherPage({ station }: { readonly station: WeatherStation }) {
	// As on the edit page: this route is the detail route's sibling, so it has to
	// name the station itself or the crumb shows the bare id.
	useBreadcrumbLabel(station.id, station.name);
	const navigate = useNavigate();
	const upload = useWeatherUpload(station.id);

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

				<FilePickerCard isBusy={upload.isBusy} onFile={upload.chooseFile} />

				{upload.error === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Import</AlertTitle>
						<AlertDescription>{upload.error}</AlertDescription>
					</Alert>
				)}

				{upload.parsed === null || upload.assessment === null ? null : (
					<ParsedFileCard
						assessment={upload.assessment}
						canCommit={upload.canCommit}
						fileName={upload.fileName ?? 'the file'}
						onCommit={upload.commit}
						parsed={upload.parsed}
					/>
				)}

				{upload.result === null ? null : (
					<ImportResultCard
						onDone={() => void navigate({ to: '/gis/weather/$id', params: { id: station.id } })}
						result={upload.result}
						stationName={station.name}
					/>
				)}
			</div>
			{upload.dialog}
		</div>
	);
}

/** Choosing the file, and what the parser expects of it. */
function FilePickerCard({
	isBusy,
	onFile,
}: {
	readonly isBusy: boolean;
	readonly onFile: (file: File | undefined) => void;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Choose a File</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<Input
					accept={IMPORT_FILE_ACCEPT}
					aria-label="Spreadsheet of readings"
					disabled={isBusy}
					onChange={(event) => onFile(event.target.files?.[0])}
					type="file"
				/>
				<p className="m-0 text-muted-foreground text-xs">
					Readings are read in °F, inches, percent and mph. Up to {MAX_IMPORT_ROWS.toLocaleString()}{' '}
					rows.
				</p>
				<ColumnGuide />
			</CardContent>
		</Card>
	);
}

/**
 * The headings a file may name its columns with, before one is chosen.
 *
 * Every spelling comes off the parser's own map, so this cannot drift from what
 * a file is actually matched against. Without it a user learned the headings by
 * uploading a file and reading back the list of columns that went unmapped.
 */
function ColumnGuide() {
	return (
		<div className="grid gap-2">
			<p className="m-0 text-muted-foreground text-xs">
				The first row names the columns. Case, spaces, punctuation and a bracketed unit are ignored,
				so "Start Date" and "start_date" are the same heading.
			</p>
			<div className="overflow-x-auto rounded-md border border-border/40">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-[13rem]">Column</TableHead>
							<TableHead>Headings</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{IMPORT_COLUMNS.required.map((column) => (
							<ColumnGuideRow column={column} isRequired key={column.label} />
						))}
						{IMPORT_COLUMNS.recommended.map((column) => (
							<ColumnGuideRow column={column} isRequired={false} key={column.label} />
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

function ColumnGuideRow({
	column,
	isRequired,
}: {
	readonly column: ImportColumn;
	readonly isRequired: boolean;
}) {
	return (
		<TableRow>
			<TableCell className="font-medium text-foreground">
				<span className="flex flex-wrap items-center gap-1.5">
					{column.label}
					{isRequired ? (
						<Badge tone="info" variant="outline">
							Required
						</Badge>
					) : null}
				</span>
			</TableCell>
			<TableCell className="text-muted-foreground">{column.headings.join(', ')}</TableCell>
		</TableRow>
	);
}

function ParsedFileCard({
	parsed,
	assessment,
	fileName,
	canCommit,
	onCommit,
}: {
	readonly parsed: ParseResult;
	readonly assessment: FileAssessment;
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
					Import {assessment.attemptable.length.toLocaleString()} Rows
				</Button>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<AssessmentCounts assessment={assessment} parsed={parsed} />

				{parsed.unmappedColumns.length === 0 ? null : (
					<p className="m-0 text-muted-foreground text-sm">
						Columns not recognised and ignored: {parsed.unmappedColumns.join(', ')}.
					</p>
				)}

				<SkippedLines rejected={parsed.rejected} />

				<ImportPreview assessed={assessment.rows} />
			</CardContent>
		</Card>
	);
}

/**
 * What the file would do, not merely that it parsed.
 *
 * A column mapped to the wrong field still reports "412 readable". "412 would
 * overwrite" is the number somebody stops on.
 */
function AssessmentCounts({
	assessment,
	parsed,
}: {
	readonly assessment: FileAssessment;
	readonly parsed: ParseResult;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			<Badge tone="success" variant="outline">
				{assessment.counts.insert.toLocaleString()} to add
			</Badge>
			{assessment.counts.update === 0 ? null : (
				<Badge tone="info" variant="outline">
					{assessment.counts.update.toLocaleString()} would overwrite
				</Badge>
			)}
			{assessment.counts.noChange === 0 ? null : (
				<Badge tone="neutral" variant="outline">
					{assessment.counts.noChange.toLocaleString()} already recorded
				</Badge>
			)}
			{assessment.counts.fail === 0 ? null : (
				<Badge tone="danger" variant="outline">
					{assessment.counts.fail.toLocaleString()} cannot be written
				</Badge>
			)}
			{parsed.rejected.length === 0 ? null : (
				<Badge tone="warning" variant="outline">
					{parsed.rejected.length.toLocaleString()} unreadable
				</Badge>
			)}
			{parsed.truncated ? (
				<Badge tone="warning" variant="outline">
					Only the first {MAX_IMPORT_ROWS.toLocaleString()} kept
				</Badge>
			) : null}
		</div>
	);
}

/**
 * The lines that will not be sent, named individually.
 *
 * "3 rows were skipped" is a dead end; "line 84 has no readings" is something a
 * person can open their own file and fix. Ten is enough to see the pattern
 * without turning the review into the failure list.
 */
function SkippedLines({
	rejected,
}: {
	readonly rejected: readonly { readonly line: number; readonly reason: string }[];
}) {
	if (rejected.length === 0) {
		return null;
	}
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-muted/30 p-3">
			{rejected.slice(0, 10).map((entry) => (
				<p className="m-0 text-muted-foreground text-xs" key={entry.line}>
					Line {entry.line}: {entry.reason}
				</p>
			))}
			{rejected.length > 10 ? (
				<p className="m-0 text-muted-foreground text-xs">
					…and {(rejected.length - 10).toLocaleString()} more.
				</p>
			) : null}
		</div>
	);
}

function ImportResultCard({
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
			<CardHeader className="px-4 py-4">
				<CardTitle>Imported</CardTitle>
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
							: `${written.toLocaleString()} ${written === 1 ? 'reading is' : 'readings are'} now on ${stationName}.`}
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
 * The rows the server would not write, and what it said about each.
 *
 * The server's verdict rather than the parser's: these are lines that read fine
 * and were still refused, usually for overlapping a bucket the station already
 * holds. `clientRowId` is the spreadsheet line, so the reason points at somewhere
 * in the file the user can open.
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
