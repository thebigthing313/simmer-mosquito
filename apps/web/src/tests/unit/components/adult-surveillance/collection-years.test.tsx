/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	CollectionYear,
	DirectoryCollection,
} from '../../../../components/adult-surveillance/trap-directory-data';

// Each collection row links to its record, and `Link` is the one import that
// demands a live router.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

const { CollectionYears } = await import(
	'../../../../components/adult-surveillance/collection-years'
);

afterEach(cleanup);

const ORGANIZATION_TIME_ZONE = 'America/New_York';

/** One collection on 14 July of `year`, so each season's rows read differently. */
function collection(year: number, index: number): DirectoryCollection {
	return {
		id: `collection-${year}-${index}`,
		collectedAt: `${year}-07-${String(10 + index).padStart(2, '0')} 16:00:00+00`,
		collectionDate: null,
		collectionTimingMode: 'exact_timestamps',
		hasProblem: false,
		isZeroResult: false,
		hasBycatch: false,
		species: [],
	};
}

/** Twenty seasons, 2026 back to 2007, each one to five collections long. */
const TWENTY_SEASONS: readonly CollectionYear[] = Array.from({ length: 20 }, (_, offset) => {
	const year = 2026 - offset;
	const count = (year % 5) + 1;
	return {
		key: String(year),
		label: String(year),
		collections: Array.from({ length: count }, (_, index) => collection(year, index)),
	};
});

function renderYears(
	years: readonly CollectionYear[],
	onLoadEarlier?: () => void,
): ReturnType<typeof render> {
	return render(
		<CollectionYears
			header={<h2>Trap 12</h2>}
			isError={false}
			isReady={true}
			onLoadEarlier={onLoadEarlier}
			speciesNameById={new Map()}
			timeZone={ORGANIZATION_TIME_ZONE}
			years={years}
		/>,
	);
}

/** Open the Earlier Seasons menu the way a pointer does. */
async function openEarlierSeasons(): Promise<HTMLElement> {
	const trigger = screen.getByRole('button', { name: /Earlier Seasons/ });
	fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
	return screen.findByRole('menu');
}

describe('CollectionYears', () => {
	it('keeps the three most recent seasons as tabs and the rest behind Earlier Seasons', async () => {
		renderYears(TWENTY_SEASONS);

		const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
		expect(tabs).toEqual(['20262', '20251', '20245']);

		const menu = await openEarlierSeasons();
		const entries = within(menu)
			.getAllByRole('menuitemradio')
			.map((entry) => entry.textContent);
		expect(entries).toHaveLength(17);
		expect(entries[0]).toBe('20234');
		expect(entries.at(-1)).toBe('20073');
	});

	it('shows an older season picked from the menu, and marks it selected', async () => {
		renderYears(TWENTY_SEASONS);
		expect(screen.getAllByRole('listitem')).toHaveLength(2);

		const menu = await openEarlierSeasons();
		fireEvent.click(within(menu).getByRole('menuitemradio', { name: /2012/ }));

		// 2012 is three collections long, from 10 July.
		expect(screen.getAllByRole('listitem')).toHaveLength(3);
		expect(screen.getByText('Tue, Jul 10')).toBeTruthy();
		for (const tab of screen.getAllByRole('tab')) {
			expect(tab.getAttribute('aria-selected')).toBe('false');
		}
		const trigger = screen.getByRole('button', { name: /Earlier Seasons/ });
		expect(trigger.textContent).toContain('2012');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect(trigger.getAttribute('data-selected')).toBe('true');

		const reopened = await openEarlierSeasons();
		const checked = within(reopened)
			.getAllByRole('menuitemradio')
			.filter((entry) => entry.getAttribute('aria-checked') === 'true');
		expect(checked.map((entry) => entry.textContent)).toEqual(['20123']);
	});

	it('opens an older season from the keyboard', async () => {
		renderYears(TWENTY_SEASONS);

		const trigger = screen.getByRole('button', { name: /Earlier Seasons/ });
		fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		const menu = await screen.findByRole('menu');
		const first = within(menu).getAllByRole('menuitemradio')[0];
		expect(first?.textContent).toBe('20234');
		fireEvent.keyDown(first as HTMLElement, { key: 'Enter' });

		expect(screen.queryByRole('menu')).toBeNull();
		expect(screen.getAllByRole('listitem')).toHaveLength(4);
		expect(trigger.textContent).toContain('2023');
	});

	it('goes back to a tab from an older season', async () => {
		renderYears(TWENTY_SEASONS);
		const menu = await openEarlierSeasons();
		fireEvent.click(within(menu).getByRole('menuitemradio', { name: /2012/ }));

		const tab = screen.getByRole('tab', { name: /2025/ });
		fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
		expect(tab.getAttribute('aria-selected')).toBe('true');
		expect(screen.getAllByRole('listitem')).toHaveLength(1);
		const trigger = screen.getByRole('button', { name: /Earlier Seasons/ });
		expect(trigger.getAttribute('data-selected')).toBe('false');
	});

	it('is a button that loads older seasons until they are loaded', () => {
		const onLoadEarlier = vi.fn();
		renderYears(TWENTY_SEASONS.slice(0, 3), onLoadEarlier);

		const button = screen.getByRole('button', { name: 'Earlier Seasons' });
		expect(button.getAttribute('aria-haspopup')).toBeNull();
		fireEvent.click(button);
		expect(onLoadEarlier).toHaveBeenCalledOnce();
		expect(screen.queryByRole('menu')).toBeNull();
	});

	it('draws no menu for a trap with three seasons or fewer', () => {
		renderYears(TWENTY_SEASONS.slice(0, 2));
		expect(screen.getAllByRole('tab')).toHaveLength(2);
		expect(screen.queryByRole('button', { name: /Earlier Seasons/ })).toBeNull();
	});

	it('keeps the undated group as a tab beside the three most recent seasons', () => {
		const undated: CollectionYear = {
			key: 'undated',
			label: 'Trap out',
			collections: [{ ...collection(2026, 9), id: 'pending', collectedAt: null }],
		};
		renderYears([undated, ...TWENTY_SEASONS]);
		expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
			'Trap out1',
			'20262',
			'20251',
			'20245',
		]);
	});
});
