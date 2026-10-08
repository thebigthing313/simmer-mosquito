/** @vitest-environment jsdom */

/**
 * The Y axis of every trend chart form, Today's days, Monthly's months and
 * Annual's years, at both heights. jsdom has no layout, so no tick has a width
 * to measure and a pixel assertion would pass on a clipped label; the axis is a
 * stand-in that records the props it was handed, and the suite asserts the
 * axis asks Recharts to size itself to its ticks rather than taking a fixed
 * width that `38,000` overruns (#1324).
 *
 * The five-year average is read the same way: the bars and reference lines
 * are stand-ins recording their props, so the suite asserts Monthly's third
 * bar and Annual's dashed line by what each was handed.
 */

import { cleanup, render } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ChartSize {
	readonly width?: number;
	readonly height?: number;
}

const yAxisProps = vi.hoisted(() => [] as Record<string, unknown>[]);
const barProps = vi.hoisted(() => [] as Record<string, unknown>[]);
const referenceLineProps = vi.hoisted(() => [] as Record<string, unknown>[]);

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
		Bar: (props: Record<string, unknown>) => {
			barProps.push(props);
			return null;
		},
		ReferenceLine: (props: Record<string, unknown>) => {
			referenceLineProps.push(props);
			return null;
		},
	};
});

const { OverviewChart } = await import('../../../../components/overview/overview-chart');

beforeEach(() => {
	yAxisProps.length = 0;
	barProps.length = 0;
	referenceLineProps.length = 0;
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
		average: [],
	},
	{
		grain: 'month',
		period: '2026-09',
		points: [
			{ period: '2025-09', value: 600 },
			{ period: '2026-09', value: 38_000 },
		],
		average: Array.from({ length: 12 }, () => 900),
	},
	{
		grain: 'year',
		period: '2026',
		points: [
			{ period: '2025', value: 600 },
			{ period: '2026', value: 38_000 },
		],
		average: [900],
	},
] as const;

describe('OverviewChart Y axis', () => {
	for (const { grain, period, points, average } of CASES) {
		for (const height of ['panel', 'fill'] as const) {
			it(`sizes the ${grain} axis to its ticks at ${height} height`, () => {
				render(
					<OverviewChart
						grain={grain}
						height={height}
						onOpenPeriod={() => {}}
						period={period}
						series={{ kind: 'count', points, average }}
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

describe('OverviewChart five-year average', () => {
	it('draws the average as a third bar on Monthly, after the two years, opening nothing', () => {
		render(
			<OverviewChart
				grain="month"
				onOpenPeriod={() => {}}
				period="2026-09"
				series={{ kind: 'count', points: CASES[1].points, average: CASES[1].average }}
			/>,
		);

		expect(barProps.map((props) => props.dataKey)).toEqual(['period', 'comparison', 'average']);
		expect(barProps[2]).toMatchObject({ fill: 'var(--color-average)' });
		expect(barProps[2]?.onClick).toBeUndefined();
	});

	it('draws the average as a dashed horizontal line on Annual', () => {
		render(
			<OverviewChart
				grain="year"
				onOpenPeriod={() => {}}
				period="2026"
				series={{ kind: 'count', points: CASES[2].points, average: [900] }}
			/>,
		);

		const line = referenceLineProps.find((props) => props.y !== undefined);
		expect(line).toMatchObject({
			y: 900,
			stroke: 'var(--chart-average)',
			strokeDasharray: '6 4',
			ifOverflow: 'extendDomain',
		});
	});

	it('draws a ratio average off its pooled sums, and no line when no year qualifies', () => {
		render(
			<OverviewChart
				grain="year"
				onOpenPeriod={() => {}}
				period="2026"
				series={{
					kind: 'ratio',
					ratio: 'positiveInspections',
					points: [{ period: '2026', numerator: 1, denominator: 4 }],
					average: [{ numerator: 3, denominator: 12 }],
				}}
			/>,
		);
		expect(referenceLineProps.find((props) => props.y !== undefined)).toMatchObject({ y: 0.25 });

		cleanup();
		referenceLineProps.length = 0;
		render(
			<OverviewChart
				grain="year"
				onOpenPeriod={() => {}}
				period="2026"
				series={{ kind: 'count', points: CASES[2].points, average: [null] }}
			/>,
		);
		expect(referenceLineProps.find((props) => props.y !== undefined)).toBeUndefined();
	});
});
