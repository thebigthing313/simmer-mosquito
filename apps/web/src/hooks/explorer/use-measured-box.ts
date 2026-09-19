import { type RefCallback, useState } from 'react';

export interface MeasuredBox {
	readonly width: number;
	readonly height: number;
}

/**
 * An element's rendered size, kept current as it resizes.
 *
 * Returns a ref callback to attach to the element and the last measurement.
 * The measurement is `null` until the element has been measured once, which a
 * caller reads as "not measured yet" rather than as zero.
 */
export function useMeasuredBox(): [RefCallback<HTMLElement>, MeasuredBox | null] {
	const [box, setBox] = useState<MeasuredBox | null>(null);

	const record = (width: number, height: number) => {
		setBox((current) =>
			current !== null && current.width === width && current.height === height
				? current
				: { width, height },
		);
	};

	const ref: RefCallback<HTMLElement> = (element: HTMLElement | null) => {
		if (element === null) {
			return;
		}
		// Read once here rather than waiting for the observer's first delivery.
		// ResizeObserver reports after layout and before paint, so a document
		// that has not painted yet, a background tab or a hidden pane, never
		// hears from it, and a layout chosen from no measurement would flash the
		// wrong one on the first frame everywhere else.
		const rect = element.getBoundingClientRect();
		record(rect.width, rect.height);

		if (typeof ResizeObserver === 'undefined') {
			return;
		}
		const observer = new ResizeObserver((entries) => {
			const box = entries[0]?.contentRect;
			if (box !== undefined) {
				record(box.width, box.height);
			}
		});
		observer.observe(element);
		return () => observer.disconnect();
	};

	return [ref, box];
}
