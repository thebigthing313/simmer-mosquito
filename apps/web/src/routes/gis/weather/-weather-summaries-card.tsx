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
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { WriteOnly } from '../../../components/write-only';
import { useWeatherSummaryMutations } from '../../../hooks/mutations/use-weather-summary-mutations';
import {
	useWeatherSummaries,
	type WeatherSummaryListing,
} from '../../../hooks/queries/use-weather-summaries';
import { formatMeasure, formatRange, summaryPeriodLabel } from './-weather-display';
import { WeatherSummaryDialog } from './-weather-summary-dialog';

const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const ImportIcon = iconRegistry.actions.upload.icon;

/**
 * A station's readings, and the three ways to change them.
 *
 * The card is also what keeps the write path working. `weather_summaries` is an
 * on-demand collection, and a write into a subset nothing is querying waits out a
 * txid confirmation that never arrives — so the dialog is mounted inside the page
 * that is already querying this station's summaries rather than on a route of its
 * own.
 */
export function WeatherSummariesCard({
	stationId,
	isStationActive,
}: {
	readonly stationId: string;
	readonly isStationActive: boolean;
}) {
	const { summaries, isReady, isError } = useWeatherSummaries(stationId);
	const mutations = useWeatherSummaryMutations();
	const [editing, setEditing] = useState<{ readonly summary: WeatherSummaryListing | null } | null>(
		null,
	);
	const [removeError, setRemoveError] = useState<string | null>(null);

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
				<CardTitle>Recent Summaries</CardTitle>
				<WriteOnly minimum="manager">
					<div className="flex items-center gap-2">
						<Button asChild size="sm" variant="outline">
							<Link params={{ id: stationId }} to="/gis/weather/$id/import">
								<ImportIcon aria-hidden="true" />
								Import
							</Link>
						</Button>
						{/* Recording a reading needs an active station; the server refuses it
						    on an inactive one, so the button says so rather than the save. */}
						<Button
							disabled={!isStationActive}
							onClick={() => setEditing({ summary: null })}
							size="sm"
							title={
								isStationActive ? undefined : 'Reactivate this station to record new readings.'
							}
							type="button"
						>
							<AddIcon aria-hidden="true" />
							Record
						</Button>
					</div>
				</WriteOnly>
			</CardHeader>
			<CardContent padding="compact">
				{removeError === null ? null : (
					<p className="m-0 mb-3 text-destructive text-sm">{removeError}</p>
				)}
				{isError ? (
					<SummariesEmpty
						description="Weather summaries could not be loaded. Try again shortly."
						title="Summaries Unavailable"
					/>
				) : !isReady ? (
					<div className="grid gap-2">
						{[0, 1, 2].map((index) => (
							<Skeleton className="h-10 w-full" key={index} />
						))}
					</div>
				) : summaries.length === 0 ? (
					<SummariesEmpty
						description="No weather summaries have been recorded for this station yet."
						title="No Summaries"
					/>
				) : (
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
														onClick={() => setEditing({ summary })}
														size="icon-sm"
														type="button"
														variant="ghost"
													>
														<EditIcon aria-hidden="true" />
													</Button>
													{/* A summary delete is a hard delete with nothing behind
													    it — no soft-delete column, no blockers to check — so
													    there is no impact card to show first. */}
													<Button
														aria-label={`Delete the summary for ${summaryPeriodLabel(summary)}`}
														onClick={() => void remove(summary.id)}
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
				)}
			</CardContent>

			{editing === null ? null : (
				<WeatherSummaryDialog
					onClose={() => setEditing(null)}
					stationId={stationId}
					summary={editing.summary}
				/>
			)}
		</Card>
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
