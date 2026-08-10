import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../../adult-surveillance/index.js';
import {
	DEFAULT_ORGANIZATION_SETTINGS,
	mergeOrganizationSettingsChange,
	resolveOrganizationSettings,
	updateAdultCollectionTimingModeCommand,
	updateInsecticideBatchTrackingCommand,
	updateLarvalInspectionEntryPolicyCommand,
	updateServiceRequestContextCommand,
	updateTimezoneCommand,
	updateUnitDefaultsCommand,
	validateLarvalInspectionEntryPolicy,
} from '../../organization-settings/index.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';

const unitDefaults = {
	weight: 'pound',
	distance: 'mile',
	area: 'acre',
	volume: 'gallon',
	temperature: 'fahrenheit',
	duration: 'hour',
	count: 'count',
	speed: 'miles_per_hour',
} as const;

describe('organization settings commands', () => {
	it('normalizes timezone updates and carries optional concurrency context', () => {
		const expectedUpdatedAt = new Date('2026-05-12T12:00:00.000Z');

		expect(
			updateTimezoneCommand({
				organizationId,
				actorProfileId,
				expectedUpdatedAt,
				timezone: ' America/New_York ',
			}),
		).toEqual({
			type: 'organizationSettings.updateTimezone',
			payload: {
				organizationId,
				actorProfileId,
				expectedUpdatedAt,
				timezone: 'America/New_York',
			},
		});

		expect(() =>
			updateTimezoneCommand({
				organizationId,
				actorProfileId,
				timezone: 'Eastern',
			}),
		).toThrow(DomainValidationError);
	});

	it('validates complete unit default settings by shape while leaving DB checks to server', () => {
		expect(
			updateUnitDefaultsCommand({
				organizationId,
				actorProfileId,
				unitDefaults,
			}).payload.unitDefaults,
		).toEqual(unitDefaults);

		expect(() =>
			updateUnitDefaultsCommand({
				organizationId,
				actorProfileId,
				unitDefaults: { ...unitDefaults, distance: ' ' },
			}),
		).toThrow(DomainValidationError);
	});

	it('validates larval inspection policy through organization settings ownership', () => {
		expect(
			updateAdultCollectionTimingModeCommand({
				organizationId,
				actorProfileId,
				collectionTimingMode: 'collection_date_duration',
			}).payload.collectionTimingMode,
		).toBe('collection_date_duration');

		expect(() =>
			updateAdultCollectionTimingModeCommand({
				organizationId,
				actorProfileId,
				collectionTimingMode: 'duration' as never,
			}),
		).toThrow(DomainValidationError);

		expect(
			updateLarvalInspectionEntryPolicyCommand({
				organizationId,
				actorProfileId,
				policy: { mode: 'count_and_dips_required', densityRanges: null },
			}).payload.policy,
		).toEqual({ mode: 'count_and_dips_required', densityRanges: null });

		expect(() =>
			validateLarvalInspectionEntryPolicy({
				mode: 'hybrid',
				densityRanges: {
					light: { minInclusive: 0, maxExclusive: 1 },
					medium: { minInclusive: 2, maxExclusive: 5 },
					heavy: { minInclusive: 5, maxExclusive: 10 },
					veryHeavy: { minInclusive: 10 },
				},
			}),
		).toThrow(DomainValidationError);
	});

	it('validates control and public engagement setting commands', () => {
		expect(
			updateInsecticideBatchTrackingCommand({
				organizationId,
				actorProfileId,
				trackInsecticideBatches: false,
			}).payload.trackInsecticideBatches,
		).toBe(false);

		expect(
			updateServiceRequestContextCommand({
				organizationId,
				actorProfileId,
				serviceRequestContext: {
					radius: { amount: 0.25, unitCode: 'mile' },
					timeWindow: { daysBefore: 0, daysAfter: 14 },
				},
			}).payload.serviceRequestContext,
		).toEqual({
			radius: { amount: 0.25, unitCode: 'mile' },
			timeWindow: { daysBefore: 0, daysAfter: 14 },
		});

		expect(() =>
			updateServiceRequestContextCommand({
				organizationId,
				actorProfileId,
				serviceRequestContext: {
					radius: { amount: 0, unitCode: 'mile' },
					timeWindow: { daysBefore: 14, daysAfter: 14 },
				},
			}),
		).toThrow(DomainValidationError);
	});
});

