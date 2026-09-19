import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
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
import { Tabs } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { WeatherSummaryListing } from '../../../hooks/queries/weather-summary-view';
import { WriteOnly } from '../../write-only';
import { formatMeasure, formatRange, summaryPeriodLabel } from './weather-display';

const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

/**
 * The four states one year of readings can be in.
 *
 * Its own component so the card above it is the header, the tabs and the two
 * dialogs, which is the shape every record surface in the app has.
 */
export function SummariesBody({
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
 * One tab per year, newest first.
 *
 * Drawn only when there are two, because a single tab is a label that looks
 * pressable. One sideways-scrolling row rather than the wrapping `line` variant,
 * which breaks over a decade of years.
 */
export function YearTabs({
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
			<TabStrip aria-label="Year">
				{years.map((year) => (
					<TabStripTab key={year} value={String(year)}>
						{year}
					</TabStripTab>
				))}
			</TabStrip>
		</Tabs>
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
								{formatRange(summary.temperatureMinF, summary.temperatureMaxF, '') ?? (
									<AbsentValue />
								)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMeasure(summary.precipitationInches, '') ?? <AbsentValue />}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatRange(summary.relativeHumidityMin, summary.relativeHumidityMax, '') ?? (
									<AbsentValue />
								)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatRange(summary.windSpeedMinMph, summary.windSpeedMaxMph, '') ?? (
									<AbsentValue />
								)}
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
