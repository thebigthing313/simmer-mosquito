import { OWNED_GEOMETRY_POLICIES } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { locationDescription } from '../../../../components/map/location-description';

describe('locationDescription', () => {
	it('offers every shape where the record stores every shape', () => {
		expect(
			locationDescription({
				geometryKind: 'habitat',
				subject: 'The geometry is the habitat itself.',
			}),
		).toBe(
			'The geometry is the habitat itself. Use a point for a single spot, a line or an area for a stretch. An address is optional reference.',
		);
	});

	it('adds the habitat clause when the section carries a habitat picker', () => {
		expect(
			locationDescription({
				geometryKind: 'controlAction',
				subject: 'The geometry is where the product was applied.',
				habitat: true,
			}),
		).toBe(
			'The geometry is where the product was applied. Use a point for a single spot, a line or an area for a stretch. An address is optional reference, and the habitat is the one the work was done at.',
		);
	});

	// The reason the sentence is composed rather than written out. A Trap stores a
	// point and nothing else, so copy telling its user to draw a line would
	// contradict the toggle beside it, which reads the same register.
	it('asks for a point alone where the record stores one', () => {
		expect(
			locationDescription({ geometryKind: 'trap', subject: 'The geometry is the trap.' }),
		).toBe('The geometry is the trap. Place a point. An address is optional reference.');
	});

	it('asks for the area alone where the record stores no point', () => {
		expect(
			locationDescription({ geometryKind: 'region', subject: 'The geometry is the region.' }),
		).toBe('The geometry is the region. Draw an area. An address is optional reference.');
	});

	// A policy that gains or loses a shape must move this copy with it, and a kind
	// with no sentence at all is the failure the register exists to stop.
	it('composes a sentence for every kind in the register', () => {
		for (const policy of OWNED_GEOMETRY_POLICIES) {
			const description = locationDescription({ geometryKind: policy.kind, subject: 'Here.' });
			expect(description.startsWith('Here. ')).toBe(true);
			expect(description.endsWith('An address is optional reference.')).toBe(true);
		}
	});
});
