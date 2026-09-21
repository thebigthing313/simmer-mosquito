/**
 * PROTOTYPE. Static data for the period-in-review page prototype (#1201).
 * Nothing here reads a database; every number is generated from a seeded
 * curve so the three grains agree with each other and the page can be
 * reacted to. Throw away with the branch.
 */

export type Grain = 'day' | 'month' | 'year';

export type TypeKey =
	| 'inspections'
	| 'samples'
	| 'collections'
	| 'applications'
	| 'sourceReductions'
	| 'releases'
	| 'serviceRequests'
	| 'outreachActions';

export type RatioKey = 'positiveInspections' | 'mosquitoesPerCollection';

export const CURRENT_YEAR = 2026;
export const CURRENT_MONTH = 9;
export const CURRENT_DAY = 21;

export interface TypeSpec {
	readonly key: TypeKey;
	readonly label: string;
	/** Explorer path the count links to. */
	readonly explorer: string;
	/** First year with records; `null` means never recorded (hidden). */
	readonly firstYear: number | null;
	/** Mean records per day at the season's peak. */
	readonly peak: number;
	/** Mean records per day off season. */
	readonly floor: number;
}

export const TYPES: readonly TypeSpec[] = [
	{
		key: 'inspections',
		label: 'Inspections',
		explorer: '/larval-surveillance/inspections',
		firstYear: 2011,
		peak: 140,
		floor: 12,
	},
	{
		key: 'samples',
		label: 'Samples',
		explorer: '/larval-surveillance/samples',
		firstYear: 2011,
		peak: 22,
		floor: 1,
	},
	{
		key: 'collections',
		label: 'Collections',
		explorer: '/adult-surveillance/collections',
		firstYear: 2002,
		peak: 38,
		floor: 0,
	},
	{
		key: 'applications',
		label: 'Applications',
		explorer: '/control-operations/chemical',
		firstYear: 2011,
		peak: 90,
		floor: 4,
	},
	{
		key: 'sourceReductions',
		label: 'Source reductions',
		explorer: '/control-operations/source-reduction',
		firstYear: 2014,
		peak: 9,
		floor: 0.5,
	},
	{
		key: 'releases',
		label: 'Releases',
		explorer: '/control-operations/biocontrol',
		firstYear: null,
		peak: 0,
		floor: 0,
	},
	{
		key: 'serviceRequests',
		label: 'Service requests received',
		explorer: '/public-engagement/service-requests',
		firstYear: 1990,
		peak: 30,
		floor: 3,
	},
	{
		key: 'outreachActions',
		label: 'Outreach actions',
		explorer: '/public-engagement/outreach',
		firstYear: 2026,
		peak: 0.6,
		floor: 0,
	},
];

export const SHOWN_TYPES = TYPES.filter((type) => type.firstYear !== null);

// --- the generator -----------------------------------------------------------

function hash(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i += 1) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) / 4294967296;
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayOfYear(year: number, month: number, day: number): number {
	const start = Date.UTC(year, 0, 1);
	const at = Date.UTC(year, month - 1, day);
	return Math.round((at - start) / 86400000) + 1;
}

const DAY_CACHE = new Map<string, number>();

/** Records of one type on one calendar day. Deterministic, memoised. */
export function dayCount(type: TypeSpec, year: number, month: number, day: number): number {
	const key = `${type.key}:${year}:${month}:${day}`;
	const hit = DAY_CACHE.get(key);
	if (hit !== undefined) return hit;
	const value = computeDayCount(type, year, month, day);
	DAY_CACHE.set(key, value);
	return value;
}

