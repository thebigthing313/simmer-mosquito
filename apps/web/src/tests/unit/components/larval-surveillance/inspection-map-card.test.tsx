/** @vitest-environment jsdom */

/**
 * The Habitat Inspection map card's inspector line.
 *
 * An inspection whose inspector's Profile was deleted names a Profile the
 * client never receives, since the Profile shape streams `deleted_at is null`
 * rows only. `useInspection` reads that name as `null` beside the id, and the
 * card used to say `Unassigned` for it, which is the line for an inspection
 * with nobody recorded (#1535).
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectionMapCard } from '../../../../components/larval-surveillance/inspection-map-card';
import type { InspectionCard } from '../../../../hooks/queries/larval-activity-view';

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../routes/route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('@simmer-mosquito/ui-web/icons/registry', async (importOriginal) => ({
	...(await importOriginal<object>()),
	ContactIcon: () => <svg data-testid="inspector-icon" />,
}));

const read = vi.hoisted(() => ({ inspection: undefined as InspectionCard | undefined }));

vi.mock('../../../../hooks/queries/use-inspection', () => ({
	useInspection: () => ({ inspection: read.inspection, isReady: true, isError: false }),
}));

const PROFILE = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-08-12T10:00:00Z');

function inspection(overrides: Partial<InspectionCard>): InspectionCard {
	return {
		id: 'i1',
		inspectionDate: '2026-08-12',
		inspectedByProfileId: PROFILE,
		inspectedByName: 'Rosa Lam',
		isWet: false,
		density: null,
		larvaeCount: null,
		habitatId: null,
		habitatName: null,
		habitatTypeId: null,
		typeName: null,
		latitude: 34.05213,
		longitude: -118.24368,
		geometryKind: 'ST_Point',
		addressId: null,
		address: {
			id: undefined,
			displayName: undefined,
			addressLine1: undefined,
			addressLine2: undefined,
			locality: undefined,
			region: undefined,
			postalCode: undefined,
		},
		dipCount: null,
		createdAt: CREATED_AT,
		updatedAt: CREATED_AT,
		hasEggs: false,
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
		...overrides,
	};
}

/** The text of the row the contact icon sits in. */
function inspectorLine(): string | null {
	return screen.getByTestId('inspector-icon').parentElement?.textContent ?? null;
}

afterEach(() => {
	cleanup();
	read.inspection = undefined;
});

describe('InspectionMapCard', () => {
	it('does not say Unassigned when the inspector Profile is not in the client', () => {
		read.inspection = inspection({ inspectedByProfileId: PROFILE, inspectedByName: null });

		render(<InspectionMapCard id="i1" onClose={() => undefined} />);

		expect(inspectorLine()).not.toContain('Unassigned');
		expect(inspectorLine()).toContain('Unknown');
	});

	it('says Unassigned when nobody was recorded as inspector', () => {
		read.inspection = inspection({ inspectedByProfileId: null, inspectedByName: null });

		render(<InspectionMapCard id="i1" onClose={() => undefined} />);

		expect(inspectorLine()).toContain('Unassigned');
	});
});
