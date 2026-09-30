/**
 * The height cap a `ScrollBody` holds on the viewport a node scrolls inside, or
 * undefined when the node is in no capped scroll body (#1283).
 *
 * `ScrollBody` writes the cap to a custom property on the scroll area root and
 * points the viewport's `max-height` at it, so the root carries the value while
 * the viewport is what stops growing.
 */
export function scrollBodyCap(node: Element | null | undefined): string | undefined {
	const root = node
		?.closest('[data-slot="scroll-area-viewport"]')
		?.closest<HTMLElement>('[data-slot="scroll-area"]');
	const cap = root?.style.getPropertyValue('--scroll-body-cap');
	return cap === '' ? undefined : cap;
}