function computeDayCount(type: TypeSpec, year: number, month: number, day: number): number {
	if (type.firstYear === null || year < type.firstYear) {
		return 0;
	}
	// Outreach is September-quiet on purpose: the zero-in-period case.
	if (type.key === 'outreachActions' && month === 9) {
		return 0;
	}
	const doy = dayOfYear(year, month, day);
	// Season peaks around day 215 (early August), a cosine hump.
	const season = 0.5 - 0.5 * Math.cos(((doy - 30) / 365) * Math.PI * 2);
	const yearDrift = 1 + ((year - 2018) % 5) * 0.06;
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	const weekend = weekday === 0 || weekday === 6 ? 0.25 : 1;
	const noise = 0.6 + hash(`${type.key}:${year}:${doy}`) * 0.8;
	const mean = (type.floor + (type.peak - type.floor) * season ** 2) * yearDrift * weekend;
	return Math.round(mean * noise);
}

export function monthCount(
	type: TypeSpec,
	year: number,
	month: number,
	throughDay?: number,
): number {
	const last = Math.min(throughDay ?? 31, daysInMonth(year, month));
	let total = 0;
	for (let day = 1; day <= last; day += 1) {
		total += dayCount(type, year, month, day);
	}
	return total;
}

export function yearCount(
	type: TypeSpec,
	year: number,
	through?: { month: number; day: number },
): number {
	let total = 0;
	const lastMonth = through?.month ?? 12;
	for (let month = 1; month <= lastMonth; month += 1) {
		const cut = through !== undefined && month === lastMonth ? through.day : undefined;
		total += monthCount(type, year, month, cut);
	}
	return total;
}

/** Positive inspections as a share of inspections on a day. */
function positiveShare(year: number, doy: number): number {
	const season = 0.5 - 0.5 * Math.cos(((doy - 30) / 365) * Math.PI * 2);
	return 0.12 + 0.3 * season + (hash(`pos:${year}:${doy}`) - 0.5) * 0.08;
}

/** Mosquitoes per collection on a day. */
function mosquitoesPer(year: number, doy: number): number {
	const season = 0.5 - 0.5 * Math.cos(((doy - 45) / 365) * Math.PI * 2);
	return 2 + 28 * season ** 1.5 + (hash(`mpc:${year}:${doy}`) - 0.5) * 6;
}

export interface RatioSums {
	readonly numerator: number;
	readonly denominator: number;
}

const INSPECTIONS = TYPES[0] as TypeSpec;
const COLLECTIONS = TYPES[2] as TypeSpec;

const RATIO_CACHE = new Map<string, RatioSums>();

export function ratioDay(ratio: RatioKey, year: number, month: number, day: number): RatioSums {
	const key = `${ratio}:${year}:${month}:${day}`;
	const hit = RATIO_CACHE.get(key);
	if (hit !== undefined) return hit;
	const value = computeRatioDay(ratio, year, month, day);
	RATIO_CACHE.set(key, value);
	return value;
}

function computeRatioDay(ratio: RatioKey, year: number, month: number, day: number): RatioSums {
	const doy = dayOfYear(year, month, day);
	if (ratio === 'positiveInspections') {
		const denominator = dayCount(INSPECTIONS, year, month, day);
		return { numerator: Math.round(denominator * positiveShare(year, doy)), denominator };
	}
	const collections = dayCount(COLLECTIONS, year, month, day);
	// Roughly 8% of collections have a problem and come out of both sides.
	const denominator = Math.round(collections * 0.92);
	return { numerator: Math.round(denominator * mosquitoesPer(year, doy)), denominator };
}

function addSums(a: RatioSums, b: RatioSums): RatioSums {
	return { numerator: a.numerator + b.numerator, denominator: a.denominator + b.denominator };
}

export function ratioMonth(ratio: RatioKey, year: number, month: number, throughDay?: number) {
	const last = Math.min(throughDay ?? 31, daysInMonth(year, month));
	let sums: RatioSums = { numerator: 0, denominator: 0 };
	for (let day = 1; day <= last; day += 1) {
		sums = addSums(sums, ratioDay(ratio, year, month, day));
	}
	return sums;
}

export function ratioYear(ratio: RatioKey, year: number, through?: { month: number; day: number }) {
	let sums: RatioSums = { numerator: 0, denominator: 0 };
	const lastMonth = through?.month ?? 12;
	for (let month = 1; month <= lastMonth; month += 1) {
		const cut = through !== undefined && month === lastMonth ? through.day : undefined;
		sums = addSums(sums, ratioMonth(ratio, year, month, cut));
	}
	return sums;
}

