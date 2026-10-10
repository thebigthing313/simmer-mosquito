/** @vitest-environment jsdom */

/**
 * What every hook reading a performed control action returns for a name its
 * client does not hold.
 *
 * Each case seeds an action whose performer, method and (for an application)
 * insecticide ids are set while the Profile, the method and the insecticide are
 * absent, which is how an action whose applicator's Profile was deleted reads
 * for good: the Profile shape streams `deleted_at is null` rows only. Every name
 * reads `null`, never the `undefined` an unmatched `left` join yields and never
 * a stand-in label, and the id beside it is what tells "none recorded" from
 * "not in the client" (#874, #1501).
 *
 * One file for nine hooks because they share the fixture and the question; the
 * suites that cover each hook's own ordering and windowing stay where they are.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useApplication } from '../../../../hooks/queries/use-application';
import { useBiocontrolAction } from '../../../../hooks/queries/use-biocontrol-action';
import { useControlActionsForDay } from '../../../../hooks/queries/use-control-actions-for-day';
import { useInsecticideUsage } from '../../../../hooks/queries/use-insecticide-usage';
import { useOutreachAction } from '../../../../hooks/queries/use-outreach-action';
import { useRecentBiocontrolActions } from '../../../../hooks/queries/use-recent-biocontrol-actions';
import { useRecentOutreachActions } from '../../../../hooks/queries/use-recent-outreach';
import { useRecentSourceReductions } from '../../../../hooks/queries/use-recent-source-reductions';
import { useSourceReduction } from '../../../../hooks/queries/use-source-reduction';
import { applications } from '../../../../lib/collections/applications';
import { biocontrol_actions } from '../../../../lib/collections/biocontrol_actions';
import { outreach_actions } from '../../../../lib/collections/outreach_actions';
import { source_reductions } from '../../../../lib/collections/source_reductions';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

/** Ids the rows name and no collection holds. */
const GONE_PROFILE = '22222222-2222-4222-8222-222222222222';
const GONE_METHOD = '55555555-5555-4555-8555-555555555555';
const GONE_PRODUCT = '44444444-4444-4444-8444-444444444444';
const DAY = '2026-08-04';
const CREATED_AT = new Date('2026-08-04T12:00:00Z');

beforeEach(() => {
	installMemoryCollections();
	seedRows(applications, [
		{
			id: 'a1',
			application_date: DAY,
			insecticide_id: GONE_PRODUCT,
			application_method_id: GONE_METHOD,
			applicator_profile_id: GONE_PROFILE,
			amount_applied: 12,
			application_unit_id: null,
			created_at: CREATED_AT,
		},
	]);
	seedRows(source_reductions, [
		{
			id: 's1',
			source_reduction_date: DAY,
			source_reduction_method_id: GONE_METHOD,
			technician_profile_id: GONE_PROFILE,
			sources_eliminated_amount: 4,
			sources_eliminated_unit_id: null,
			created_at: CREATED_AT,
		},
	]);
	seedRows(biocontrol_actions, [
		{
			id: 'b1',
			biocontrol_date: DAY,
			biocontrol_method_id: GONE_METHOD,
			technician_profile_id: GONE_PROFILE,
			amount_released: 200,
			release_unit_id: null,
			created_at: CREATED_AT,
		},
	]);
	seedRows(outreach_actions, [
		{
			id: 'o1',
			outreach_date: DAY,
			outreach_method_id: GONE_METHOD,
			technician_profile_id: GONE_PROFILE,
			reach: 40,
			reach_description: null,
			created_at: CREATED_AT,
		},
	]);
});

/** Wait for a single-record hook to resolve, then hand back the record. */
async function readRecord<TRecord>(
	hook: () => { readonly isReady: boolean; readonly record: TRecord | undefined },
): Promise<TRecord> {
	const { result } = await renderRead(hook);
	await expect.poll(() => result.current.isReady).toBe(true);
	const record = result.current.record;
	if (record === undefined) throw new Error('the record did not come back');
	return record;
}

/** Wait for a list hook to settle, then hand back its rows. */
async function readList<TRow>(
	hook: () => { readonly isReady: boolean; readonly rows: readonly TRow[] },
): Promise<readonly TRow[]> {
	const { result } = await renderRead(hook);
	await expect.poll(() => result.current.isReady && result.current.rows.length > 0).toBe(true);
	return result.current.rows;
}

