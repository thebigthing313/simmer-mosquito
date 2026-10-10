import {
	ADDRESS_MAP_FILTERS,
	BIOCONTROL_MAP_FILTERS,
	CHEMICAL_MAP_FILTERS,
	COLLECTION_MAP_FILTERS,
	encodeMapFilterParams,
	HABITAT_MAP_FILTERS,
	INSPECTION_MAP_FILTERS,
	type MapFilterKind,
	type MapFilterKinds,
	type MapFilterSpec,
	type MapFiltersOf,
	OUTREACH_MAP_FILTERS,
	REGION_MAP_FILTERS,
	SAMPLE_MAP_FILTERS,
	SERVICE_REQUEST_MAP_FILTERS,
	SERVICE_REQUEST_ORDER_FILTERS,
	SOURCE_REDUCTION_MAP_FILTERS,
	TRAP_MAP_FILTERS,
} from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import {
	parseAddressTileFilters,
	parseApplicationMapFilters,
	parseBiocontrolMapFilters,
	parseCollectionMapFilters,
	parseHabitatTileFilters,
	parseInspectionTileFilters,
	parseOutreachMapFilters,
	parseRegionTileFilters,
	parseSampleTileFilters,
	parseServiceRequestMapFilters,
	parseSourceReductionMapFilters,
	parseTrapMapFilters,
} from '../../map-tiles.js';

/**
 * The web encodes every `/map/*` tile, extent and list request with
 * `encodeMapFilterParams` over a spec, and the server parses it with a parser
 * built from the same spec (#1420). This drives each pair end to end: a filter
 * object goes out as wire params and has to come back unchanged.
 */

type Parser = (searchParams: URLSearchParams) => unknown;

/** A filter object built off a spec at runtime, which no spec type describes. */
type Filters = Readonly<Record<string, unknown>>;

function encode(spec: MapFilterSpec, filters: Filters): Readonly<Record<string, string>> {
	return encodeMapFilterParams(spec, filters as MapFiltersOf<MapFilterSpec>);
}

const SPECS: readonly (readonly [string, MapFilterSpec, Parser])[] = [
	['habitats', HABITAT_MAP_FILTERS, parseHabitatTileFilters],
	['addresses', ADDRESS_MAP_FILTERS, parseAddressTileFilters],
	['regions', REGION_MAP_FILTERS, parseRegionTileFilters],
	['inspections', INSPECTION_MAP_FILTERS, parseInspectionTileFilters],
	['samples', SAMPLE_MAP_FILTERS, parseSampleTileFilters],
	['chemical', CHEMICAL_MAP_FILTERS, parseApplicationMapFilters],
	['source-reduction', SOURCE_REDUCTION_MAP_FILTERS, parseSourceReductionMapFilters],
	['biocontrol', BIOCONTROL_MAP_FILTERS, parseBiocontrolMapFilters],
	['outreach', OUTREACH_MAP_FILTERS, parseOutreachMapFilters],
	['traps', TRAP_MAP_FILTERS, parseTrapMapFilters],
	['collections', COLLECTION_MAP_FILTERS, parseCollectionMapFilters],
	[
		'service-requests',
		[...SERVICE_REQUEST_MAP_FILTERS, ...SERVICE_REQUEST_ORDER_FILTERS],
		parseServiceRequestMapFilters,
	],
];

// Sorted, because the encoder sorts a list and the parser keeps wire order.
const IDS = ['0b6f5a8e-2a54-4c1f-9d55-6c0f1d3c2a10', '7e2d9c41-58a3-4b0e-8f6a-3d9e1b7c4f22'];

/**
 * Two values per kind that survive the trip, the second picking the other
 * answer wherever a kind has two, so both polarities of a boolean go out and
 * back. `trueOnly` has one answer that reaches the reader, so both are true.
 */
const SAMPLE_VALUES: {
	readonly [TKind in MapFilterKind]: readonly [MapFilterKinds[TKind], MapFilterKinds[TKind]];
} = {
	boolean: [true, false],
	trueOnly: [true, true],
	uuidList: [IDS, [IDS[0] as string]],
	text: ['pond', 'unfiled'],
	date: ['2026-04-01', '2026-12-31'],
	density: [['heavy', 'light'], ['very_heavy']],
	sampleStatus: ['awaiting', 'zero_larvae'],
	trapStatus: [true, false],
	requestStatus: [true, false],
};

function everyField(spec: MapFilterSpec, flip: boolean): Filters {
	return Object.fromEntries(
		spec.map((field) => [field.as ?? field.param, SAMPLE_VALUES[field.kind][flip ? 1 : 0]]),
	);
}

function roundTrip(spec: MapFilterSpec, parse: Parser, filters: Filters) {
	return parse(new URLSearchParams(encode(spec, filters)));
}

describe.each(SPECS)('the %s filter spec', (_name, spec, parse) => {
	it('carries every field out and back', () => {
		const filters = everyField(spec, false);

		expect(Object.keys(filters)).toHaveLength(spec.length);
		expect(roundTrip(spec, parse, filters)).toEqual({ ok: true, filters });
	});

	it('carries the other answer of every field out and back', () => {
		const filters = everyField(spec, true);

		expect(roundTrip(spec, parse, filters)).toEqual({ ok: true, filters });
	});

	it('encodes no filters to no params, which is the rail\'s "none"', () => {
		expect(encode(spec, {})).toEqual({});
		expect(roundTrip(spec, parse, {})).toEqual({ ok: true, filters: {} });
	});

	it('sends nothing for an empty list or a blank string', () => {
		const empties = Object.fromEntries(
			spec.flatMap((field): [string, unknown][] =>
				field.kind === 'uuidList' || field.kind === 'density'
					? [[field.as ?? field.param, []]]
					: field.kind === 'text' || field.kind === 'date'
						? [[field.as ?? field.param, '  ']]
						: [],
			),
		);

		expect(encode(spec, empties)).toEqual({});
	});
});
