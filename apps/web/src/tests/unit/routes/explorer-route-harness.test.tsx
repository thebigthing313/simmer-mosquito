/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { stubPanelLayout } from './explorer-route-harness';

type Globals = { ResizeObserver?: unknown };

function descriptors() {
	return {
		observer: Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver'),
		height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
		width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
	};
}

/**
 * The stub redefines three globals, and before #1144 nothing put them back,
 * so a suite installing it in a `beforeAll` leaked one size into every later
 * describe in the file. Each case reads the descriptors before and after
 * rather than one value, because a restore that re-defines a getter of its
 * own would answer the same number and still be a different property.
 */
describe('stubPanelLayout', () => {
	it('answers one size for every element until restored', () => {
		const restore = stubPanelLayout();
		try {
			const element = document.createElement('div');
			expect(element.offsetHeight).toBe(700);
			expect(element.offsetWidth).toBe(1000);
			expect(typeof (globalThis as Globals).ResizeObserver).toBe('function');
		} finally {
			restore();
		}
	});

	it('puts back the descriptors that were there', () => {
		const before = descriptors();
		const restore = stubPanelLayout();
		expect(descriptors()).not.toEqual(before);
		restore();
		expect(descriptors()).toEqual(before);
		expect(document.createElement('div').offsetHeight).toBe(0);
	});

	// jsdom ships no ResizeObserver, so the observer is the live case for this
	// branch. jsdom does define the two getters, so the case removes all three
	// first and puts its own back afterwards.
	it('leaves absent a property that was absent', () => {
		const before = descriptors();
		delete (globalThis as Globals).ResizeObserver;
		delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
		delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
		try {
			const restore = stubPanelLayout();
			expect(document.createElement('div').offsetHeight).toBe(700);
			restore();
			expect(Object.hasOwn(globalThis, 'ResizeObserver')).toBe(false);
			expect(Object.hasOwn(HTMLElement.prototype, 'offsetHeight')).toBe(false);
			expect(Object.hasOwn(HTMLElement.prototype, 'offsetWidth')).toBe(false);
		} finally {
			for (const [target, name, descriptor] of [
				[globalThis, 'ResizeObserver', before.observer],
				[HTMLElement.prototype, 'offsetHeight', before.height],
				[HTMLElement.prototype, 'offsetWidth', before.width],
			] as const) {
				if (descriptor !== undefined) {
					Object.defineProperty(target, name, descriptor);
				}
			}
		}
	});
});
