/** @vitest-environment jsdom */

/**
 * The Address Book summary's two figures, drawn.
 *
 * Locality and postal code have no filter behind them, so each value is text
 * with its count and nothing in the summary is a button (#1378). The server
 * counts a missing or blank value under one null value, and the summary draws
 * no line for it.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExplorerSummary } from '../../../../../components/explorer/explorer-summary';
import { addressSummaryGroupings } from '../../../../../components/gis/addresses/address-summary';
import type { MapSummary } from '../../../../../hooks/explorer/use-explorer-summary';

afterEach(cleanup);

const SUMMARY: MapSummary = {
	total: 640,
	groups: {
		locality: [
			{ value: 'Monroe Township', count: 300 },
			{ value: 'Jamesburg', count: 120 },
			{ value: null, count: 80 },
			{ value: 'Cranbury', count: 60 },
			{ value: 'Helmetta', count: 40 },
			{ value: 'Spotswood', count: 25 },
			{ value: 'Old Bridge', count: 15 },
		],
		postalCode: [
			{ value: '08831', count: 420 },
			{ value: '08512', count: 100 },
			{ value: null, count: 80 },
			{ value: '08884', count: 40 },
		],
	},
};

function renderSummary(summary = SUMMARY) {
	render(
		<ExplorerSummary
			groupings={addressSummaryGroupings(summary)}
			recordType="address"
			state={{ data: summary, isError: false, retry: () => undefined }}
		/>,
	);
}

function lineTexts(name: string): readonly (string | null)[] {
	return within(screen.getByRole('region', { name }))
		.getAllByRole('listitem')
		.map((item) => item.textContent);
}

describe('the address summary', () => {
	it('draws each locality as text, top five and the rest counted, with no line for none', () => {
		renderSummary();

		expect(lineTexts('Locality')).toEqual([
			'Monroe Township300',
			'Jamesburg120',
			'Cranbury60',
			'Helmetta40',
			'Spotswood25',
		]);
		expect(
			within(screen.getByRole('region', { name: 'Locality' })).getByText('1 more'),
		).toBeTruthy();
	});

	it('draws each postal code as text, with no line for none', () => {
		renderSummary();

		expect(lineTexts('Postal Code')).toEqual(['08831420', '08512100', '0888440']);
		expect(
			within(screen.getByRole('region', { name: 'Postal Code' })).queryByText(/more$/),
		).toBeNull();
	});

	it('draws no value as a button, since no filter selects one', () => {
		renderSummary();

		expect(screen.queryAllByRole('button')).toEqual([]);
	});

	it('draws neither heading when every address in view has neither', () => {
		renderSummary({
			total: 150,
			groups: {
				locality: [{ value: null, count: 150 }],
				postalCode: [{ value: null, count: 150 }],
			},
		});

		expect(screen.queryByRole('region', { name: 'Locality' })).toBeNull();
		expect(screen.queryByRole('region', { name: 'Postal Code' })).toBeNull();
	});
});