describe('organization settings resolution', () => {
	it('resolves missing settings to v1 defaults', () => {
		expect(resolveOrganizationSettings(null)).toEqual({
			settings: DEFAULT_ORGANIZATION_SETTINGS,
			issues: [],
		});
	});

	it('tolerates malformed stored settings and reports non-fatal issues', () => {
		const resolved = resolveOrganizationSettings({
			timezone: 'Eastern',
			unitDefaults: { distance: 42 },
			adultSurveillance: {
				collectionTimingMode: 'duration',
			},
			larvalSurveillance: {
				inspectionEntryPolicy: {
					mode: 'hybrid',
					densityRanges: {
						light: { minInclusive: 1, maxExclusive: 2 },
						medium: { minInclusive: 2, maxExclusive: 5 },
						heavy: { minInclusive: 5, maxExclusive: 10 },
						veryHeavy: { minInclusive: 10 },
					},
				},
			},
			controlOperations: { trackInsecticideBatches: 'yes' },
			publicEngagement: {
				serviceRequestContext: {
					radius: { amount: -1, unitCode: 'mile' },
					timeWindow: { daysBefore: 14, daysAfter: 14 },
				},
			},
		});

		expect(resolved.settings.timezone).toBe('America/New_York');
		expect(resolved.settings.unitDefaults.distance).toBe('mile');
		expect(resolved.settings.adultSurveillance.collectionTimingMode).toBe('exact_timestamps');
		expect(resolved.settings.larvalSurveillance.inspectionEntryPolicy).toEqual({
			mode: 'hybrid',
			densityRanges: null,
		});
		expect(resolved.settings.controlOperations.trackInsecticideBatches).toBe(true);
		expect(resolved.settings.publicEngagement.serviceRequestContext).toEqual({
			radius: { amount: 0.25, unitCode: 'mile' },
			timeWindow: { daysBefore: 14, daysAfter: 14 },
		});
		expect(resolved.issues.length).toBeGreaterThan(0);
	});

	it('preserves unknown keys while canonicalizing known settings during merges', () => {
		expect(
			mergeOrganizationSettingsChange(
				{
					timezone: 'America/New_York',
					unknownRoot: 'keep',
					adultSurveillance: {
						futureAdultSetting: 'keep',
					},
					larvalSurveillance: {
						futureThing: true,
					},
					publicEngagement: {
						futurePublicSetting: 'keep',
					},
				},
				{
					kind: 'serviceRequestContext',
					serviceRequestContext: {
						radius: { amount: 0.5, unitCode: 'mile' },
						timeWindow: { daysBefore: 7, daysAfter: 21 },
					},
				},
			),
		).toEqual({
			schemaVersion: 1,
			timezone: 'America/New_York',
			unitDefaults,
			speciesKeyBindings: { bindings: [] },
			unknownRoot: 'keep',
			adultSurveillance: {
				futureAdultSetting: 'keep',
				collectionTimingMode: 'exact_timestamps',
			},
			larvalSurveillance: {
				futureThing: true,
				inspectionEntryPolicy: { mode: 'hybrid', densityRanges: null },
			},
			controlOperations: {
				trackInsecticideBatches: true,
			},
			publicEngagement: {
				futurePublicSetting: 'keep',
				serviceRequestContext: {
					radius: { amount: 0.5, unitCode: 'mile' },
					timeWindow: { daysBefore: 7, daysAfter: 21 },
				},
			},
		});
	});
});