describe('a performed control action naming records the client does not hold', () => {
	it('useApplication reads the product, method and applicator names as null', async () => {
		const application = await readRecord(() => {
			const read = useApplication('a1');
			return { isReady: read.isReady, record: read.application };
		});

		expect(application).toMatchObject({
			insecticideId: GONE_PRODUCT,
			productName: null,
			methodId: GONE_METHOD,
			methodName: null,
			applicatorProfileId: GONE_PROFILE,
			applicatorName: null,
		});
	});

	it('useSourceReduction reads the method and technician names as null', async () => {
		const reduction = await readRecord(() => {
			const read = useSourceReduction('s1');
			return { isReady: read.isReady, record: read.action };
		});

		expect(reduction).toMatchObject({
			methodId: GONE_METHOD,
			methodName: null,
			technicianProfileId: GONE_PROFILE,
			technicianName: null,
		});
	});

	it('useBiocontrolAction reads the method and technician names as null', async () => {
		const release = await readRecord(() => {
			const read = useBiocontrolAction('b1');
			return { isReady: read.isReady, record: read.action };
		});

		expect(release).toMatchObject({
			methodId: GONE_METHOD,
			methodName: null,
			technicianProfileId: GONE_PROFILE,
			technicianName: null,
		});
	});

	it('useOutreachAction reads the method and technician names as null', async () => {
		const outreach = await readRecord(() => {
			const read = useOutreachAction('o1');
			return { isReady: read.isReady, record: read.action };
		});

		expect(outreach).toMatchObject({
			methodId: GONE_METHOD,
			methodName: null,
			technicianProfileId: GONE_PROFILE,
			technicianName: null,
		});
	});

	it('useRecentSourceReductions reads the method and technician names as null', async () => {
		const rows = await readList(() => {
			const read = useRecentSourceReductions(DAY);
			return { isReady: read.isReady, rows: read.actions };
		});

		expect(rows).toEqual([
			expect.objectContaining({
				methodId: GONE_METHOD,
				methodName: null,
				technicianProfileId: GONE_PROFILE,
				technicianName: null,
			}),
		]);
	});

	it('useRecentBiocontrolActions reads the method and technician names as null', async () => {
		const rows = await readList(() => {
			const read = useRecentBiocontrolActions(DAY);
			return { isReady: read.isReady, rows: read.actions };
		});

		expect(rows).toEqual([
			expect.objectContaining({
				methodId: GONE_METHOD,
				methodName: null,
				technicianProfileId: GONE_PROFILE,
				technicianName: null,
			}),
		]);
	});

	it('useRecentOutreachActions reads the method and technician names as null', async () => {
		const rows = await readList(() => {
			const read = useRecentOutreachActions(DAY);
			return { isReady: read.isReady, rows: read.actions };
		});

		expect(rows).toEqual([
			expect.objectContaining({
				methodId: GONE_METHOD,
				methodName: null,
				technicianProfileId: GONE_PROFILE,
				technicianName: null,
			}),
		]);
	});

	it('useControlActionsForDay reads every subject, method and performer name as null', async () => {
		const rows = await readList(() => {
			const read = useControlActionsForDay(DAY);
			return { isReady: read.isReady, rows: read.actions };
		});

		expect(rows).toHaveLength(3);
		expect(rows.find((row) => row.kind === 'application')).toMatchObject({
			performedByProfileId: GONE_PROFILE,
			performedByName: null,
			subjectName: null,
			methodId: GONE_METHOD,
			methodName: null,
		});
		for (const kind of ['sourceReduction', 'biocontrol'] as const) {
			expect(rows.find((row) => row.kind === kind)).toMatchObject({
				performedByProfileId: GONE_PROFILE,
				performedByName: null,
				subjectName: null,
			});
		}
	});

	it('useInsecticideUsage reads the insecticide name as null', async () => {
		const rows = await readList(() => {
			const read = useInsecticideUsage(DAY);
			return { isReady: read.isReady, rows: read.usage };
		});

		expect(rows).toEqual([
			expect.objectContaining({ insecticideId: GONE_PRODUCT, name: null, applicationCount: 1 }),
		]);
	});
});
