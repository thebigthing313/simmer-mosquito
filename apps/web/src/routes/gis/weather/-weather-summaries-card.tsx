import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { WriteOnly } from '../../../components/write-only';
import { useWeatherSummaryMutations } from '../../../hooks/mutations/use-weather-summary-mutations';
import {
	useWeatherSummaries,
	useWeatherSummaryYears,
	type WeatherSummaryListing,
} from '../../../hooks/queries/use-weather-summaries';
import { formatMeasure, formatRange, summaryPeriodLabel } from './-weather-display';
import { WeatherSummaryDialog } from './-weather-summary-dialog';

const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const ImportIcon = iconRegistry.actions.upload.icon;

/**
 * A station's readings, a year at a time, and the three ways to change them.
 *
 * ## Why a year at a time
 *
 * A station logged daily for ten years is 3,650 readings, and the card used to
 * put all of them in one table. The tabs are the years the station has readings
 * in, newest first, and the table under them is one year's.
 *
 * ## Why the tab follows the write
 *
 * `weather_summaries` is on-demand, and a write into a subset the live query
 * does not cover waits out a txid that never arrives on it. `settleWrite`
 * swallows that five-second timeout, so it is a slow save over a row the user
 * cannot see rather than a failure, and moving the tab to the written year fixes
 * both. This is also why the dialog is mounted here rather than on a route of
 * its own: the card is what keeps the station's subset queried at all.
 */
export function WeatherSummariesCard({
	stationId,
	isStationActive,
}: {
	readonly stationId: string;
	readonly isStationActive: boolean;
}) {
	const { years, isReady: yearsReady, isError: yearsError } = useWeatherSummaryYears(stationId);
	const { activeYear, tabYears, chooseYear } = useActiveYear(stationId, years);
	const { summaries, isReady, isError } = useWeatherSummaries(stationId, activeYear);
	const mutations = useWeatherSummaryMutations();
	const [editing, setEditing] = useState<{ readonly summary: WeatherSummaryListing | null } | null>(
		null,
	);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<WeatherSummaryListing | null>(null);

	const remove = useCallback(
		async (summaryId: string) => {
			setRemoveError(null);
			try {
				await mutations.remove(summaryId);
			} catch (error) {
				setRemoveError(error instanceof Error ? error.message : 'Unable to delete summary.');
			}
		},
		[mutations],
	);

	return (
		<Card variant="surface">
			<CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
				<CardTitle>Summaries</CardTitle>
				<SummaryActions
					isStationActive={isStationActive}
					onRecord={() => setEditing({ summary: null })}
					stationId={stationId}
				/>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				{removeError === null ? null : (
					<p className="m-0 text-destructive text-sm">{removeError}</p>
				)}
				{tabYears.length < 2 ? null : (
					<YearTabs onChange={chooseYear} value={activeYear} years={tabYears} />
				)}
				<SummariesBody
					isError={isError || yearsError}
					isReady={isReady && yearsReady}
					onEdit={(summary) => setEditing({ summary })}
					onRemove={setConfirming}
					summaries={summaries}
					year={activeYear}
				/>
			</CardContent>

			{editing === null ? null : (
				<WeatherSummaryDialog
					onClose={() => setEditing(null)}
					onWriteYear={chooseYear}
					stationId={stationId}
					summary={editing.summary}
				/>
			)}

			<ConfirmSummaryDelete
				onCancel={() => setConfirming(null)}
				onConfirm={() => {
					const target = confirming;
					setConfirming(null);
					if (target !== null) {
						void remove(target.id);
					}
				}}
				summary={confirming}
			/>
		</Card>
	);
}

/**
 * Which year the card is showing, and which years it offers.
 *
 * The station rides along with the chosen year because the router keeps the card
 * mounted across a move from one station to another, and 2019 chosen on one
 * station is not a year the next one has.
 */
function useActiveYear(
	stationId: string,
	years: readonly number[],
): {
	/** The newest year until the user picks one, and the picked year after that. */
	readonly activeYear: number | null;
	readonly tabYears: readonly number[];
	readonly chooseYear: (year: number) => void;
} {
	const [chosen, setChosen] = useState<{
		readonly stationId: string;
		readonly year: number;
	} | null>(null);
	const chosenYear = chosen?.stationId === stationId ? chosen.year : null;

	return {
		activeYear: chosenYear ?? years[0] ?? null,
		tabYears: useMemo(() => tabbedYears(years, chosenYear), [years, chosenYear]),
		chooseYear: useCallback((year: number) => setChosen({ stationId, year }), [stationId]),
	};
}

/**
 * The four states one year of readings can be in.
 *
 * Its own component so the card above it is the header, the tabs and the two
 * dialogs, which is the shape every record surface in the app has.
 */
function SummariesBody({
	isError,
	isReady,
	summaries,
	year,
	onEdit,
	onRemove,
}: {
	readonly isError: boolean;
	readonly isReady: boolean;
	readonly summaries: readonly WeatherSummaryListing[];
	readonly year: number | null;
	readonly onEdit: (summary: WeatherSummaryListing) => void;
	readonly onRemove: (summary: WeatherSummaryListing) => void;
}) {
	if (isError) {
		return (
			<SummariesEmpty
				description="Weather summaries could not be loaded. Try again shortly."
				title="Summaries Unavailable"
			/>
		);
	}
	if (!isReady) {
		return (
			<div className="grid gap-2">
				{[0, 1, 2].map((index) => (
					<Skeleton className="h-10 w-full" key={index} />
				))}
			</div>
		);
	}
	if (summaries.length === 0) {
		return (
			<SummariesEmpty
				description={
					year === null
						? 'No weather summaries have been recorded for this station yet.'
						: `Nothing was recorded at this station in ${year}.`
				}
				title="No Summaries"
			/>
		);
	}
	return <SummariesTable onEdit={onEdit} onRemove={onRemove} summaries={summaries} />;
}

