import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
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
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useCallback, useState } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useWeatherStationMutations } from '../../../hooks/mutations/use-weather-station-mutations';
import { useWeatherStation, type WeatherStation } from '../../../hooks/queries/use-weather-station';
import { STATION_ACKNOWLEDGEMENT_LABELS, STATION_REFUSALS } from './-weather-acknowledgements';
import { weatherSourceTypeLabel } from './-weather-display';
import { WeatherSummariesCard } from './-weather-summaries-card';
import { StationStatusBadge } from './-weather-ui';

export const Route = createFileRoute('/gis/weather/$id')({
	component: RouteComponent,
});

const WeatherIcon = iconRegistry.domains.weather.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

function RouteComponent() {
	const { id } = Route.useParams();
	return <WeatherStationDetail stationId={id} />;
}

function WeatherStationDetail({ stationId }: { readonly stationId: string }) {
	// Stations are eager, so this resolves without a fetch.
	const { station, isReady } = useWeatherStation(stationId);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1000px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link className={backLink()} to="/gis/weather">
					<ArrowLeftIcon aria-hidden="true" />
					Back to Weather Stations
				</Link>
				{!isReady ? (
					<DetailSkeleton />
				) : station === undefined ? (
					<RecordUnavailable noun="weather station" reason="not-found" />
				) : (
					<WeatherStationContent station={station} />
				)}
			</div>
		</div>
	);
}

function WeatherStationContent({ station }: { readonly station: WeatherStation }) {
	useBreadcrumbLabel(station.id, station.name);

	// A station an agency does not own is one of the shared provider rows, which no
	// `weather.*` command writes. It reads the same and offers nothing to change.
	const isOwned = station.sourceType === 'organization' && station.organizationId !== null;

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<WeatherIcon aria-hidden="true" className="size-3.5" />
						Weather station
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{station.name}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{weatherSourceTypeLabel(station.sourceType)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<StationStatusBadge isActive={station.isActive} />
					{isOwned ? (
						<WriteOnly minimum="manager">
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: station.id }} to="/gis/weather/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
					) : null}
				</div>
			</div>

			<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<WeatherSummariesCard isStationActive={station.isActive} stationId={station.id} />
				<div className="grid content-start gap-5">
					<Card variant="surface">
						<CardHeader className="px-4 py-4">
							<CardTitle>Details</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-2.5" padding="compact">
							<DetailRow label="Type">{weatherSourceTypeLabel(station.sourceType)}</DetailRow>
							<DetailRow label="Code">
								{station.sourceCode ?? <span className="text-muted-foreground">Not set</span>}
							</DetailRow>
							<DetailRow label="Provider">
								{station.providerSourceId ?? <span className="text-muted-foreground">Not set</span>}
							</DetailRow>
							<DetailRow label="Status">{station.isActive ? 'Active' : 'Inactive'}</DetailRow>
						</CardContent>
					</Card>
					{isOwned ? (
						<WriteOnly minimum="manager">
							<StationLifecycleCard station={station} />
						</WriteOnly>
					) : null}
				</div>
			</div>
		</>
	);
}

/**
 * Retiring a station, bringing it back, and removing it.
 *
 * Not `DangerZoneCard`, which reads the delete-impact endpoint to list what
 * blocks a delete. Nothing blocks this one: summaries are the only rows that
 * name a station and they are removed with it rather than standing in its way,
 * and stations are not commentable, taggable, or personnel targets. So the
 * question is not "what stops this" but "do you know what goes with it", which is
 * what `acknowledgedSummaryDeletion` asks and the server raises by name.
 */
function StationLifecycleCard({ station }: { readonly station: WeatherStation }) {
	const navigate = useNavigate();
	const mutations = useWeatherStationMutations();
	const { run, dialog } = useAcknowledgedWrite(STATION_REFUSALS, STATION_ACKNOWLEDGEMENT_LABELS);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);

	const toggleActive = useCallback(async () => {
		setError(null);
		setIsBusy(true);
		try {
			await mutations.setActive(station.id, !station.isActive);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to change the station.');
		} finally {
			setIsBusy(false);
		}
	}, [mutations, station.id, station.isActive]);

	const remove = useCallback(async () => {
		setError(null);
		setIsBusy(true);
		try {
			// Sent unanswered first. A station with no readings deletes outright; one
			// with readings comes back as a refusal naming what would be lost, and the
			// dialog is what earns the second attempt.
			await run(async (acknowledgements) => {
				await mutations.remove(station.id, acknowledgements.acknowledgedSummaryDeletion === true);
			});
			await navigate({ to: '/gis/weather' });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to delete the station.');
		} finally {
			setIsBusy(false);
			setConfirmingDelete(false);
		}
	}, [mutations, navigate, run, station.id]);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Station</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<p className="m-0 text-muted-foreground text-sm">
					{station.isActive
						? 'Retire this station to stop recording new readings against it. Its history stays.'
						: 'This station is retired. Its readings are still here and still reportable.'}
				</p>
				<Button
					disabled={isBusy}
					onClick={() => void toggleActive()}
					type="button"
					variant="outline"
				>
					{station.isActive ? 'Retire Station' : 'Reactivate Station'}
				</Button>
				<Button
					disabled={isBusy}
					onClick={() => setConfirmingDelete(true)}
					type="button"
					variant="destructive"
				>
					<DeleteIcon aria-hidden="true" />
					Delete Station
				</Button>
				{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
			</CardContent>

			<AlertDialog onOpenChange={setConfirmingDelete} open={confirmingDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {station.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							Every summary recorded against this station is deleted with it, permanently.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void remove()}>Delete Station</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{dialog}
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[90px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function DetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-56" />
			</div>
			<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<Skeleton className="h-64" />
				<Skeleton className="h-48" />
			</div>
		</>
	);
}
