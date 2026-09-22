import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { PanelRows, type PanelRowsReading } from '@simmer-mosquito/ui-web/components/panel-rows';
import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@simmer-mosquito/ui-web/components/ui/chart';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldSet,
	FieldTitle,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	NativeSelect,
	NativeSelectOption,
} from '@simmer-mosquito/ui-web/components/ui/native-select';
import { Progress } from '@simmer-mosquito/ui-web/components/ui/progress';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tabs';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import {
	CheckCircle2Icon,
	DownloadIcon,
	DropletIcon,
	PlusIcon,
	SaveIcon,
	SearchIcon,
	TriangleAlertIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	ReferenceLine,
	XAxis,
	YAxis,
} from 'recharts';

export const Route = createFileRoute('/kitchen-sink')({
	component: KitchenSinkPage,
});

const buttonVariants = ['default', 'secondary', 'outline', 'ghost', 'destructive'] as const;
const badgeTones = ['success', 'warning', 'info', 'catalog', 'danger', 'neutral'] as const;
/** Enough tabs to run past the column, which is the case the strip exists for. */
const PREVIEW_SEASONS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'] as const;

/**
 * The two series roles the period-in-review charts paint, named the way
 * `ChartStyle` scopes them so a mark reads `var(--color-period)`: the period
 * shown in `--chart-period`, the period it is read beside in
 * `--chart-comparison`.
 */
const periodChartConfig = {
	period: { label: '2026', color: 'var(--chart-period)' },
	comparison: { label: '2025', color: 'var(--chart-comparison)' },
} satisfies ChartConfig;

/** Twelve months of counts for two years, the shape the Monthly chart plots. */
const monthlyCounts = [
	['Jan', 12, 9],
	['Feb', 18, 14],
	['Mar', 44, 39],
	['Apr', 120, 98],
	['May', 260, 231],
	['Jun', 410, 377],
	['Jul', 455, 402],
	['Aug', 398, 361],
	['Sep', 214, 240],
	['Oct', 88, 102],
	['Nov', 21, 30],
	['Dec', 9, 11],
].map(([month, period, comparison]) => ({ month, period, comparison }));

/** Sixteen years of counts, the shape the Annual bar plots. */
const yearlyCounts = Array.from({ length: 16 }, (_, index) => ({
	year: `${2011 + index}`,
	period: 18000 + Math.round(9000 * Math.sin(index / 2.5)) + index * 600,
}));

/** Sixty days of counts with one gap, the shape the Today area plots. */
const dailyCounts = Array.from({ length: 60 }, (_, index) => ({
	day: `Day ${index + 1}`,
	period: index === 30 ? null : Math.round(120 + 90 * Math.sin(index / 6) + (index % 7) * 8),
}));

/** One reading per branch, so all four states of a child-record card sit side by side. */
const panelRowsStates: readonly {
	readonly label: string;
	readonly reading: PanelRowsReading<string>;
}[] = [
	{ label: 'Rows', reading: { isReady: true, rows: ['Dip 1 of 5', 'Dip 2 of 5'] } },
	{ label: 'Loading', reading: { isReady: false, rows: [] } },
	{ label: 'Empty', reading: { isReady: true, rows: [] } },
	{ label: 'Unavailable', reading: { isError: true, isReady: true, rows: [] } },
];

