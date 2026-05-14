import { describe, expect, it } from 'vitest';
import {
	assessWeatherSummaryImportRows,
	commitWeatherSummaryImportCommand,
	createWeatherStationCommand,
	createWeatherSummaryCommand,
	DomainValidationError,
	deactivateWeatherStationCommand,
	deriveWeatherStationStatus,
	isSingleDayWeatherBucket,
	updateWeatherStationDetailsCommand,
	updateWeatherStationLocationCommand,
	updateWeatherSummaryCommand,
} from '../index.js';
import type { WeatherSummaryImportRowInput } from '../weather.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const weatherStationId = '33333333-3333-4333-8333-333333333333';
const weatherSummaryId = '44444444-4444-4444-8444-444444444444';
const secondWeatherSummaryId = '55555555-5555-4555-8555-555555555555';
const thirdWeatherSummaryId = '66666666-6666-4666-8666-666666666666';
const fourthWeatherSummaryId = '77777777-7777-4777-8777-777777777777';

const pointGeometry = { type: 'Point' as const, coordinates: [-90.12345, 35.12345] as const };
const polygonGeometry = {
	type: 'Polygon' as const,
	coordinates: [
		[
			[-90, 35],
			[-89.9, 35],
			[-89.9, 35.1],
			[-90, 35],
		],
	] as const,
};

const emptyMetrics = {
	temperatureMinF: null,
	temperatureMaxF: null,
	precipitationInches: null,
	relativeHumidityMin: null,
	relativeHumidityMax: null,
	windSpeedMinMph: null,
	windSpeedMaxMph: null,
} as const;

function importRow(overrides: Partial<WeatherSummaryImportRowInput>): WeatherSummaryImportRowInput {
	return {
		clientRowId: 'row-1',
		weatherSummaryId,
		startDate: '2026-05-01',
		endDate: '2026-05-01',
		...emptyMetrics,
		precipitationInches: 1.25,
		...overrides,
	};
}

describe('weather station commands', () => {
	it('creates station commands with client ids, point geometry, and normalized details', () => {
		expect(
			createWeatherStationCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				stationName: '  North Gauge ',
				stationCode: ' N-1 ',
				geometry: pointGeometry,
				metadata: { owner: 'ops' },
			}),
		).toEqual({
			type: 'weather.createWeatherStation',
			payload: {
				organizationId,
				actorProfileId,
				weatherStationId,
				stationName: 'North Gauge',
				stationCode: 'N-1',
				geometry: pointGeometry,
				metadata: { owner: 'ops' },
			},
		});

		expect(() =>
			createWeatherStationCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				stationName: 'North Gauge',
				geometry: polygonGeometry,
			}),
		).toThrow(DomainValidationError);
	});

	it('splits station detail/location updates and carries lifecycle context', () => {
		const expectedUpdatedAt = new Date('2026-05-13T12:00:00.000Z');

		expect(
			updateWeatherStationDetailsCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				expectedUpdatedAt,
				stationCode: ' ',
				metadata: null,
				acknowledgedHistoricalStationIdentityChange: true,
			}).payload,
		).toEqual({
			organizationId,
			actorProfileId,
			expectedUpdatedAt,
			weatherStationId,
			changes: {
				stationCode: null,
				metadata: null,
			},
			acknowledgedHistoricalStationIdentityChange: true,
		});

		expect(
			updateWeatherStationLocationCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				expectedUpdatedAt,
				geometry: pointGeometry,
				acknowledgedHistoricalLocationChange: true,
			}).payload.acknowledgedHistoricalLocationChange,
		).toBe(true);

		expect(
			deactivateWeatherStationCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				expectedUpdatedAt,
			}).payload.expectedUpdatedAt,
		).toBe(expectedUpdatedAt);
	});

	it('derives station status without storing a status enum', () => {
		expect(deriveWeatherStationStatus({ isActive: true, deletedAt: null })).toBe('active');
		expect(deriveWeatherStationStatus({ isActive: false, deletedAt: null })).toBe('inactive');
		expect(deriveWeatherStationStatus({ isActive: true, deletedAt: new Date() })).toBe('deleted');
	});
});

