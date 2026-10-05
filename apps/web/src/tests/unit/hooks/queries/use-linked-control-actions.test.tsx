/** @vitest-environment jsdom */

/**
 * The control actions an Inspection's detail page lists, with the names that
 * label them.
 *
 * Each action row names catalog entries by id: an insecticide, a method, a unit
 * and a Profile. The page used to resolve every one of those with a component
 * reading a roster and a `<Suspense>` around it (#874). The hook joins them now,
 * so the case worth holding is each name arriving on the row, and a row whose
 * catalog entry is not in the client reading as `null` rather than vanishing,
 * which is what a `left` join gives and an `inner` one would not.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useLinkedControlActions } from '../../../../hooks/queries/use-linked-control-actions';
import { applications } from '../../../../lib/collections/applications';
import { biocontrol_actions } from '../../../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../../../lib/collections/biocontrol_methods';
import { insecticides } from '../../../../lib/collections/insecticides';
import { outreach_actions } from '../../../../lib/collections/outreach_actions';
import { outreach_methods } from '../../../../lib/collections/outreach_methods';
import { profiles } from '../../../../lib/collections/profiles';
import { requested_control_actions } from '../../../../lib/collections/requested_control_actions';
import { source_reduction_methods } from '../../../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../../../lib/collections/source_reductions';
import { units } from '../../../../lib/collections/units';
import {
	installMemoryCollections,
	seedRows,
	subsetPredicate,
	subsetRequests,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const INSPECTION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const UNIT = '33333333-3333-4333-8333-333333333333';
const INSECTICIDE = '44444444-4444-4444-8444-444444444444';
const METHOD = '55555555-5555-4555-8555-555555555555';
const MISSING = '99999999-9999-4999-8999-999999999999';

beforeEach(() => {
	installMemoryCollections();
	seedRows(profiles, [{ id: PROFILE, display_name: 'Rosa Lam' }]);
	seedRows(units, [{ id: UNIT, abbreviation: 'fl oz' }]);
	seedRows(insecticides, [{ id: INSECTICIDE, trade_name: 'VectoBac 12AS' }]);
	seedRows(source_reduction_methods, [{ id: METHOD, name: 'Tire removal' }]);
	seedRows(outreach_methods, [{ id: METHOD, name: 'Door hanger' }]);
	seedRows(biocontrol_methods, [{ id: METHOD, name: 'Mosquitofish' }]);
});

async function readActions() {
	const { result } = await renderRead(() => useLinkedControlActions(INSPECTION));
	return result.current.actions;
}

describe('useLinkedControlActions', () => {
	it('names the insecticide, the unit and the applicator on an application', async () => {
		seedRows(applications, [
			{
				id: 'a1',
				inspection_id: INSPECTION,
				application_date: '2026-08-12',
				applicator_profile_id: PROFILE,
				insecticide_id: INSECTICIDE,
				amount_applied: 6,
				application_unit_id: UNIT,
			},
		]);

		const [action] = await readActions();

		expect(action).toMatchObject({
			kind: 'application',
			insecticideName: 'VectoBac 12AS',
			amount: 6,
			unitAbbreviation: 'fl oz',
			actorProfileId: PROFILE,
			actorName: 'Rosa Lam',
		});
	});

	it('names the method of a source reduction, an outreach action and a biocontrol release', async () => {
		seedRows(source_reductions, [
			{
				id: 's1',
				inspection_id: INSPECTION,
				source_reduction_date: '2026-08-14',
				technician_profile_id: PROFILE,
				source_reduction_method_id: METHOD,
				sources_eliminated_amount: 3,
				sources_eliminated_unit_id: UNIT,
			},
		]);
		seedRows(outreach_actions, [
			{
				id: 'o1',
				inspection_id: INSPECTION,
				outreach_date: '2026-08-13',
				technician_profile_id: PROFILE,
				outreach_method_id: METHOD,
				reach: 12,
			},
		]);
		seedRows(biocontrol_actions, [
			{
				id: 'b1',
				inspection_id: INSPECTION,
				biocontrol_date: '2026-08-12',
				technician_profile_id: PROFILE,
				biocontrol_method_id: METHOD,
				amount_released: 40,
				release_unit_id: UNIT,
			},
		]);

		const actions = await readActions();

		expect(
			actions.map((action) => [action.kind, 'methodName' in action && action.methodName]),
		).toEqual([
			['sourceReduction', 'Tire removal'],
			['outreachAction', 'Door hanger'],
			['biocontrolAction', 'Mosquitofish'],
		]);
		expect(actions.map((action) => action.actorName)).toEqual(['Rosa Lam', 'Rosa Lam', 'Rosa Lam']);
	});

	it('names who asked for a requested action', async () => {
		seedRows(requested_control_actions, [
			{
				id: 'r1',
				inspection_id: INSPECTION,
				requested_at: new Date('2026-08-15T10:00:00.000Z'),
				requested_by_profile_id: PROFILE,
				control_type: 'application',
				summary: null,
				resolved_at: null,
			},
		]);

		const [action] = await readActions();

		expect(action).toMatchObject({ kind: 'requestedControlAction', actorName: 'Rosa Lam' });
	});

	it('keeps a row whose catalog entry is not in the client, with null names', async () => {
		seedRows(applications, [
			{
				id: 'a1',
				inspection_id: INSPECTION,
				application_date: '2026-08-12',
				applicator_profile_id: MISSING,
				insecticide_id: MISSING,
				amount_applied: 6,
				application_unit_id: MISSING,
			},
		]);

		const [action] = await readActions();

		expect(action).toMatchObject({
			kind: 'application',
			insecticideName: null,
			unitAbbreviation: null,
			actorProfileId: MISSING,
			actorName: null,
		});
	});

	/**
	 * The trap a label join can spring: a join that took over the cursor or the
	 * predicate would leave the action table loading whole. Each table must still
	 * ask Electric for exactly the rows citing this inspection.
	 */
	it('still asks each action table for this inspection alone', async () => {
		installMemoryCollections({ recordSubsets: true });

		await renderRead(() => useLinkedControlActions(INSPECTION));

		const asked = `inspection_id = ${INSPECTION}`;
		expect(subsetRequests(applications).map(subsetPredicate)).toEqual([asked]);
		expect(subsetRequests(source_reductions).map(subsetPredicate)).toEqual([asked]);
		expect(subsetRequests(outreach_actions).map(subsetPredicate)).toEqual([asked]);
		expect(subsetRequests(biocontrol_actions).map(subsetPredicate)).toEqual([asked]);
		expect(subsetRequests(requested_control_actions).map(subsetPredicate)).toEqual([asked]);
	});

	it('reads an action nobody was recorded against as unassigned, not as unknown', async () => {
		seedRows(outreach_actions, [
			{
				id: 'o1',
				inspection_id: INSPECTION,
				outreach_date: '2026-08-13',
				technician_profile_id: null,
				outreach_method_id: METHOD,
				reach: 12,
			},
		]);

		const [action] = await readActions();

		expect(action).toMatchObject({ actorProfileId: null, actorName: null });
	});
});
