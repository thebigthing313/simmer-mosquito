/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryCollection } from '../../../../routes/adult-surveillance/-trap-directory-data';

// The row links to the collection's own record. Only `Link` needs standing in —
// it is the one import that demands a live router.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

const { CollectionRow } = await import(
	'../../../../routes/adult-surveillance/-trap-collection-history'
);

afterEach(cleanup);

const SPECIES_NAMES = new Map([
	['species-vexans', 'Aedes vexans'],
	['species-sollicitans', 'Aedes sollicitans'],
]);

function collection(overrides: Partial<DirectoryCollection> = {}): DirectoryCollection {
	return {
		id: 'collection-1',
		collectedAt: '2026-07-14 06:00:00+00',
		collectionDate: null,
		collectionTimingMode: 'exact_timestamps',
		hasProblem: false,
		isZeroResult: false,
		hasBycatch: false,
		species: [
			{
				id: 'row-1',
				speciesId: 'species-vexans',
				count: 40,
				sex: 'female',
				status: 'gravid',
			},
			{
				id: 'row-2',
				speciesId: 'species-sollicitans',
				count: 120,
				sex: 'female',
				status: null,
			},
		],
		...overrides,
	};
}

// The agency's zone, handed in the way the pane hands it down. A US zone rather
// than UTC so a fixture collected in the evening lands on a different day in the
// two, which is what lets the date assertions below fail if the row ever goes
// back to reading a raw timestamp's UTC prefix.
const AGENCY_TIME_ZONE = 'America/New_York';

function renderRow(row: DirectoryCollection) {
	return render(
		<CollectionRow collection={row} speciesNameById={SPECIES_NAMES} timeZone={AGENCY_TIME_ZONE} />,
	);
}

/**
 * A trap's year is read as a run of dates, and the specimens behind one date are
 * asked for rather than shown. That default is the whole reason the row is a
 * disclosure: a season of open species tables is a wall, not a history.
 */
describe('CollectionRow', () => {
	// The weekday is part of the date, not decoration: field work runs weekly, and
	// it is what says whether a gap in a run is a missed visit or a weekend.
	it('opens closed, showing the date and what it caught but not the species', () => {
		renderRow(collection());

		expect(screen.getByText('Tue, Jul 14')).toBeTruthy();
		expect(screen.getByText('2 species · 160 specimens')).toBeTruthy();
		expect(screen.queryByText('Aedes vexans')).toBeNull();
	});

	it('shows the specimens, most numerous first, once it is opened', () => {
		renderRow(collection());
		fireEvent.click(screen.getByRole('button'));

		const names = screen
			.getAllByRole('cell')
			.map((cell) => cell.textContent)
			.filter((text) => text === 'Aedes vexans' || text === 'Aedes sollicitans');
		expect(names).toEqual(['Aedes sollicitans', 'Aedes vexans']);
	});

	// Three ways a collection has no species table, each meaning something
	// different. Collapsing them into one blank panel would tell an identifier
	// that a sample nobody has keyed out is a trap that caught nothing.
	it('says why there is no species table, in the words that apply', () => {
		renderRow(collection({ isZeroResult: true }));
		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByText(/Marked zero result/)).toBeTruthy();
		cleanup();

		renderRow(collection({ species: [] }));
		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByText(/No species have been identified/)).toBeTruthy();
		cleanup();

		renderRow(collection({ collectedAt: null, species: [] }));
		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByText(/still out/)).toBeTruthy();
	});

	it('reads a date-and-duration collection by its collection date', () => {
		// `collectedAt` is null for the whole of this timing mode, so a row that
		// read it alone would show every one of them as undated.
		renderRow(
			collection({
				collectedAt: null,
				collectionDate: '2026-09-02',
				collectionTimingMode: 'collection_date_duration',
			}),
		);

		expect(screen.getByText('Wed, Sep 2')).toBeTruthy();
		expect(screen.queryByText('Not yet collected')).toBeNull();
	});
});
