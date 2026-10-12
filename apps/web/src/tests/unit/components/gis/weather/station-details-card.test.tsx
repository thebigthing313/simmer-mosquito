/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StationDetailsCard } from '../../../../../components/gis/weather/station-details-card';
import type { WeatherStation } from '../../../../../hooks/queries/use-weather-station';

afterEach(cleanup);

function station(overrides: Partial<WeatherStation>): WeatherStation {
	return {
		geometryKind: 'Point',
		id: '00000000-0000-4000-8000-000000000001',
		isActive: true,
		latitude: 40.1,
		longitude: -74.2,
		metadata: null,
		name: 'Rain Gauge 1',
		organizationId: '00000000-0000-4000-8000-000000000002',
		providerSourceId: null,
		sourceCode: 'RG1',
		sourceType: 'organization',
		...overrides,
	};
}

/**
 * An Organization station has no provider, so the provider's station id is not
 * drawn even when a legacy row carries one (#1660).
 */
describe('StationDetailsCard', () => {
	it('draws no provider row on an Organization station that carries a legacy id', () => {
		render(<StationDetailsCard station={station({ providerSourceId: '1' })} />);

		expect(screen.queryByText('Provider')).toBeNull();
		expect(screen.queryByText('Provider station ID')).toBeNull();
		expect(screen.queryByText('1')).toBeNull();
	});

	it('labels the provider station id on an NWS station', () => {
		render(
			<StationDetailsCard
				station={station({ organizationId: null, providerSourceId: 'KEWR', sourceType: 'nws' })}
			/>,
		);

		expect(screen.getByText('Provider station ID')).toBeTruthy();
		expect(screen.getByText('KEWR')).toBeTruthy();
	});
});