function KitchenSinkPage() {
	return (
		<div className="workshop-page">
			<header className="preview-page-header">
				<div>
					<p className="preview-eyebrow">Phase 3</p>
					<h1>Kitchen Sink</h1>
				</div>
				<p>Default shared UI states in one scrollable surface for visual regression review.</p>
			</header>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Actions</p>
						<h2>Buttons & Badges</h2>
					</div>
				</div>
				<div className="component-grid dense">
					{buttonVariants.map((variant) => (
						<Button key={variant} type="button" variant={variant}>
							{variant === 'default' ? <SaveIcon aria-hidden="true" /> : null}
							{variant}
						</Button>
					))}
					<Button type="button" size="sm" variant="outline">
						<DownloadIcon aria-hidden="true" />
						Small
					</Button>
					<Button type="button" size="icon" aria-label="Add record">
						<PlusIcon aria-hidden="true" />
					</Button>
					<Button type="button" disabled>
						Disabled
					</Button>
				</div>
				<div className="component-grid dense">
					{badgeTones.map((tone) => (
						<Badge key={tone} tone={tone} variant="outline">
							{tone}
						</Badge>
					))}
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Forms</p>
						<h2>Fields & Controls</h2>
					</div>
				</div>
				<div className="form-preview-grid">
					<FieldSet>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="trap-name">Trap name</FieldLabel>
								<Input id="trap-name" placeholder="BG Sentinel 14" />
								<FieldDescription>Operational label shown in mission dispatch.</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="district">District</FieldLabel>
								<NativeSelect id="district" defaultValue="north">
									<NativeSelectOption value="north">North field district</NativeSelectOption>
									<NativeSelectOption value="south">South field district</NativeSelectOption>
								</NativeSelect>
							</Field>
							<Field>
								<FieldLabel htmlFor="notes">Notes</FieldLabel>
								<Textarea id="notes" placeholder="Access gate is locked after 4 PM." />
							</Field>
						</FieldGroup>
					</FieldSet>
					<FieldSet className="control-stack">
						<Field orientation="horizontal">
							<Checkbox id="include-archived" />
							<FieldTitle>Include archived records</FieldTitle>
						</Field>
						<Field orientation="horizontal">
							<Switch id="map-context" defaultChecked />
							<FieldTitle>Keep map context visible</FieldTitle>
						</Field>
						<Separator />
						<Progress value={68} />
					</FieldSet>
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Containers</p>
						<h2>Cards, Alerts & Tabs</h2>
					</div>
				</div>
				<div className="component-grid cards">
					<Card>
						<CardHeader>
							<CardTitle>Route readiness</CardTitle>
							<CardDescription>Inspection queue for tomorrow morning.</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="fact-row">
								<span>Stops</span>
								<strong>37</strong>
							</div>
							<div className="fact-row">
								<span>Unassigned</span>
								<strong>4</strong>
							</div>
						</CardContent>
						<CardFooter>
							<Button type="button" size="sm" variant="secondary">
								Review
							</Button>
						</CardFooter>
					</Card>
					<Card variant="surface">
						<CardHeader padding="compact">
							<CardTitle>Trap servicing</CardTitle>
							<CardDescription>
								A compact card. The header and the body take the same padding variant, so the
								spacing above the title matches the spacing below the last row.
							</CardDescription>
						</CardHeader>
						<CardContent padding="compact">
							<div className="fact-row">
								<span>Traps set</span>
								<strong>12</strong>
							</div>
							<div className="fact-row">
								<span>Awaiting pickup</span>
								<strong>3</strong>
							</div>
						</CardContent>
					</Card>
					<div className="alert-stack">
						<Alert>
							<CheckCircle2Icon aria-hidden="true" />
							<AlertTitle>Sync current</AlertTitle>
							<AlertDescription>
								All shared taxonomy records are available offline.
							</AlertDescription>
						</Alert>
						<Alert variant="destructive">
							<TriangleAlertIcon aria-hidden="true" />
							<AlertTitle>Threshold exceeded</AlertTitle>
							<AlertDescription>
								Adult trap count requires review before publishing.
							</AlertDescription>
						</Alert>
					</div>
					<Tabs defaultValue="records">
						<TabsList>
							<TabsTrigger value="records">Records</TabsTrigger>
							<TabsTrigger value="map">Map</TabsTrigger>
						</TabsList>
						<TabsContent value="records">
							<div className="tab-panel">34 records ready for assignment.</div>
						</TabsContent>
						<TabsContent value="map">
							<div className="tab-panel">Spatial layer preview placeholder.</div>
						</TabsContent>
					</Tabs>
					{/*
					 * The product's own strip, drawn here at a length no card holds: it
					 * runs off the side rather than wrapping, and it draws no vertical
					 * scrollbar while doing it, which is what a strip built out of
					 * `overflow-x-auto` alone gets wrong.
					 */}
					<Tabs defaultValue="2019">
						<TabStrip>
							{PREVIEW_SEASONS.map((season) => (
								<TabStripTab key={season} value={season}>
									{season}
								</TabStripTab>
							))}
						</TabStrip>
						{PREVIEW_SEASONS.map((season) => (
							<TabsContent key={season} value={season}>
								<div className="tab-panel">Collections recorded in {season}.</div>
							</TabsContent>
						))}
					</Tabs>
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Data</p>
						<h2>Table & Loading</h2>
					</div>
					<div className="icon-search compact">
						<SearchIcon aria-hidden="true" />
						<Input aria-label="Visual table search" placeholder="Search records" />
					</div>
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Record</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Assigned</TableHead>
							<TableHead className="text-right">Count</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{['Larval habitat check', 'Adult trap pickup', 'Public service request'].map(
							(record, index) => (
								<TableRow key={record}>
									<TableCell>{record}</TableCell>
									<TableCell>
										<Badge tone={index === 0 ? 'warning' : 'success'} variant="outline">
											{index === 0 ? 'Review' : 'Ready'}
										</Badge>
									</TableCell>
									<TableCell>{index === 2 ? 'Unassigned' : 'Field team A'}</TableCell>
									<TableCell className="text-right">{12 + index * 9}</TableCell>
								</TableRow>
							),
						)}
					</TableBody>
				</Table>
				<div className="skeleton-row">
					<Skeleton className="h-10 w-10 rounded-md" />
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-28" />
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Forms</p>
						<h2>Date Picker</h2>
					</div>
					<p>
						Three screens in one popover. The month and the year in the caption are each a button
						into a grid of their own, and a bound greys out the months and years it puts out of
						reach.
					</p>
				</div>
				<div className="component-grid dense">
					<DatePickerSample label="Unbounded" />
					<DatePickerSample label="No later than today" max={new Date()} />
					<DatePickerSample label="This year only" max={endOfThisYear()} min={startOfThisYear()} />
					<DatePickerSample disabled label="Disabled" />
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Charts</p>
						<h2>Chart Container</h2>
					</div>
					<p>
						The shadcn wrapper over Recharts, in the three forms the period-in-review pages draw: an
						area over days with a gap where nothing was recorded, a grouped bar of one year beside
						the year before, and one bar per year over the whole history. All three paint the chart
						roles and mark the picked period with a dashed line.
					</p>
				</div>
				<div className="component-grid cards">
					<Panel
						icon={<DropletIcon aria-hidden="true" className="size-4" />}
						title="Inspections by day"
					>
						<div className="px-3 pt-3 pb-2">
							<ChartContainer className="h-52 w-full" config={periodChartConfig}>
								<AreaChart data={dailyCounts} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
									<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
									<XAxis
										axisLine={false}
										dataKey="day"
										interval="preserveStartEnd"
										minTickGap={40}
										tickLine={false}
										tickMargin={6}
									/>
									<YAxis axisLine={false} tickLine={false} width={44} />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Area
										connectNulls={false}
										dataKey="period"
										fill="var(--color-period)"
										fillOpacity={0.1}
										isAnimationActive={false}
										stroke="var(--color-period)"
										strokeWidth={2}
										type="monotone"
									/>
									<ReferenceLine
										stroke="var(--foreground)"
										strokeDasharray="3 3"
										strokeOpacity={0.7}
										x="Day 45"
									/>
								</AreaChart>
							</ChartContainer>
						</div>
					</Panel>
					<Panel
						icon={<DropletIcon aria-hidden="true" className="size-4" />}
						title="Inspections by month, beside last year"
					>
						<div className="px-3 pt-3 pb-2">
							<ChartContainer className="h-52 w-full" config={periodChartConfig}>
								<BarChart
									barGap={2}
									data={monthlyCounts}
									margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
								>
									<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
									<XAxis axisLine={false} dataKey="month" tickLine={false} tickMargin={6} />
									<YAxis axisLine={false} tickLine={false} width={44} />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="period"
										fill="var(--color-period)"
										isAnimationActive={false}
										maxBarSize={24}
										radius={[4, 4, 0, 0]}
									/>
									<Bar
										dataKey="comparison"
										fill="var(--color-comparison)"
										isAnimationActive={false}
										maxBarSize={24}
										radius={[4, 4, 0, 0]}
									/>
									<ReferenceLine
										stroke="var(--foreground)"
										strokeDasharray="3 3"
										strokeOpacity={0.7}
										x="Sep"
									/>
								</BarChart>
							</ChartContainer>
						</div>
					</Panel>
					<Panel
						icon={<DropletIcon aria-hidden="true" className="size-4" />}
						title="Inspections by year"
					>
						<div className="px-3 pt-3 pb-2">
							<ChartContainer className="h-52 w-full" config={periodChartConfig}>
								<BarChart data={yearlyCounts} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
									<CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
									<XAxis
										axisLine={false}
										dataKey="year"
										interval="preserveStartEnd"
										minTickGap={24}
										tickLine={false}
										tickMargin={6}
									/>
									<YAxis axisLine={false} tickLine={false} width={44} />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="period"
										fill="var(--color-period)"
										isAnimationActive={false}
										maxBarSize={24}
										radius={[4, 4, 0, 0]}
									/>
									<ReferenceLine
										stroke="var(--foreground)"
										strokeDasharray="3 3"
										strokeOpacity={0.7}
										x="2026"
									/>
								</BarChart>
							</ChartContainer>
						</div>
					</Panel>
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Records</p>
						<h2>Panel Rows</h2>
					</div>
					<p>The four branches a child-record card draws, in the order it reads them.</p>
				</div>
				<div className="component-grid cards">
					{panelRowsStates.map((state) => (
						<Panel
							icon={<DropletIcon aria-hidden="true" className="size-4" />}
							key={state.label}
							title={state.label}
						>
							<div className="p-4">
								<PanelRows
									empty={{
										description: 'No specimens were collected during this inspection.',
										title: 'No Samples Recorded',
									}}
									icon={<DropletIcon aria-hidden="true" />}
									reading={state.reading}
									unavailable={{
										description: 'Sample records could not be loaded. Try again shortly.',
										title: 'Samples Unavailable',
									}}
								>
									{(rows) =>
										rows.map((row) => (
											<li
												className="rounded-md border border-border/40 bg-background/60 px-3 py-2.5 text-sm"
												key={row}
											>
												{row}
											</li>
										))
									}
								</PanelRows>
							</div>
						</Panel>
					))}
				</div>
			</section>
		</div>
	);
}

/**
 * One picker holding its own selection, so the drill-down can actually be
 * walked here rather than only looked at.
 */
function DatePickerSample({
	label,
	max,
	min,
	disabled = false,
}: {
	readonly label: string;
	readonly max?: Date;
	readonly min?: Date;
	readonly disabled?: boolean;
}) {
	const [value, setValue] = useState<Date | undefined>(undefined);
	return (
		<DatePicker
			ariaLabel={label}
			className="w-56"
			disabled={disabled}
			max={max}
			min={min}
			onChange={setValue}
			placeholder={label}
			value={value}
		/>
	);
}

function startOfThisYear(): Date {
	return new Date(new Date().getFullYear(), 0, 1);
}

function endOfThisYear(): Date {
	return new Date(new Date().getFullYear(), 11, 31);
}
