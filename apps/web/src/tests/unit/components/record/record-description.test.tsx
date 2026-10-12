/** @vitest-environment jsdom */

/**
 * The free-text block a detail page draws for a description (#1661).
 *
 * Trap, habitat and region detail drew theirs in a plain paragraph, which
 * collapses the newlines a VectorSurv import or a hand-typed note carries, so a
 * five-line trap description read as one run-on line. jsdom applies no
 * stylesheet, so the case asserts the text arrives with its newlines and the
 * paragraph carries the class that keeps them.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordDescription } from '../../../../components/record/record-description';

const MULTI_LINE = '23 Tennyson Street\nAccess trap details:\n- VectorSurv ID: 12017049';

describe('RecordDescription', () => {
	afterEach(cleanup);

	it('keeps the line breaks the description was written with', () => {
		render(<RecordDescription text={MULTI_LINE} />);
		const body = screen.getByText((_, element) => element?.textContent === MULTI_LINE, {
			selector: 'p',
		});
		expect(body.className).toContain('whitespace-pre-wrap');
	});

	it('labels the block Description', () => {
		render(<RecordDescription text="Catch basin" />);
		expect(screen.getByText('Description')).toBeTruthy();
	});

	it('draws nothing for a blank description with no empty text', () => {
		const { container } = render(<RecordDescription text={'  \n '} />);
		expect(container.textContent).toBe('');
	});

	it('draws nothing for a null description with no empty text', () => {
		const { container } = render(<RecordDescription text={null} />);
		expect(container.textContent).toBe('');
	});

	it('draws the empty text for a blank description when it has one', () => {
		render(<RecordDescription emptyText="No description recorded." text=" " />);
		expect(screen.getByText('No description recorded.')).toBeTruthy();
		expect(screen.getByText('Description')).toBeTruthy();
	});
});
