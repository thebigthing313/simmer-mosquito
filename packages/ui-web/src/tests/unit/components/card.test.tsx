/**
 * A card's header and its body take their padding from one register.
 *
 * `CardContent` has had a `padding` axis since the variants were written and
 * `CardHeader` had none, so every compact card spelled its header's padding at
 * the call site. Forty-one of them said `py-4` while the body variant said
 * `py-3`, and the two halves of each card disagreed by 4px (#643). These cases
 * hold the two to the same values, so a call site cannot go back to writing one.
 *
 * Rendered to a string rather than into a DOM. Both components read props and
 * return a div, so `react-dom/server` shows the class list, and it keeps
 * `ui-web` off a jsdom dependency.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardContent, CardHeader } from '../../../components/ui/card';

const classesOf = (element: React.ReactElement): string[] => {
	const markup = renderToStaticMarkup(element);
	const match = /class="([^"]*)"/.exec(markup);
	if (match?.[1] === undefined) {
		throw new Error(`No class attribute in: ${markup}`);
	}
	return match[1].split(/\s+/).filter(Boolean);
};

const paddingOf = (element: React.ReactElement): string[] =>
	classesOf(element)
		.filter((name) => /^p[xytblr]?-/.test(name))
		.sort();

describe('card padding', () => {
	it('resolves compact to the same padding on the header and the body', () => {
		expect(paddingOf(<CardHeader padding="compact" />)).toEqual(
			paddingOf(<CardContent padding="compact" />),
		);
	});

	it('resolves none to the same padding on the header and the body', () => {
		expect(paddingOf(<CardHeader padding="none" />)).toEqual(
			paddingOf(<CardContent padding="none" />),
		);
	});

	it('gives a compact card a vertical padding, so the card need not', () => {
		// The three non-default `Card` variants set `py-0`, so a compact card
		// draws nothing above its title unless the header supplies it.
		expect(paddingOf(<CardHeader padding="compact" />)).toContain('py-3');
	});

	it('leaves a default header on the horizontal padding it has always had', () => {
		// `kitchen-sink` renders a bare header on a default card, and the card's
		// own `py-6` is what spaces it. Adding a vertical value here would move it.
		expect(paddingOf(<CardHeader />)).toEqual(['px-6']);
	});

	it('keeps a caller layout class beside the padding the variant supplies', () => {
		const classes = classesOf(
			<CardHeader className="flex flex-row items-center justify-between" padding="compact" />,
		);
		expect(classes).toContain('px-4');
		expect(classes).toContain('py-3');
		expect(classes).toContain('justify-between');
	});
});
