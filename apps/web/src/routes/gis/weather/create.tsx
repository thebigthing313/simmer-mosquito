import { isOwnedGeometry } from '@simmer-mosquito/domain';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	type DrawGeometry,
	defaultWeatherStationFormValues,
	WeatherStationFormPage,
	type WeatherStationFormValues,
	weatherStationFieldsFrom,
} from '../../../components/gis/weather/weather-station-form';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useWeatherStationMutations } from '../../../hooks/mutations/use-weather-station-mutations';
import { recordNoun } from '../../../lib/record-nouns';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/gis/weather/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/gis/weather/create')) {
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
	// on-demand subset to warm first, the row arrives on the stream everything is
	// already watching.
	const [stationId] = useState(() => newRecordId());

	const onSave = async ({
		values,
		geometry,
	}: {
		readonly values: WeatherStationFormValues;
		readonly geometry: DrawGeometry | null;
	}) => {
		if (geometry === null || !isOwnedGeometry('weatherStation', geometry)) {
			throw new Error('Place the station on the map before saving.');
		}
		await mutations.create(stationId, weatherStationFieldsFrom(values), geometry);
		await navigate({ to: '/gis/weather/$id', params: { id: stationId } });
	};

	return (
		<WeatherStationFormPage
			canSubmit={mutations.canWrite}
			defaultValues={defaultWeatherStationFormValues()}
			header={{
				title: createLabel('weatherStation'),
				description: 'Place a station and name it, then record its readings against it.',
				backTo: '/gis/weather',
				backLabel: recordNoun('weatherStation').titleMany,
			}}
			initialGeometry={null}
			mode="create"
			onSave={onSave}
		/>
	);
}
