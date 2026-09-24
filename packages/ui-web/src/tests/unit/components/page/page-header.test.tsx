/**
 * One heading component, one size, and one icon treatment.
 *
 * The product had three page-heading treatments at three declared sizes and none
 * of them was the size `DESIGN.md`'s Headline row asked for, with a duplicate no
 * reader could see because `text-[1.5rem]` and `text-2xl` compute the same
 * (#647). These cases hold the survivor to the registered role rather than to
 * either literal, so a branch that writes an arbitrary value back fails here.
 *
 * Rendered to a string rather than into a DOM, the trade `card.test.tsx` makes:
 * the component reads props and returns markup, so `react-dom/server` shows the
 * class lists and `ui-web` stays off a jsdom dependency.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '../../../../components/page/page-header';

/** A stand-in for a registry icon: the registry itself is not what is under test. */
function TestIcon({ className }: { readonly className?: string | undefined }) {
	return <svg className={className} />;
}

const markupOf = (element: React.ReactElement): string => renderToStaticMarkup(element);

const headingClasses = (markup: string): string[] => {
	const match = /<h1 class="([^"]*)"/.exec(markup);
	if (match?.[1] === undefined) {
		throw new Error(`No h1 in: ${markup}`);
	}
	return match[1].split(/\s+/).filter(Boolean);
};

describe('the page heading', () => {
	it('reaches its size through the registered role, not an arbitrary value', () => {
		const classes = headingClasses(markupOf(<PageHeader icon={TestIcon} title="Habitats" />));

		expect(classes).toContain('text-heading');
		expect(classes).toContain('leading-heading');
		expect(classes.some((name) => name.includes('['))).toBe(false);
	});

	// The uppercase label above a heading is a detail page's, where it names the
	// record type, and `DetailPageHeader` draws it. This one draws none.
	it('tiles the icon and draws no eyebrow', () => {
		const markup = markupOf(<PageHeader icon={TestIcon} title="Habitats" />);

		expect(markup).toContain('bg-primary/10');
		expect(markup).toContain('size-5');
		expect(markup).not.toContain('uppercase');
	});

	it('draws no subject at all for the page that opens with a back link', () => {
		const markup = markupOf(<PageHeader title="New Assignment" />);

		expect(markup).not.toContain('<svg');
		expect(markup).toContain('New Assignment');
	});

	it('caps the description at one measure, whether it is a string or a node', () => {
		const fromString = markupOf(
			<PageHeader
				description="Every inspection your crews have recorded."
				icon={TestIcon}
				title="Inspections"
			/>,
		);
		const fromNode = markupOf(
			<PageHeader
				description={<p className="m-0">12 Elm Street</p>}
				icon={TestIcon}
				title="12 Elm Street"
			/>,
		);

		for (const markup of [fromString, fromNode]) {
			expect(markup).toContain('max-w-[68ch]');
			expect(markup).toContain('text-sm');
		}
		expect(fromString).not.toContain('max-w-[60ch]');
	});
});
