/** @vitest-environment jsdom */

/**
 * What the inspection map card puts in its title, arm by arm.
 *
 * The card kept a private label that answered the habitat's name, then the
 * address, then the centroid, then the words `One-off inspection`. It is
 * `habitatLabel` now (#954), and these cases are what holds the fold to the
 * strings the card drew before it.
 *
 * Every case reads the `<h2>` the card draws rather than searching the card for
 * the text, because the address arm puts the same address in the Address row
 * below the title and a search over the card would pass on either one.
 *
 * Two of the six rows are the ones the fold moves, and **neither can arrive**,
 * which is why this carries no changeset. The card drew `34.05213, -118.24368`
 * for the second and three spaces for the third before it; it draws
 * `Habitat 1a2b3c4d` for both now, and nothing renders either.
 *
 * The second is barred at the read. `use-inspection.ts` projects `habitatName`
 * as `caseWhen(isNull(habitat_id), null, coalesce(habitat_name, concat(lat,
 * ', ', lng)))`, so a habitat with no name has read out its own coordinates a
 * layer down and `habitatName` is null only where `habitatId` is.
 *
 * The third is barred at the write. Every path into `habitat_name` is an arm of
 * `habitatTableCommands` reading it through `readNullableText`, which trims and
 * answers `null`; the merge dispatches one of those arms, the seed routes make
 * habitat types rather than habitats, there is no habitat importer, and the
 * column has no default and no CHECK.
 *
 * They are cases anyway, because they are what the card's arms now say and a
 * row neither gate can send today is a row a later seam can (#998).
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** An inspection as `useInspection` hands one over. */
interface CardRow {
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly addressId: string | null;
	readonly address: Record<string, string | undefined>;
	readonly latitude: number | null;
	readonly longitude: number | null;
}

const NO_ADDRESS = {
	id: undefined,
	displayName: undefined,
	addressLine1: undefined,
	addressLine2: undefined,
	locality: undefined,
	region: undefined,
	postalCode: undefined,
};

const AN_ADDRESS = {
	id: 'address-1',
	displayName: 'The Wilson place',
	addressLine1: '123 Main St',
	addressLine2: undefined,
	locality: 'Edison',
	region: 'NJ',
	postalCode: '08817',
};

const HABITAT_ID = '1a2b3c4d-0000-4000-8000-000000000001';

/** What the next render answers with. Set by each case before it renders. */
let row: CardRow = {
	habitatId: null,
	habitatName: null,
	addressId: null,
	address: NO_ADDRESS,
	latitude: null,
	longitude: null,
};

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-router')>();
	return {
		...actual,
		Link: ({ children }: { readonly children: ReactNode }) => <a href="/">{children}</a>,
	};
});

vi.mock('../../../../hooks/queries/use-inspection', () => ({
	useInspection: () => ({
		inspection: {
			id: 'inspection-1',
			inspectionDate: '2026-09-01',
			habitatTypeId: null,
			typeName: null,
			geometryKind: null,
			isWet: false,
			density: null,
			larvaeCount: null,
			inspectedByName: null,
			hasEggs: false,
			hasFirstInstar: false,
			hasSecondInstar: false,
			hasThirdInstar: false,
			hasFourthInstar: false,
			hasPupae: false,
			...row,
		},
		isReady: true,
		isError: false,
	}),
}));

afterEach(cleanup);

/** The title the card draws for `next`, as a person reads it. */
async function titleFor(next: CardRow): Promise<string> {
	row = next;
	const { InspectionMapCard } = await import(
		'../../../../components/larval-surveillance/inspection-map-card'
	);
	render(<InspectionMapCard id="inspection-1" onClose={() => undefined} />);
	return screen.getByRole('heading', { level: 2 }).textContent ?? '';
}

describe('the inspection map card title', () => {
	it('names the habitat it sits on', async () => {
		expect(
			await titleFor({
				habitatId: HABITAT_ID,
				habitatName: 'Alder catch basin',
				addressId: null,
				address: NO_ADDRESS,
				latitude: 34.052_13,
				longitude: -118.243_68,
			}),
		).toBe('Alder catch basin');
	}, 300_000);

	it('names a habitat with no name by its id', async () => {
		expect(
			await titleFor({
				habitatId: HABITAT_ID,
				habitatName: null,
				addressId: null,
				address: NO_ADDRESS,
				latitude: 34.052_13,
				longitude: -118.243_68,
			}),
		).toBe('Habitat 1a2b3c4d');
	}, 300_000);

	it('reads a blank habitat name as no name at all', async () => {
		expect(
			await titleFor({
				habitatId: HABITAT_ID,
				habitatName: '   ',
				addressId: null,
				address: NO_ADDRESS,
				latitude: 34.052_13,
				longitude: -118.243_68,
			}),
		).toBe('Habitat 1a2b3c4d');
	}, 300_000);

	it('names an inspection at no habitat by the address it was linked to', async () => {
		expect(
			await titleFor({
				habitatId: null,
				habitatName: null,
				addressId: 'address-1',
				address: AN_ADDRESS,
				latitude: 34.052_13,
				longitude: -118.243_68,
			}),
		).toBe('123 Main St, Edison, NJ 08817');
	}, 300_000);

	it('names one at no habitat and no address by its centroid', async () => {
		expect(
			await titleFor({
				habitatId: null,
				habitatName: null,
				addressId: null,
				address: NO_ADDRESS,
				latitude: 34.052_13,
				longitude: -118.243_68,
			}),
		).toBe('34.05213, -118.24368');
	}, 300_000);

	it('calls one with neither an inspection', async () => {
		expect(
			await titleFor({
				habitatId: null,
				habitatName: null,
				addressId: null,
				address: NO_ADDRESS,
				latitude: null,
				longitude: null,
			}),
		).toBe('One-off inspection');
	}, 300_000);
});
