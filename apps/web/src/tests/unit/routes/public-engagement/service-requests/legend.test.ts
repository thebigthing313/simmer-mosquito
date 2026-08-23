import { describe, expect, it } from 'vitest';
import { SERVICE_REQUEST_STATUS_COLORS } from '../../../../../components/map';
import { serviceRequestLegend } from '../../../../../routes/public-engagement/service-requests/-legend';

/**
 * The key names the colours the map can currently draw, and the rail's dot reads
 * the same two constants. These points are a GeoJSON overlay rather than tiles,
 * so the colour is put on the feature by the same page that draws the key.
 */
describe('serviceRequestLegend', () => {
	it('names both colours when the status filter is open', () => {
		expect(serviceRequestLegend('all').map((entry) => entry.label)).toEqual(['Open', 'Closed']);
	});

	it('names one colour when the status filter has narrowed to it', () => {
		expect(serviceRequestLegend('open').map((entry) => entry.label)).toEqual(['Open']);
		expect(serviceRequestLegend('closed').map((entry) => entry.label)).toEqual(['Closed']);
	});

	it('takes its swatches from the colours the overlay paints with', () => {
		expect(serviceRequestLegend('all').map((entry) => entry.color)).toEqual([
			SERVICE_REQUEST_STATUS_COLORS.open,
			SERVICE_REQUEST_STATUS_COLORS.closed,
		]);
	});
});
