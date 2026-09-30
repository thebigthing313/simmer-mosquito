// @vitest-environment jsdom

/**
 * The message block and the stack scroll inside the shared `ScrollArea`, so a
 * long message or stack draws the styled bar rather than the browser's own
 * (#1255). Each cap is held on the viewport, because a cap on the root clips
 * rather than scrolls.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorReport } from '../../../../components/error-report/error-report';

afterEach(cleanup);

const classesOf = (element: Element | null | undefined): string[] =>
	(element?.getAttribute('class') ?? '').split(/\s+/);

const scrollAreaAround = (element: Element | null) =>
	element?.closest('[data-slot="scroll-area-viewport"]')?.closest('[data-slot="scroll-area"]');

describe('the error report scrollers', () => {
	it('scrolls the message and the stack inside capped scroll areas', () => {
		const error = new Error('boom');
		error.stack = 'Error: boom\n    at somewhere (file.ts:1:1)';
		const { container } = render(
			<ErrorReport error={error} title="The page did not load" version="0.3.0" />,
		);

		const message = scrollAreaAround(screen.getByText('boom'));
		const stack = scrollAreaAround(container.querySelector('pre'));

		expect(classesOf(message)).toContain('[&>[data-slot=scroll-area-viewport]]:max-h-40');
		expect(classesOf(stack)).toContain('[&>[data-slot=scroll-area-viewport]]:max-h-64');
		expect(container.querySelector('.overflow-y-auto, .overflow-auto')).toBeNull();
	});
});
