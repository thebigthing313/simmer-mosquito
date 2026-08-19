import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useWeatherStationMutations } from '../../../hooks/mutations/use-weather-station-mutations';
import { isBelowRole } from '../../../lib/write-access';
import {
	type DrawGeometry,
	defaultWeatherStationFormValues,
	WeatherStationFormPage,
	type WeatherStationFormValues,
	weatherStationFieldsFrom,
} from './-weather-station-form';

export const Route = createFileRoute('/gis/weather/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/gis/weather' });
		}
	},
	component: CreateWeatherStationRoute,
});

function CreateWeatherStationRoute() {
	const navigate = useNavigate();
	const mutations = useWeatherStationMutations();

	// Minted up front so the redirect can name the station before the server
	// answers. `weather_sources` is eager, so unlike the region create there is no
	// on-demand subset to warm first — the row arrives on the stream everything is
	// already watching.
	const [stationId] = useState(() => newRecordId());

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: WeatherStationFormValues;
			readonly geometry: DrawGeometry | null;
		}) => {
			if (geometry === null || geometry.type !== 'Point') {
				throw new Error('Place the station on the map before saving.');
			}
			await mutations.create(
				stationId,
				weatherStationFieldsFrom(values),
				geometry as unknown as GeoJsonPoint,
			);
			await navigate({ to: '/gis/weather/$id', params: { id: stationId } });
		},
		[mutations, navigate, stationId],
	);

	return (
		<WeatherStationFormPage
			canSubmit={mutations.canWrite}
			defaultValues={defaultWeatherStationFormValues()}
			header={{
				title: 'Add Weather Station',
				description: 'Place a station and name it, then record its readings against it.',
				backTo: '/gis/weather',
				backLabel: 'Weather Stations',
			}}
			initialGeometry={null}
			mode="create"
			onSave={onSave}
			submitLabel="Add Station"
		/>
	);
}
