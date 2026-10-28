import { mapInteraction } from '@simmer-mosquito/design-tokens';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A teardrop with its tip at the bottom centre, which is where the marker anchors. */
const PIN_PATH = 'M14 0C6.3 0 0 6.1 0 13.7 0 24 14 36 14 36s14-12 14-22.3C28 6.1 21.7 0 14 0z';

/**
 * The landing pin's DOM: a teardrop in `mapInteraction.landing` with an
 * off-white casing and hollow centre, named `name` for assistive technology.
 * The caller anchors it at its bottom, so the tip sits on the point.
 */
export function createLandingPinElement(name: string): HTMLDivElement {
	const element = document.createElement('div');
	element.className = 'pointer-events-none drop-shadow-md';
	element.setAttribute('role', 'img');
	element.setAttribute('aria-label', name);
	element.dataset.landingPin = '';

	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('width', '30');
	svg.setAttribute('height', '38');
	svg.setAttribute('viewBox', '-1 -1 30 38');

	const body = document.createElementNS(SVG_NS, 'path');
	body.setAttribute('d', PIN_PATH);
	body.setAttribute('fill', mapInteraction.landing);
	body.setAttribute('stroke', mapInteraction.landingStroke);
	body.setAttribute('stroke-width', '2');

	const eye = document.createElementNS(SVG_NS, 'circle');
	eye.setAttribute('cx', '14');
	eye.setAttribute('cy', '13.5');
	eye.setAttribute('r', '5');
	eye.setAttribute('fill', mapInteraction.landingStroke);

	svg.append(body, eye);
	element.append(svg);
	return element;
}