describe('weather summary commands', () => {
	it('creates weather summaries with explicit inclusive date buckets and metrics', () => {
		expect(
			createWeatherSummaryCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				weatherSummaryId,
				startDate: '2026-05-01',
				endDate: '2026-05-03',
				precipitationInches: 1.25,
			}).payload,
		).toMatchObject({
			weatherStationId,
			weatherSummaryId,
			startDate: '2026-05-01',
			endDate: '2026-05-03',
			precipitationInches: 1.25,
			temperatureMinF: null,
		});

		expect(isSingleDayWeatherBucket({ startDate: '2026-05-01', endDate: '2026-05-01' })).toBe(true);
	});

	it('validates metric bounds, two-decimal precision, and min/max order', () => {
		expect(() =>
			createWeatherSummaryCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				weatherSummaryId,
				startDate: '2026-05-01',
				endDate: '2026-05-01',
				precipitationInches: 1.234,
			}),
		).toThrow(DomainValidationError);

		expect(() =>
			createWeatherSummaryCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				weatherSummaryId,
				startDate: '2026-05-01',
				endDate: '2026-05-01',
				temperatureMinF: 80,
				temperatureMaxF: 70,
			}),
		).toThrow(DomainValidationError);
	});

	it('uses patch semantics for manual summary edits', () => {
		const expectedUpdatedAt = new Date('2026-05-13T12:00:00.000Z');

		expect(
			updateWeatherSummaryCommand({
				organizationId,
				actorProfileId,
				weatherSummaryId,
				expectedUpdatedAt,
				endDate: '2026-05-04',
				precipitationInches: null,
				windSpeedMaxMph: 12.5,
			}).payload,
		).toEqual({
			organizationId,
			actorProfileId,
			weatherSummaryId,
			expectedUpdatedAt,
			changes: {
				endDate: '2026-05-04',
				precipitationInches: null,
				windSpeedMaxMph: 12.5,
			},
		});

		expect(() =>
			updateWeatherSummaryCommand({
				organizationId,
				actorProfileId,
				weatherSummaryId,
			}),
		).toThrow(DomainValidationError);
	});
});

describe('weather summary import assessment', () => {
	it('classifies insert, update, no-change, and overlap failures', () => {
		const assessment = assessWeatherSummaryImportRows({
			currentLocalDate: '2026-05-13',
			existingSummaries: [
				{
					weatherSummaryId,
					startDate: '2026-05-01',
					endDate: '2026-05-01',
					...emptyMetrics,
					precipitationInches: 1.25,
				},
				{
					weatherSummaryId: secondWeatherSummaryId,
					startDate: '2026-05-03',
					endDate: '2026-05-03',
					...emptyMetrics,
					precipitationInches: 2,
				},
				{
					weatherSummaryId: '77777777-7777-4777-8777-777777777777',
					startDate: '2026-05-05',
					endDate: '2026-05-07',
					...emptyMetrics,
					precipitationInches: 3,
				},
			],
			rows: [
				importRow({ clientRowId: 'row-1', weatherSummaryId: thirdWeatherSummaryId }),
				importRow({
					clientRowId: 'row-2',
					weatherSummaryId: fourthWeatherSummaryId,
					startDate: '2026-05-02',
					endDate: '2026-05-02',
				}),
				importRow({
					clientRowId: 'row-3',
					weatherSummaryId: '88888888-8888-4888-8888-888888888888',
					startDate: '2026-05-03',
					endDate: '2026-05-03',
					precipitationInches: 1.5,
				}),
				importRow({
					clientRowId: 'row-4',
					weatherSummaryId: '99999999-9999-4999-8999-999999999999',
					startDate: '2026-05-06',
					endDate: '2026-05-06',
				}),
			],
		});

		expect(assessment.rows.map((row) => row.action)).toEqual([
			'noChange',
			'insert',
			'update',
			'fail',
		]);
		expect(assessment.rows[0]?.weatherSummaryId).toBe(weatherSummaryId);
		expect(assessment.counts).toEqual({ insert: 1, update: 1, noChange: 1, fail: 1 });
	});

	it('fails later duplicate and overlapping import rows by submitted order', () => {
		const assessment = assessWeatherSummaryImportRows({
			rows: [
				importRow({ clientRowId: 'row-1', weatherSummaryId }),
				importRow({
					clientRowId: 'row-2',
					weatherSummaryId: secondWeatherSummaryId,
					startDate: '2026-05-01',
					endDate: '2026-05-01',
				}),
				importRow({
					clientRowId: 'row-3',
					weatherSummaryId: thirdWeatherSummaryId,
					startDate: '2026-05-01',
					endDate: '2026-05-03',
				}),
			],
		});

		expect(assessment.rows.map((row) => row.action)).toEqual(['insert', 'fail', 'fail']);
		expect(assessment.counts.fail).toBe(2);
	});

	it('builds station-scoped import commit commands with acknowledgement flags', () => {
		expect(
			commitWeatherSummaryImportCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				rows: [importRow({ clientRowId: 'row-1' })],
				acknowledgedUpdates: true,
				acknowledgedPartialImport: true,
			}).payload,
		).toMatchObject({
			organizationId,
			actorProfileId,
			weatherStationId,
			acknowledgedUpdates: true,
			acknowledgedPartialImport: true,
			rows: [
				{
					clientRowId: 'row-1',
					weatherSummaryId,
					startDate: '2026-05-01',
					endDate: '2026-05-01',
					precipitationInches: 1.25,
				},
			],
		});

		expect(() =>
			commitWeatherSummaryImportCommand({
				organizationId,
				actorProfileId,
				weatherStationId,
				rows: [],
			}),
		).toThrow(DomainValidationError);
	});
});
