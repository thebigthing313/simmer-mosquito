import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import { useWeatherStationMutations } from '../../../hooks/mutations/use-weather-station-mutations';
import { useWeatherStation, type WeatherStation } from '../../../hooks/queries/use-weather-station';
import { STATION_REFUSALS } from '../../../lib/acknowledgement-copy';
import { isBelowRole } from '../../../lib/write-access';

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
		return <EditFormSkeleton rows={[['h-9', 'h-9'], 'h-24']} />;
	}
	if (station === undefined) {
		return <RecordUnavailable layout="centered" noun="weather station" reason="not-found" />;
	}
	return <EditWeatherStationForm station={station} />;
}

function EditWeatherStationForm({ station }: { readonly station: WeatherStation }) {
	// The detail route registers this too, but `$id_.edit` is its sibling rather
	// than its child, the trailing underscore is what un-nests it, so the label
	// does not carry over and the crumb renders the bare id.
	useBreadcrumbLabel(station.id, station.name);
	const navigate = useNavigate();
	const mutations = useWeatherStationMutations();
	const { run, dialog } = useAcknowledgedWrite({ askable: STATION_REFUSALS, ask: true });

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
			// station has readings, which is the only time either matters. See
			// `useAcknowledgedWrite`.
			//
			// The navigation is *inside* the callback on purpose: `run` resolves on a
			// refusal as well as on a success, because a refusal is a question rather
			// than a failure. Leaving here on the way past would abandon the page
			// before the question could be asked, and read as a save that worked.
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
				await navigate({ to: '/gis/weather/$id', params: { id: station.id } });
			});
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
	return {
		name: station.name,
		code: station.sourceCode ?? '',
		metadata: (station.metadata ?? null) as WeatherStationFormValues['metadata'],
	};
}

/**
 * The station's stored point, rebuilt from the synced centroid columns.
 *
 * A station is a Point, so its centroid *is* its geometry, there is no loss
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