// --- the columns -------------------------------------------------------------

/** One cell of the comparison table. `null` is the absence glyph. */
export type Cell = number | null;

export interface RatioCell {
	readonly value: number | null;
	readonly beside: number;
}

export interface Column {
	readonly key: string;
	readonly header: string;
}

export interface Period {
	readonly grain: Grain;
	readonly year: number;
	readonly month: number;
	readonly day: number;
}

export function currentPeriod(grain: Grain): Period {
	return { grain, year: CURRENT_YEAR, month: CURRENT_MONTH, day: CURRENT_DAY };
}

export function isCurrent(period: Period): boolean {
	if (period.year !== CURRENT_YEAR) return false;
	if (period.grain === 'year') return true;
	if (period.month !== CURRENT_MONTH) return false;
	if (period.grain === 'month') return true;
	return period.day === CURRENT_DAY;
}

export function isPartial(period: Period): boolean {
	if (period.grain === 'day') return false;
	return isCurrent(period);
}

const MONTH_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];
export const MONTH_LONG = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

export function monthShort(month: number): string {
	return MONTH_SHORT[month - 1] ?? '';
}

export function periodLabel(period: Period): string {
	if (period.grain === 'day') {
		return `${monthShort(period.month)} ${period.day}, ${period.year}`;
	}
	if (period.grain === 'month') {
		return `${monthShort(period.month)} ${period.year}`;
	}
	return String(period.year);
}

export function periodLongLabel(period: Period): string {
	if (period.grain === 'day') {
		const weekday = new Date(Date.UTC(period.year, period.month - 1, period.day)).getUTCDay();
		const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		return `${names[weekday]}, ${MONTH_LONG[period.month - 1]} ${period.day}, ${period.year}`;
	}
	if (period.grain === 'month') {
		return `${MONTH_LONG[period.month - 1]} ${period.year}`;
	}
	return String(period.year);
}

/** The cut caption, or `null` when the period is complete. */
export function partialCaption(period: Period): string | null {
	if (!isPartial(period)) return null;
	if (period.grain === 'month') return `Each period through the ${ordinal(CURRENT_DAY)}`;
	return `Each period through ${monthShort(CURRENT_MONTH)} ${CURRENT_DAY}`;
}

function ordinal(n: number): string {
	const rem = n % 100;
	if (rem >= 11 && rem <= 13) return `${n}th`;
	const last = n % 10;
	const suffix = last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
	return `${n}${suffix}`;
}

export function stepPeriod(period: Period, by: 1 | -1): Period {
	if (period.grain === 'day') {
		const at = new Date(Date.UTC(period.year, period.month - 1, period.day + by));
		return {
			grain: 'day',
			year: at.getUTCFullYear(),
			month: at.getUTCMonth() + 1,
			day: at.getUTCDate(),
		};
	}
	if (period.grain === 'month') {
		const index = period.year * 12 + (period.month - 1) + by;
		return { ...period, year: Math.floor(index / 12), month: (index % 12) + 1 };
	}
	return { ...period, year: period.year + by };
}

/** The cut a comparison period gets, when the shown period is partial. */
function cutFor(period: Period, comparison: Period): { month: number; day: number } | undefined {
	if (!isPartial(period)) return undefined;
	if (period.grain === 'month') {
		return {
			month: comparison.month,
			day: Math.min(CURRENT_DAY, daysInMonth(comparison.year, comparison.month)),
		};
	}
	return { month: CURRENT_MONTH, day: CURRENT_DAY };
}

function countFor(
	type: TypeSpec,
	at: Period,
	cut: { month: number; day: number } | undefined,
): number {
	if (at.grain === 'day') return dayCount(type, at.year, at.month, at.day);
	if (at.grain === 'month') return monthCount(type, at.year, at.month, cut?.day);
	return yearCount(type, at.year, cut);
}

