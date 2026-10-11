/** @vitest-environment jsdom */

/**
 * The join and select fragments `performed-action-reads.ts` hands the read
 * hooks, run through a real live query per performed action type.
 *
 * Each type gets two rows: one whose method, unit and performer are all in the
 * client, and one whose foreign keys are null. The first holds that each join
 * predicate meets the row it names and that `measured` reads the right
 * columns. The second holds that every join is `left`: the row comes through,
 * its ids read as `null`, and each joined name reads as the `undefined` an
 * unmatched join yields.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	controlActionBaseSelect,
	PERFORMED_ACTIONS,
} from '../../../../hooks/queries/performed-action-reads';
import { application_methods } from '../../../../lib/collections/application_methods';
import { applications } from '../../../../lib/collections/applications';
import { biocontrol_actions } from '../../../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../../../lib/collections/biocontrol_methods';
import { insecticides } from '../../../../lib/collections/insecticides';
import { outreach_actions } from '../../../../lib/collections/outreach_actions';
import { outreach_methods } from '../../../../lib/collections/outreach_methods';
import { profiles } from '../../../../lib/collections/profiles';
import { source_reduction_methods } from '../../../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../../../lib/collections/source_reductions';
import { units } from '../../../../lib/collections/units';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { plain, renderRead } from './read-harness';

const PROFILE = '22222222-2222-4222-8222-222222222222';
const UNIT = '33333333-3333-4333-8333-333333333333';
const PRODUCT = '44444444-4444-4444-8444-444444444444';
const METHOD = '55555555-5555-4555-8555-555555555555';
const DAY = '2026-08-04';

beforeEach(() => {
	installMemoryCollections();
	seedRows(profiles, [{ id: PROFILE, display_name: 'Rosa Lam' }]);
	seedRows(units, [{ id: UNIT, abbreviation: 'gal' }]);
	seedRows(insecticides, [{ id: PRODUCT, trade_name: 'VectoBac 12AS' }]);
	for (const catalog of [
		application_methods,
		source_reduction_methods,
		biocontrol_methods,
		outreach_methods,
	]) {
		seedRows(catalog, [{ id: METHOD, name: 'Method' }]);
	}
});

/** Render a query and wait for it to settle, then hand back its rows sorted by id. */
async function readRows<TRow extends { readonly id: string }>(
	read: () => { readonly data: readonly TRow[]; readonly isReady: boolean },
): Promise<readonly Record<string, unknown>[]> {
	const { result } = await renderRead(read);
	await waitFor(() => expect(result.current.isReady).toBe(true));
	return [...result.current.data].sort((a, b) => a.id.localeCompare(b.id)).map(plain);
}

/**
 * The two rows every type reads back: `<prefix>1` with each lookup present and
 * `<prefix>2` with each foreign key null. `withUnit` is false for outreach,
 * which has no unit, and `extra` carries the fields only one type projects.
 */
function expectedRows(options: {
	readonly prefix: string;
	readonly amounts: readonly [number, number];
	readonly withUnit?: boolean;
	readonly extra?: readonly [Record<string, unknown>, Record<string, unknown>];
}): readonly Record<string, unknown>[] {
	const withUnit = options.withUnit ?? true;
	const present = {
		id: `${options.prefix}1`,
		date: DAY,
		methodId: METHOD,
		performerProfileId: PROFILE,
		amount: options.amounts[0],
		methodName: 'Method',
		performerName: 'Rosa Lam',
		...(withUnit ? { unitId: UNIT, unitAbbreviation: 'gal' } : {}),
		...options.extra?.[0],
	};
	const absent = {
		id: `${options.prefix}2`,
		date: DAY,
		methodId: null,
		performerProfileId: null,
		amount: options.amounts[1],
		methodName: undefined,
		performerName: undefined,
		...(withUnit ? { unitId: null, unitAbbreviation: undefined } : {}),
		...options.extra?.[1],
	};
	return [present, absent];
}

