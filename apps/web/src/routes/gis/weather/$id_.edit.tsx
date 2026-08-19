import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { RecordUnavailable } from '../../../components/record';
import { useWeatherStationMutations } from '../../../hooks/mutations/use-weather-station-mutations';
import { useWeatherStation, type WeatherStation } from '../../../hooks/queries/use-weather-station';
import { isBelowRole } from '../../../lib/write-access';
import { STATION_ACKNOWLEDGEMENT_LABELS, STATION_REFUSALS } from './-weather-acknowledgements';
import {
	type DrawGeometry,
	WeatherStationFormPage,
	type WeatherStationFormValues,
	weatherStationFieldsFrom,
} from './-weather-station-form';

/**
 * `$id_.edit` rather than `$id.edit`: the trailing underscore is what stops
 * TanStack Router nesting this route inside the detail route's component, which
 * would render the form inside the page it replaces.
 */
export const Route = createFileRoute('/gis/weather/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ params: { id: params.id }, replace: true, to: '/gis/weather/$id' });
		}
	},
	component: EditWeatherStationRoute,
});

function EditWeatherStationRoute() {
	const { id } = Route.useParams();
	// Stations are eager and carry their own coordinates, so unlike a region there
	// is no separate geometry fetch to wait on.
	const { station, isReady } = useWeatherStation(id);

	if (!isReady) {
		return <EditFormSkeleton />;
	}
	if (station === undefined) {
		return <RecordUnavailable layout="centered" noun="weather station" reason="not-found" />;
	}
	return <EditWeatherStationForm station={station} />;
}

function EditWeatherStationForm({ station }: { readonly station: WeatherStation }) {
	const navigate = useNavigate();
	const mutations = useWeatherStationMutations();
	const { run, dialog } = useAcknowledgedWrite(STATION_REFUSALS, STATION_ACKNOWLEDGEMENT_LABELS);

	const onSave = useCallback(
		async ({
			values,
			geometry,
			geometryChanged,
		}: {
			readonly values: WeatherStationFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			// `null` unless the user actually moved the pin: the form holds the point
			// it loaded, and sending that back names a command with nothing to change.
			const point =
				geometryChanged && geometry !== null && geometry.type === 'Point'
					? (geometry as unknown as GeoJsonPoint)
					: null;

			// The two questions go out unanswered and come back as refusals if the
			// station has readings — which is the only time either matters. See
			// `useAcknowledgedWrite`.
			await run(async (acknowledgements) => {
				await mutations.save({
					weatherStationId: station.id,
					fields: weatherStationFieldsFrom(values),
					current: weatherStationFieldsFrom(formValuesFrom(station)),
					geometry: point,
					acknowledgedIdentityChange:
						acknowledgements.acknowledgedHistoricalStationIdentityChange === true,
					acknowledgedLocationChange:
						acknowledgements.acknowledgedHistoricalLocationChange === true,
				});
			});
			await navigate({ to: '/gis/weather/$id', params: { id: station.id } });
		},
		[mutations, navigate, run, station],
	);

	return (
		<>
			<WeatherStationFormPage
				canSubmit={mutations.canWrite}
				defaultValues={formValuesFrom(station)}
				header={{
					title: 'Edit Weather Station',
					description: "Update this station's name, code, or location.",
					backTo: '/gis/weather/$id',
					backParams: { id: station.id },
					backLabel: 'Back to Station',
				}}
				initialGeometry={pointFrom(station)}
				mode="edit"
				onSave={onSave}
				submitLabel="Save Changes"
			/>
			{dialog}
		</>
	);
}

function formValuesFrom(station: WeatherStation): WeatherStationFormValues {
	return { name: station.name, code: station.sourceCode ?? '' };
}

/**
 * The station's stored point, rebuilt from the synced centroid columns.
 *
 * A station is a Point, so its centroid *is* its geometry — there is no loss
 * here, unlike a region, whose polygon has to be fetched because `lat`/`lng` only
 * say roughly where it sits.
 */
function pointFrom(station: WeatherStation): DrawGeometry | null {
	if (typeof station.latitude !== 'number' || typeof station.longitude !== 'number') {
		return null;
	}
	return {
		type: 'Point',
		coordinates: [station.longitude, station.latitude],
	} as unknown as DrawGeometry;
}

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
				<Skeleton className="h-24 w-full" />
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}