function sumsFor(
	ratio: RatioKey,
	at: Period,
	cut: { month: number; day: number } | undefined,
): RatioSums {
	if (at.grain === 'day') return ratioDay(ratio, at.year, at.month, at.day);
	if (at.grain === 'month') return ratioMonth(ratio, at.year, at.month, cut?.day);
	return ratioYear(ratio, at.year, cut);
}

function qualifyingYears(type: TypeSpec, period: Period): number[] {
	const years: number[] = [];
	for (let year = period.year - 5; year < period.year; year += 1) {
		if (yearCount(type, year) > 0) years.push(year);
	}
	return years;
}

export interface TableModel {
	readonly columns: readonly Column[];
	readonly rows: readonly { readonly type: TypeSpec; readonly cells: readonly Cell[] }[];
	readonly ratios: readonly {
		readonly key: RatioKey;
		readonly label: string;
		readonly cells: readonly RatioCell[];
	}[];
	readonly caption: string | null;
}

export const RATIO_LABELS: Record<RatioKey, string> = {
	positiveInspections: 'Positive inspections',
	mosquitoesPerCollection: 'Mosquitoes per collection',
};

const RATIO_DENOMINATOR: Record<RatioKey, TypeSpec> = {
	positiveInspections: INSPECTIONS,
	mosquitoesPerCollection: COLLECTIONS,
};

export function tableFor(period: Period): TableModel {
	const previous = stepPeriod(period, -1);
	const lastYear: Period = { ...period, year: period.year - 1 };
	const comparisons: Period[] = period.grain === 'year' ? [previous] : [previous, lastYear];
	const averageYears = { from: period.year - 5, to: period.year - 1 };
	const columns: Column[] = [
		{ key: 'period', header: periodLabel(period) },
		...comparisons.map((at) => ({ key: periodLabel(at), header: periodLabel(at) })),
		{ key: 'average', header: `${averageYears.from}–${averageYears.to} average` },
	];

	const rows = SHOWN_TYPES.map((type) => {
		const cells: Cell[] = [countFor(type, period, undefined)];
		for (const at of comparisons) {
			cells.push(countFor(type, at, cutFor(period, at)));
		}
		const years = qualifyingYears(type, period);
		if (years.length === 0) {
			cells.push(null);
		} else {
			let total = 0;
			for (const year of years) {
				const at: Period = { ...period, year };
				total += countFor(type, at, cutFor(period, at));
			}
			cells.push(Math.round(total / years.length));
		}
		return { type, cells };
	});

	const ratios = (['positiveInspections', 'mosquitoesPerCollection'] as const).map((key) => {
		const toCell = (sums: RatioSums): RatioCell => ({
			value: sums.denominator === 0 ? null : sums.numerator / sums.denominator,
			beside: sums.numerator,
		});
		const cells: RatioCell[] = [toCell(sumsFor(key, period, undefined))];
		for (const at of comparisons) {
			cells.push(toCell(sumsFor(key, at, cutFor(period, at))));
		}
		const years = qualifyingYears(RATIO_DENOMINATOR[key], period);
		let pooled: RatioSums = { numerator: 0, denominator: 0 };
		for (const year of years) {
			const at: Period = { ...period, year };
			pooled = addSums(pooled, sumsFor(key, at, cutFor(period, at)));
		}
		cells.push(toCell(pooled));
		return { key, label: RATIO_LABELS[key], cells };
	});

	return { columns, rows, ratios, caption: partialCaption(period) };
}

// --- the chart series --------------------------------------------------------

export interface DayPoint {
	readonly date: string;
	readonly label: string;
	readonly value: number;
	readonly isCurrent: boolean;
}

export interface MonthPoint {
	readonly month: number;
	readonly label: string;
	readonly period: number;
	readonly lastYear: number;
	readonly isCurrent: boolean;
	/** `false` for a month after the shown one in a partial year. */
	readonly reached: boolean;
}

export interface YearPoint {
	readonly year: number;
	readonly label: string;
	readonly value: number;
	readonly isCurrent: boolean;
}

