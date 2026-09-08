/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogBody } from '../../../components/catalog';

/**
 * The two things `CatalogBody` decides that no page can see for itself.
 *
 * An empty search result is not an empty catalog: one means "add something",
 * the other means "type less". While each of the four pages held its own search
 * state and its own count, that distinction was four implementations and was
 * asserted zero times. It is one implementation now, so it is assertable.
 *
 * The threshold is the other one. The filter is drawn only once the list is
 * long enough to be worth scanning, and the boundary is what a reader cannot
 * check by looking at the number.
 */

interface Row {
	readonly id: string;
	readonly name: string;
}

function rows(count: number): readonly Row[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `row-${index}`,
		name: `Row ${index}`,
	}));
}

function matchesRow(row: Row, query: string): boolean {
	return row.name.toLowerCase().includes(query);
}

function renderCatalog(given: readonly Row[]) {
	render(
		<CatalogBody
			empty={<p>No rows yet</p>}
			isReady={true}
			matches={matchesRow}
			noun="rows"
			rows={given}
		>
			{(filtered) => (
				<ul>
					{filtered.map((row) => (
						<li key={row.id}>{row.name}</li>
					))}
				</ul>
			)}
		</CatalogBody>,
	);
}

function search(value: string) {
	fireEvent.change(screen.getByLabelText('Search rows'), { target: { value } });
}

afterEach(cleanup);

describe('CatalogBody', () => {
	it('shows the empty catalog when there are no rows at all', () => {
		renderCatalog([]);

		expect(screen.getByText('No rows yet')).toBeTruthy();
	});

	// The assertion the old shape made four separate things.
	it('shows no matches, not the empty catalog, when a search matches nothing', () => {
		renderCatalog(rows(10));
		search('zzz');

		expect(screen.getByText(/No rows match/)).toBeTruthy();
		expect(screen.queryByText('No rows yet')).toBeNull();
	});

	it('quotes what was typed, not the lowercased query, in the no-matches line', () => {
		renderCatalog(rows(10));
		search('  ZZZ  ');

		expect(screen.getByText(/“ZZZ”/)).toBeTruthy();
	});

	it('hands the child function only the rows that matched', () => {
		renderCatalog(rows(10));
		search('row 3');

		expect(screen.getByText('Row 3')).toBeTruthy();
		expect(screen.queryByText('Row 4')).toBeNull();
	});

	it('counts the matches against the total once a query is typed', () => {
		renderCatalog(rows(10));
		expect(screen.getByText('10 rows')).toBeTruthy();

		search('row 3');

		expect(screen.getByText('1 of 10 rows')).toBeTruthy();
	});

	it('draws no search box at the threshold', () => {
		renderCatalog(rows(6));

		expect(screen.queryByLabelText('Search rows')).toBeNull();
	});

	it('draws the search box one row above the threshold', () => {
		renderCatalog(rows(7));

		expect(screen.getByLabelText('Search rows')).toBeTruthy();
	});
});
