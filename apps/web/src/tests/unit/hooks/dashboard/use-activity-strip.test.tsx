/** @vitest-environment jsdom */

/**
 * The Dashboard strip's chemical cell counts Treatments.
 *
 * A Treatment is one visit and each Chemical Application under it is one
 * product (ADR 0020), so a catch basin job that put out two products is one
 * count in the cell, never two. The cell reads the Treatment's date and never
 * a line's, since a line has none.
 */

import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActivityStrip } from '../../../../hooks/dashboard/use-activity-strip';
import { applications } from '../../../../lib/collections/applications';
import { treatments } from '../../../../lib/collections/treatments';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from '../queries/read-harness';

const TODAY = '2026-08-14';
const ZONE = 'America/New_York';

beforeEach(() => {
	installMemoryCollections();
});

describe('useActivityStrip', () => {
	it('counts a two-product Treatment once, in the window its date falls in', async () => {
		seedRows(treatments, [
			{ id: 't-basins', application_date: TODAY },
			{ id: 't-ditch', application_date: '2026-08-10' },
			// The prior window: the seven days before this one.
			{ id: 't-prior', application_date: '2026-08-05' },
		]);
		seedRows(applications, [
			{ id: 'l1', treatment_id: 't-basins', insecticide_id: 'bti' },
			{ id: 'l2', treatment_id: 't-basins', insecticide_id: 'mets' },
			{ id: 'l3', treatment_id: 't-ditch', insecticide_id: 'bti' },
			{ id: 'l4', treatment_id: 't-prior', insecticide_id: 'bti' },
		]);

		const { result } = await renderRead(() => useActivityStrip(TODAY, ZONE));
		await waitFor(() => expect(result.current.isReady).toBe(true));

		expect(result.current.types.applications).toEqual({ count: 2, prior: 1 });
	});
});
