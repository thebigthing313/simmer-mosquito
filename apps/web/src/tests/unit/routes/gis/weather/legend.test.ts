import { describe, expect, it } from 'vitest';
import { WEATHER_STATION_STATUS_COLORS } from '../../../../../components/map';
import { weatherStationLegend } from '../../../../../routes/gis/weather/-legend';

const labels = (status: 'all' | 'active' | 'inactive') =>
	weatherStationLegend(status).map((entry) => entry.label);

/**
 * The key names the colours the map can currently draw. With the status pill
 * gone from the rows, the dot is the only thing reporting a station's status, so
 * a key that lists a colour the layer is not painting is worse than none.
 */
describe('weatherStationLegend', () => {
	it('names both colours when the status filter is open', () => {
		expect(labels('all')).toEqual(['Active', 'Inactive']);
	});

	it('names one colour when the status filter has narrowed to it', () => {
		expect(labels('active')).toEqual(['Active']);
		expect(labels('inactive')).toEqual(['Inactive']);
	});

	it('takes its swatches from the colours the layer paints with', () => {
		expect(weatherStationLegend('all').map((entry) => entry.color)).toEqual([
			WEATHER_STATION_STATUS_COLORS.active,
			WEATHER_STATION_STATUS_COLORS.inactive,
		]);
	});
});