export function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** The year's days to the shown day, one value per day. */
export function daySeries(
	period: Period,
	valueAt: (year: number, month: number, day: number) => number,
): DayPoint[] {
	const points: DayPoint[] = [];
	const lastMonth = period.year === CURRENT_YEAR ? period.month : 12;
	for (let month = 1; month <= lastMonth; month += 1) {
		const last =
			period.year === CURRENT_YEAR && month === period.month
				? period.day
				: daysInMonth(period.year, month);
		for (let day = 1; day <= last; day += 1) {
			points.push({
				date: `${period.year}-${pad(month)}-${pad(day)}`,
				label: `${monthShort(month)} ${day}`,
				value: valueAt(period.year, month, day),
				isCurrent: month === period.month && day === period.day,
			});
		}
	}
	return points;
}

/** Twelve months of the period's year beside the year before. */
export function monthSeries(
	period: Period,
	valueAt: (year: number, month: number) => number,
): MonthPoint[] {
	const partialYear = period.year === CURRENT_YEAR;
	return Array.from({ length: 12 }, (_, i) => {
		const month = i + 1;
		const reached = !partialYear || month <= CURRENT_MONTH;
		return {
			month,
			label: monthShort(month),
			period: reached ? valueAt(period.year, month) : 0,
			lastYear: valueAt(period.year - 1, month),
			isCurrent: month === period.month,
			reached,
		};
	});
}

/** Every year from the type's first to the current one. */
export function yearSeries(
	period: Period,
	firstYear: number,
	valueAt: (year: number) => number,
): YearPoint[] {
	const points: YearPoint[] = [];
	for (let year = firstYear; year <= CURRENT_YEAR; year += 1) {
		points.push({
			year,
			label: String(year),
			value: valueAt(year),
			isCurrent: year === period.year,
		});
	}
	return points;
}

export interface Series {
	readonly days: DayPoint[];
	readonly months: MonthPoint[];
	readonly years: YearPoint[];
}

export function typeSeries(type: TypeSpec, period: Period): Series {
	return {
		days: daySeries(period, (y, m, d) => dayCount(type, y, m, d)),
		months: monthSeries(period, (y, m) => monthCount(type, y, m)),
		years: yearSeries(period, type.firstYear ?? CURRENT_YEAR, (y) => yearCount(type, y)),
	};
}

function ratioValue(sums: RatioSums): number {
	return sums.denominator === 0 ? 0 : sums.numerator / sums.denominator;
}

export function ratioSeries(key: RatioKey, period: Period): Series {
	const firstYear = RATIO_DENOMINATOR[key].firstYear ?? CURRENT_YEAR;
	return {
		days: daySeries(period, (y, m, d) => ratioValue(ratioDay(key, y, m, d))),
		months: monthSeries(period, (y, m) => ratioValue(ratioMonth(key, y, m))),
		years: yearSeries(period, firstYear, (y) => ratioValue(ratioYear(key, y))),
	};
}

/** The earliest period across the shown types. */
export const EARLIEST_YEAR = Math.min(...SHOWN_TYPES.map((t) => t.firstYear ?? CURRENT_YEAR));

export function firstDayOf(period: Period): string {
	if (period.grain === 'day') return `${period.year}-${pad(period.month)}-${pad(period.day)}`;
	if (period.grain === 'month') return `${period.year}-${pad(period.month)}-01`;
	return `${period.year}-01-01`;
}

export function lastDayOf(period: Period): string {
	if (period.grain === 'day') return firstDayOf(period);
	if (period.grain === 'month') {
		return `${period.year}-${pad(period.month)}-${pad(daysInMonth(period.year, period.month))}`;
	}
	return `${period.year}-12-31`;
}

export function formatRatio(key: RatioKey, value: number): string {
	if (key === 'positiveInspections') return `${Math.round(value * 100)}%`;
	return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** A short label for a ratio's axis and tooltip. */
export function formatRatioTick(key: RatioKey, value: number): string {
	if (key === 'positiveInspections') return `${Math.round(value * 100)}%`;
	return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