describe('PERFORMED_ACTIONS', () => {
	it('joins and measures a chemical application, product included', async () => {
		const reads = PERFORMED_ACTIONS.applications;
		seedRows(applications, [
			{
				id: 'a1',
				application_date: DAY,
				insecticide_id: PRODUCT,
				application_method_id: METHOD,
				applicator_profile_id: PROFILE,
				amount_applied: 12,
				application_unit_id: UNIT,
			},
			{
				id: 'a2',
				application_date: DAY,
				insecticide_id: null,
				application_method_id: null,
				applicator_profile_id: null,
				amount_applied: 3,
				application_unit_id: null,
			},
		]);

		const rows = await readRows(() =>
			useLiveQuery((query) =>
				query
					.from({ application: applications() })
					.join(
						{ product: insecticides() },
						({ application, product }) => reads.joinProduct(application, product),
						'left',
					)
					.join(
						{ method: application_methods() },
						({ application, method }) => reads.joinMethod(application, method),
						'left',
					)
					.join(
						{ unit: units() },
						({ application, unit }) => reads.joinUnit(application, unit),
						'left',
					)
					.join(
						{ applicator: profiles() },
						({ application, applicator }) => reads.joinPerformer(application, applicator),
						'left',
					)
					.select(({ application, product, method, unit, applicator }) => ({
						id: application.id,
						date: reads.date(application),
						...reads.measured(application),
						productName: product.trade_name,
						methodName: method.name,
						unitAbbreviation: unit.abbreviation,
						performerName: applicator.display_name,
					})),
			),
		);

		expect(rows).toEqual(
			expectedRows({
				prefix: 'a',
				amounts: [12, 3],
				extra: [
					{ productId: PRODUCT, productName: 'VectoBac 12AS' },
					{ productId: null, productName: undefined },
				],
			}),
		);
	});

	it('joins and measures a source reduction', async () => {
		const reads = PERFORMED_ACTIONS.sourceReductions;
		seedRows(source_reductions, [
			{
				id: 's1',
				source_reduction_date: DAY,
				source_reduction_method_id: METHOD,
				technician_profile_id: PROFILE,
				sources_eliminated_amount: 4,
				sources_eliminated_unit_id: UNIT,
			},
			{
				id: 's2',
				source_reduction_date: DAY,
				source_reduction_method_id: null,
				technician_profile_id: null,
				sources_eliminated_amount: 1,
				sources_eliminated_unit_id: null,
			},
		]);

		const rows = await readRows(() =>
			useLiveQuery((query) =>
				query
					.from({ reduction: source_reductions() })
					.join(
						{ method: source_reduction_methods() },
						({ reduction, method }) => reads.joinMethod(reduction, method),
						'left',
					)
					.join({ unit: units() }, ({ reduction, unit }) => reads.joinUnit(reduction, unit), 'left')
					.join(
						{ technician: profiles() },
						({ reduction, technician }) => reads.joinPerformer(reduction, technician),
						'left',
					)
					.select(({ reduction, method, unit, technician }) => ({
						id: reduction.id,
						date: reads.date(reduction),
						...reads.measured(reduction),
						methodName: method.name,
						unitAbbreviation: unit.abbreviation,
						performerName: technician.display_name,
					})),
			),
		);

		expect(rows).toEqual(expectedRows({ prefix: 's', amounts: [4, 1] }));
	});

	it('joins and measures a biocontrol release', async () => {
		const reads = PERFORMED_ACTIONS.releases;
		seedRows(biocontrol_actions, [
			{
				id: 'b1',
				biocontrol_date: DAY,
				biocontrol_method_id: METHOD,
				technician_profile_id: PROFILE,
				amount_released: 200,
				release_unit_id: UNIT,
			},
			{
				id: 'b2',
				biocontrol_date: DAY,
				biocontrol_method_id: null,
				technician_profile_id: null,
				amount_released: 50,
				release_unit_id: null,
			},
		]);

		// The joins in the other order from the source reduction's, which the
		// predicates do not care about.
		const rows = await readRows(() =>
			useLiveQuery((query) =>
				query
					.from({ release: biocontrol_actions() })
					.join(
						{ releasedBy: profiles() },
						({ release, releasedBy }) => reads.joinPerformer(release, releasedBy),
						'left',
					)
					.join(
						{ releaseUnit: units() },
						({ release, releaseUnit }) => reads.joinUnit(release, releaseUnit),
						'left',
					)
					.join(
						{ organism: biocontrol_methods() },
						({ release, organism }) => reads.joinMethod(release, organism),
						'left',
					)
					.select(({ release, releasedBy, releaseUnit, organism }) => ({
						id: release.id,
						date: reads.date(release),
						...reads.measured(release),
						methodName: organism.name,
						unitAbbreviation: releaseUnit.abbreviation,
						performerName: releasedBy.display_name,
					})),
			),
		);

		expect(rows).toEqual(expectedRows({ prefix: 'b', amounts: [200, 50] }));
	});

	it('joins and measures an outreach action, which has no unit', async () => {
		const reads = PERFORMED_ACTIONS.outreachActions;
		seedRows(outreach_actions, [
			{
				id: 'o1',
				outreach_date: DAY,
				outreach_method_id: METHOD,
				technician_profile_id: PROFILE,
				reach: 40,
			},
			{
				id: 'o2',
				outreach_date: DAY,
				outreach_method_id: null,
				technician_profile_id: null,
				reach: 0,
			},
		]);

		const rows = await readRows(() =>
			useLiveQuery((query) =>
				query
					.from({ outreach: outreach_actions() })
					.join(
						{ method: outreach_methods() },
						({ outreach, method }) => reads.joinMethod(outreach, method),
						'left',
					)
					.join(
						{ technician: profiles() },
						({ outreach, technician }) => reads.joinPerformer(outreach, technician),
						'left',
					)
					.select(({ outreach, method, technician }) => ({
						id: outreach.id,
						date: reads.date(outreach),
						...reads.measured(outreach),
						methodName: method.name,
						performerName: technician.display_name,
					})),
			),
		);

		expect(rows).toEqual(expectedRows({ prefix: 'o', amounts: [40, 0], withUnit: false }));
	});
});

describe('controlActionBaseSelect', () => {
	it('projects the placement and audit fields under their view names', async () => {
		const createdAt = new Date('2026-08-04T12:00:00Z');
		seedRows(outreach_actions, [
			{
				id: 'o1',
				address_id: 'addr',
				inspection_id: 'insp',
				requested_control_action_id: 'req',
				mission_item_id: 'item',
				lat: 40.1,
				lng: -74.2,
				geom_type: 'Point',
				metadata: { note: 'kept' },
				created_at: createdAt,
				updated_at: createdAt,
				created_by_profile_id: PROFILE,
				updated_by_profile_id: null,
			},
		]);

		const rows = await readRows(() =>
			useLiveQuery((query) =>
				query.from({ action: outreach_actions() }).select(({ action }) => ({
					id: action.id,
					...controlActionBaseSelect(action),
				})),
			),
		);

		expect(rows).toEqual([
			{
				id: 'o1',
				addressId: 'addr',
				inspectionId: 'insp',
				requestedControlActionId: 'req',
				missionItemId: 'item',
				latitude: 40.1,
				longitude: -74.2,
				geometryKind: 'Point',
				metadata: { note: 'kept' },
				createdAt,
				updatedAt: createdAt,
				createdByProfileId: PROFILE,
				updatedByProfileId: null,
			},
		]);
	});
});
