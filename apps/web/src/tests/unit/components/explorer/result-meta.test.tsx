/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResultMeta } from '../../../../components/explorer/result-meta';

afterEach(cleanup);

/**
 * Nine explorers each carried their own copy of the count line (#101). These are
 * the exact strings the nine copies rendered, so the shared component cannot
 * quietly reword any of them.
 */
describe('ResultMeta', () => {
	const nouns = [
		{
			noun: { one: 'collection', many: 'collections' },
			one: '1 collection',
			many: '4 collections',
		},
		{ noun: { one: 'trap', many: 'traps' }, one: '1 trap', many: '4 traps' },
		{ noun: { one: 'release', many: 'releases' }, one: '1 release', many: '4 releases' },
		{
			noun: { one: 'application', many: 'applications' },
			one: '1 application',
			many: '4 applications',
		},
		{
			noun: { one: 'source reduction', many: 'source reductions' },
			one: '1 source reduction',
			many: '4 source reductions',
		},
		{ noun: { one: 'action', many: 'actions' }, one: '1 action', many: '4 actions' },
	];

	it.each(nouns)('reads $one at one and $many at four', ({ noun, one, many }) => {
		const { rerender } = render(<ResultMeta isLoading={false} noun={noun} total={1} />);
		expect(screen.getByText(one)).toBeDefined();
		rerender(<ResultMeta isLoading={false} noun={noun} total={4} />);
		expect(screen.getByText(many)).toBeDefined();
	});

	it('reads None where a counted explorer has nothing in range', () => {
		render(<ResultMeta isLoading={false} noun={{ one: 'trap', many: 'traps' }} total={0} />);
		expect(screen.getByText('None')).toBeDefined();
	});

	// habitats, inspections, and samples count what the viewport holds rather than
	// a set of records, so they say so instead of naming a noun.
	it('counts in view where no noun is given', () => {
		const { rerender } = render(<ResultMeta isLoading={false} total={0} />);
		expect(screen.getByText('None in view')).toBeDefined();
		rerender(<ResultMeta isLoading={false} total={1} />);
		expect(screen.getByText('1 in view')).toBeDefined();
	});

	// A refetch keeps the previous total on screen, so only a first load is "loading".
	it('shows the count rather than Loading… once a total has arrived', () => {
		const { rerender } = render(<ResultMeta isLoading total={0} />);
		expect(screen.getByText('Loading…')).toBeDefined();
		rerender(<ResultMeta isLoading total={7} />);
		expect(screen.getByText('7 in view')).toBeDefined();
	});
});
