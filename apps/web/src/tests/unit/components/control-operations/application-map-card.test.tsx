/** @vitest-environment jsdom */

/**
 * The Chemical Application map card's applicator row.
 *
 * An application whose applicator Profile was deleted names a Profile the
 * client never receives, since the Profile shape streams `deleted_at is null`
 * rows only. `useApplication` reads that name as `null`, and the card used to
 * draw the contact icon beside an empty span for it (#1501). The icon is
 * replaced with one that carries a test id, because the row has no text of its
 * own to find it by.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationMapCard } from '../../../../components/control-operations/application-map-card';
import type { ChemicalApplication } from '../../../../hooks/queries/control-action-view';

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../routes/route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('@simmer-mosquito/ui-web/icons/registry', async (importOriginal) => ({
	...(await importOriginal<object>()),
	ContactIcon: () => <svg data-testid="applicator-icon" />,
}));

const read = vi.hoisted(() => ({ application: undefined as ChemicalApplication | undefined }));

vi.mock('../../../../hooks/queries/use-application', () => ({
	useApplication: () => ({ application: read.application, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-application-batch-names', () => ({
	useApplicationBatchNames: () => [],
}));

const PROFILE = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-08-04T12:00:00Z');

function application(overrides: Partial<ChemicalApplication>): ChemicalApplication {
	return {
		id: 'a1',
		actionDate: '2026-08-04',
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
		habitatId: null,
		inspectionId: null,
		requestedControlActionId: null,
		missionItemId: null,
		latitude: 40.1,
		longitude: -74.2,
		geometryKind: 'Point',
		metadata: {},
		createdAt: CREATED_AT,
		updatedAt: CREATED_AT,
		createdByProfileId: null,
		updatedByProfileId: null,
		insecticideId: 'product',
		productName: 'VectoBac 12AS',
		methodId: null,
		methodName: null,
		applicatorProfileId: PROFILE,
		applicatorName: 'Rosa Lam',
		amountApplied: 12,
		unitId: 'unit',
		unitAbbreviation: 'gal',
		vehicleId: null,
		vehicleName: null,
		equipmentId: null,
		equipmentName: null,
		collectionId: null,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	read.application = undefined;
});

describe('ApplicationMapCard', () => {
	it('names the applicator when the Profile is in the client', () => {
		read.application = application({});

		render(<ApplicationMapCard id="a1" onClose={() => undefined} />);

		expect(screen.getByTestId('applicator-icon')).toBeTruthy();
		expect(screen.getByText('Rosa Lam')).toBeTruthy();
	});

	it('draws no applicator row when the applicator Profile is not in the client', () => {
		read.application = application({ applicatorProfileId: PROFILE, applicatorName: null });

		render(<ApplicationMapCard id="a1" onClose={() => undefined} />);

		expect(screen.queryByTestId('applicator-icon')).toBeNull();
	});
});
