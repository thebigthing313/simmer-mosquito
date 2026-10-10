/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StopCardFrame } from '../../../../components/stop-order';

/**
 * The card around a stop on the habitat Route edit page, the Mission detail
 * page and the two Assignment pages. Each wrote the toggle and the hover by
 * hand before #1578, so they are asserted once here.
 */
afterEach(cleanup);

const LABEL = 'Show stop 3 on the map';

/** Holds the selection the way a page does, so a second press can clear it. */
function SelectionHarness({
	onSelect,
	onHover,
}: {
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);

	return (
		<ul>
			<StopCardFrame
				focus={{
					selected: selectedId === 'stop-3',
					highlighted: false,
					onSelect: (id) => {
						onSelect(id);
						setSelectedId(id);
					},
					onHover,
				}}
				id="stop-3"
				label={LABEL}
			>
				<span>Alder catch basin</span>
			</StopCardFrame>
		</ul>
	);
}

describe('StopCardFrame', () => {
	it('selects the stop on the first press and clears it on the second', () => {
		const onSelect = vi.fn();
		render(<SelectionHarness onHover={() => {}} onSelect={onSelect} />);
		const button = screen.getByRole('button', { name: LABEL });

		expect(button.getAttribute('aria-pressed')).toBe('false');

		fireEvent.click(button);
		expect(onSelect).toHaveBeenLastCalledWith('stop-3');
		expect(button.getAttribute('aria-pressed')).toBe('true');

		fireEvent.click(button);
		expect(onSelect).toHaveBeenLastCalledWith(null);
		expect(button.getAttribute('aria-pressed')).toBe('false');
	});

	it('reports the stop on hover and clears it on leave', () => {
		const onHover = vi.fn();
		render(<SelectionHarness onHover={onHover} onSelect={() => {}} />);
		const card = screen.getByRole('listitem');

		fireEvent.mouseEnter(card);
		expect(onHover).toHaveBeenLastCalledWith('stop-3');

		fireEvent.mouseLeave(card);
		expect(onHover).toHaveBeenLastCalledWith(null);
		expect(onHover).toHaveBeenCalledTimes(2);
	});

	it('rings the card when the stop is highlighted from the map', () => {
		const noop = () => {};
		render(
			<ul>
				<StopCardFrame
					focus={{ selected: false, highlighted: true, onSelect: noop, onHover: noop }}
					id="stop-3"
					label={LABEL}
				>
					<span>Alder catch basin</span>
				</StopCardFrame>
			</ul>,
		);

		expect(screen.getByRole('listitem').className).toContain('ring-1');
		expect(screen.getByRole('button', { name: LABEL }).getAttribute('aria-pressed')).toBe('false');
	});
});
