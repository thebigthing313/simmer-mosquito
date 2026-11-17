/** @vitest-environment jsdom */

/**
 * The Treatment map card.
 *
 * Its applicator row. A Treatment whose applicator Profile was deleted names a
 * Profile the client never receives, since the Profile shape streams
 * `deleted_at is null` rows only. `useTreatmentCard` reads that name as `null`,
 * and the card used to draw the contact icon beside an empty span for it
 * (#1501). The icon is replaced with one that carries a test id, because the
 * row has no text of its own to find it by.
 *
 * Its title, when an Insecticide is not in the client. The card used to read
 * `Unknown product` there while every other surface read `Unknown insecticide`
 * for the same record (#1537).
 *
 * Its products. One card per Treatment, titled by every product it put out,
 * with each product's amount on a line of its own (ADR 0020).
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationMapCard } from '../../../../components/control-operations/application-map-card';
import type { TreatmentLine } from '../../../../hooks/queries/treatment-lines';
import type { TreatmentCardView } from '../../../../hooks/queries/use-treatment-card';

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../routes/route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('@simmer-mosquito/ui-web/icons/registry', async (importOriginal) => ({
	...(await importOriginal<object>()),
	ContactIcon: () => <svg data-testid="applicator-icon" />,
}));

const read = vi.hoisted(() => ({ treatment: undefined as TreatmentCardView | undefined }));

vi.mock('../../../../hooks/queries/use-treatment-card', () => ({
	useTreatmentCard: () => ({ treatment: read.treatment, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-application-batch-names', () => ({
	useApplicationBatchNames: (lineId: string) => (lineId === 'line-2' ? ['B-7'] : []),
}));

const PROFILE = '22222222-2222-4222-8222-222222222222';

function line(overrides: Partial<TreatmentLine>): TreatmentLine {
	return {
		id: 'line-1',
		insecticideId: 'product',
		insecticideName: 'VectoBac 12AS',
		amount: 12,
		unitId: 'unit',
		unitAbbreviation: 'gal',
		...overrides,
	};
}

function treatment(overrides: Partial<TreatmentCardView>): TreatmentCardView {
	return {
		id: 't1',
		actionDate: '2026-08-04',
		methodId: null,
		methodName: null,
		applicatorProfileId: PROFILE,
		applicatorName: 'Rosa Lam',
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
		latitude: 40.1,
		longitude: -74.2,
		geometryKind: 'Point',
		lines: [line({})],
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	read.treatment = undefined;
});

describe('ApplicationMapCard', () => {
	it('names the applicator when the Profile is in the client', () => {
		read.treatment = treatment({});

		render(<ApplicationMapCard id="t1" onClose={() => undefined} />);

		expect(screen.getByTestId('applicator-icon')).toBeTruthy();
		expect(screen.getByText('Rosa Lam')).toBeTruthy();
	});

	it('draws no applicator row when the applicator Profile is not in the client', () => {
		read.treatment = treatment({ applicatorProfileId: PROFILE, applicatorName: null });

		render(<ApplicationMapCard id="t1" onClose={() => undefined} />);

		expect(screen.queryByTestId('applicator-icon')).toBeNull();
	});

	it('titles itself Unknown insecticide when the Insecticide is not in the client', () => {
		read.treatment = treatment({ lines: [line({ insecticideName: null })] });

		render(<ApplicationMapCard id="t1" onClose={() => undefined} />);

		expect(screen.getByText('Unknown insecticide')).toBeTruthy();
	});

	it('draws a two-product Treatment as one card naming both, each amount on its own line', () => {
		read.treatment = treatment({
			lines: [
				line({}),
				line({
					id: 'line-2',
					insecticideId: 'product-2',
					insecticideName: 'Altosid XR-G',
					amount: 4,
					unitAbbreviation: 'lb',
				}),
			],
		});

		render(<ApplicationMapCard id="t1" onClose={() => undefined} />);

		expect(screen.getByText('VectoBac 12AS, Altosid XR-G')).toBeTruthy();
		expect(screen.getByText('VectoBac 12AS · 12 gal')).toBeTruthy();
		expect(screen.getByText('Altosid XR-G · 4 lb')).toBeTruthy();
		expect(screen.getByText('Batch B-7')).toBeTruthy();
	});

	it('draws a one-product Treatment with the bare amount, since the title names the product', () => {
		read.treatment = treatment({});

		render(<ApplicationMapCard id="t1" onClose={() => undefined} />);

		expect(screen.getByText('VectoBac 12AS')).toBeTruthy();
		expect(screen.getByText('12 gal')).toBeTruthy();
	});
});
