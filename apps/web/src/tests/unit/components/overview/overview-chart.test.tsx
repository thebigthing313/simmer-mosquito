/** @vitest-environment jsdom */

/**
 * The Y axis of every trend chart form, Today's days, Monthly's months and
 * Annual's years, at both heights. jsdom has no layout, so no tick has a width
 * to measure and a pixel assertion would pass on a clipped label; the axis is a
 * stand-in that records the props it was handed, and the suite asserts the
 * axis asks Recharts to size itself to its ticks rather than taking a fixed
 * width that `38,000` overruns (#1324).
 */

import { cleanup, render } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ChartSize {
	readonly width?: number;
	readonly height?: number;
}

const yAxisProps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('recharts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('recharts')>();
	return {
		...actual,
		// jsdom measures the container at zero, so the chart would draw no children.
		ResponsiveContainer: ({ children }: { readonly children: ReactElement<ChartSize> }) =>
			cloneElement(children, { width: 600, height: 208 }),
		YAxis: (props: Record<string, unknown>) => {
			yAxisProps.push(props);
			return null;
		},
	};
});

const { OverviewChart } = await import('../../../../components/overview/overview-chart');

beforeEach(() => {
	yAxisProps.length = 0;
});

afterEach(() => {
	cleanup();
});

const CASES = [
	{
		grain: 'day',
		period: '2026-09-15',
		points: [
			{ period: '2026-09-14', value: 600 },
			{ period: '2026-09-15', value: 38_000 },
		],
	},
	{
		grain: 'month',
		period: '2026-09',
		points: [
			{ period: '2025-09', value: 600 },
			{ period: '2026-09', value: 38_000 },
		],
	},
	{
		grain: 'year',
		period: '2026',
		points: [
			{ period: '2025', value: 600 },
			{ period: '2026', value: 38_000 },
		],
	},
] as const;

describe('OverviewChart Y axis', () => {
	for (const { grain, period, points } of CASES) {
		for (const height of ['panel', 'fill'] as const) {
			it(`sizes the ${grain} axis to its ticks at ${height} height`, () => {
				render(
					<OverviewChart
						grain={grain}
						height={height}
						onOpenPeriod={() => {}}
						period={period}
						series={{ kind: 'count', points }}
					/>,
				);

				expect(yAxisProps.length).toBeGreaterThan(0);
				for (const props of yAxisProps) {
					expect(props.width).toBe('auto');
					const format = props.tickFormatter as (value: number, index: number) => string;
					expect(format(38_000, 0)).toBe('38,000');
				}
			});
		}
	}
});