/**
 * The years the tabs offer.
 *
 * The years the station has readings in, plus the one the user is looking at.
 * The second half is for the moment after a write into a year that had none: the
 * optimistic row lands in the collection immediately, but a refused or failed
 * write never does, and a tab that vanished under the user would take the empty
 * state with it.
 */
export function tabbedYears(years: readonly number[], chosen: number | null): readonly number[] {
	if (chosen === null || years.includes(chosen)) {
		return years;
	}
	return [...years, chosen].sort((left, right) => right - left);
}

/**
 * One tab per year, newest first.
 *
 * Drawn only when there are two, because a single tab is a label that looks
 * pressable. One sideways-scrolling row rather than the wrapping `line` variant,
 * which breaks over a decade of years.
 */
function YearTabs({
	years,
	value,
	onChange,
}: {
	readonly years: readonly number[];
	readonly value: number | null;
	readonly onChange: (year: number) => void;
}) {
	return (
		<Tabs onValueChange={(next) => onChange(Number(next))} value={String(value ?? '')}>
			<div className="-mx-1 overflow-x-auto px-1">
				<TabsList aria-label="Year">
					{years.map((year) => (
						<TabsTrigger key={year} value={String(year)}>
							{year}
						</TabsTrigger>
					))}
				</TabsList>
			</div>
		</Tabs>
	);
}

/**
 * The question a hard delete has to ask.
 *
 * A summary has no `deleted_at` and nothing restores it, and the domain says so:
 * "Summary deletes are hard deletes and are not idempotent". The station delete
 * beside it asks first, and so does every other destructive action in the app.
 */
function ConfirmSummaryDelete({
	summary,
	onCancel,
	onConfirm,
}: {
	readonly summary: WeatherSummaryListing | null;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
}) {
	return (
		<AlertDialog onOpenChange={(open) => (open ? undefined : onCancel())} open={summary !== null}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Delete the reading for {summary === null ? '' : summaryPeriodLabel(summary)}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This removes the reading permanently. It cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>Delete Reading</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** Import a file, or record one reading by hand. */
function SummaryActions({
	stationId,
	isStationActive,
	onRecord,
}: {
	readonly stationId: string;
	readonly isStationActive: boolean;
	readonly onRecord: () => void;
}) {
	return (
		<WriteOnly minimum="manager">
			<div className="flex items-center gap-2">
				<Button asChild size="sm" variant="outline">
					<Link params={{ id: stationId }} to="/gis/weather/$id/import">
						<ImportIcon aria-hidden="true" />
						Import
					</Link>
				</Button>
				{/* Recording a reading needs an active station; the server refuses it on
				    an inactive one, so the button says so rather than the save. */}
				<Button
					disabled={!isStationActive}
					onClick={onRecord}
					size="sm"
					title={isStationActive ? undefined : 'Reactivate this station to record new readings.'}
					type="button"
				>
					<AddIcon aria-hidden="true" />
					Record
				</Button>
			</div>
		</WriteOnly>
	);
}

/** The readings themselves. */
function SummariesTable({
	summaries,
	onEdit,
	onRemove,
}: {
	readonly summaries: readonly WeatherSummaryListing[];
	readonly onEdit: (summary: WeatherSummaryListing) => void;
	readonly onRemove: (summary: WeatherSummaryListing) => void;
}) {
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead>Period</TableHead>
						<TableHead className="text-right">Temp (°F)</TableHead>
						<TableHead className="text-right">Precip (in)</TableHead>
						<TableHead className="text-right">Humidity (%)</TableHead>
						<TableHead className="text-right">Wind (mph)</TableHead>
						<TableHead className="w-[5.5rem]" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{summaries.map((summary) => (
						<TableRow key={summary.id}>
							<TableCell className="font-medium text-foreground">
								{summaryPeriodLabel(summary)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatRange(summary.temperatureMinF, summary.temperatureMaxF, '')}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMeasure(summary.precipitationInches, '')}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatRange(summary.relativeHumidityMin, summary.relativeHumidityMax, '')}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatRange(summary.windSpeedMinMph, summary.windSpeedMaxMph, '')}
							</TableCell>
							<TableCell className="text-right">
								<WriteOnly minimum="manager">
									<div className="flex justify-end gap-0.5">
										<Button
											aria-label={`Edit the summary for ${summaryPeriodLabel(summary)}`}
											onClick={() => onEdit(summary)}
											size="icon-sm"
											type="button"
											variant="ghost"
										>
											<EditIcon aria-hidden="true" />
										</Button>
										{/* No delete-impact card: a summary has no soft-delete column and
										    nothing references it, so there are no blockers to report. The
										    confirmation below is a separate question. */}
										<Button
											aria-label={`Delete the summary for ${summaryPeriodLabel(summary)}`}
											onClick={() => onRemove(summary)}
											size="icon-sm"
											type="button"
											variant="ghost"
										>
											<DeleteIcon aria-hidden="true" />
										</Button>
									</div>
								</WriteOnly>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SummariesEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[120px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
