/**
 * The parts of a linked record name that every call site gets whatever it asks
 * for, and the parts it chooses.
 *
 * Thirty-two copies of this string drifted apart before it had one home, and
 * the focus ring is what drifted: twelve of them carried a
 * `focus-visible:ring-offset-1` whose offset colour nothing in this workspace
 * sets, so it fell back to white and drew a halo on a dark card. So the ring is
 * asserted here rather than left to whoever writes the next call site.
 */

import { describe, expect, it } from 'vitest';
import { recordLink } from '../../../components/record-link';

const classes = (value: string): ReadonlySet<string> => new Set(value.split(/\s+/));

describe('recordLink', () => {
	it('gives every call site the same focus ring', () => {
		for (const value of [
			recordLink(),
			recordLink({ tone: 'muted' }),
			recordLink({ size: 'xs', tone: 'inherit', underline: 'hover' }),
		]) {
			const applied = classes(value);
			expect(applied).toContain('rounded-sm');
			expect(applied).toContain('focus-visible:outline-none');
			expect(applied).toContain('focus-visible:ring-2');
			expect(applied).toContain('focus-visible:ring-ring');
		}
	});

	it('offsets no ring, because nothing here sets a ring offset colour', () => {
		expect(recordLink()).not.toContain('ring-offset');
	});

	it('hovers to the primary colour whatever tone it rests at', () => {
		for (const tone of ['name', 'value', 'muted', 'inherit'] as const) {
			expect(classes(recordLink({ tone }))).toContain('hover:text-primary');
		}
	});

	it("defaults to the record's own name: medium weight, foreground, no size of its own", () => {
		const applied = classes(recordLink());
		expect(applied).toContain('font-medium');
		expect(applied).toContain('text-foreground');
		expect(applied).not.toContain('text-sm');
		expect(applied).not.toContain('hover:underline');
	});

	it('sets no colour at all for a link that takes the colour around it', () => {
		const applied = classes(recordLink({ tone: 'inherit' }));
		expect(applied).not.toContain('text-foreground');
		expect(applied).not.toContain('text-muted-foreground');
		expect(applied).not.toContain('font-medium');
	});

	it('underlines on hover with the offset, so the rule clears the descenders', () => {
		const applied = classes(recordLink({ underline: 'hover' }));
		expect(applied).toContain('hover:underline');
		expect(applied).toContain('underline-offset-4');
	});

	it('leaves layout to the call site', () => {
		// `truncate`, `w-fit`, `inline-flex` and the rest belong to the row a link
		// sits in, which is what DESIGN.md leaves to route-level `className`.
		const applied = classes(recordLink({ size: 'sm', tone: 'muted' }));
		for (const layout of ['truncate', 'w-fit', 'block', 'inline-flex', 'max-w-full', 'min-w-0']) {
			expect(applied).not.toContain(layout);
		}
	});
});
