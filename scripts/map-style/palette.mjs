/**
 * Basemap palettes for the SIMMER Mapbox styles.
 *
 * This is the map-room equivalent of `packages/design-tokens/src/map-palette.ts`,
 * and it exists for the same reason: Mapbox GL paint properties are evaluated by
 * the GL renderer, not the CSS cascade, so they cannot read custom properties and
 * must be literals. That constraint is unavoidable. Four hand-maintained copies of
 * one basemap is not — so every colour the basemap paints with is named once here,
 * and the four style variants are the same layer graph resolved against four
 * palettes.
 *
 * The governing constraint on all four: **the basemap loses the colour fight.**
 * `map-palette.ts` already spends blue (#2d46b6), green (#5a9e2f), teal (#2f9e8f),
 * purple (#7c5cbf), magenta (#c4569e), amber (#f59e0b), and a six-step cool-to-hot
 * density ramp on data marks. Anything the basemap paints has to stay clear of all
 * of them. That is why water here is a desaturated slate (#c3d2d6) rather than a
 * cartographic blue — a Streets-style water fill sits close enough to
 * `mapDomain.address` that an address pin over a pond stops reading.
 *
 * The Map-Room Neutral Rule applies to the map itself: no pure white, no pure
 * black, everything tinted toward green and blue. Note `roadFill` is #fcfefd and
 * not #ffffff for exactly this reason.
 */

/**
 * Day. The primary basemap, replacing `mapbox://styles/mapbox/streets-v12`.
 *
 * Quiet tinted neutral: near-monochrome greys carried toward the blue-green end,
 * with water as the one element allowed real tonal weight because water is the
 * one basemap feature that is operationally load-bearing rather than context.
 */
const day = {
	/** Land, and the background behind every tile. */
	ground: '#eef1ee',
	/** Urban fabric — residential, commercial, industrial. */
	groundAlt: '#e4e9e6',
	/** Open managed ground — grass, agriculture, pitches. */
	groundQuiet: '#eaeee9',
	park: '#dde5dd',
	/** Wood and national park: the deep end of the vegetated ramp. */
	parkDeep: '#d4dfd4',
	sand: '#efeee4',
	rock: '#e7e9e6',
	glacier: '#f2f6f6',

	/**
	 * Open water. Deliberately desaturated and pulled toward slate: a saturated
	 * cartographic blue here would collide with `mapDomain.address`/`region`.
	 */
	water: '#c3d2d6',
	waterEdge: '#adc0c6',
	/**
	 * Vegetated wetland, leaning green so it separates from open water at a
	 * glance. Marsh and swamp are breeding sites; a flat lake-blue would bury
	 * them inside "water".
	 */
	wetland: '#cfdad2',
	/** Unvegetated wetland — seasonally flooded bare ground. Leans water-ward. */
	wetlandNoveg: '#c6d3d7',
	wetlandEdge: '#9fb3ad',
	/** Rivers. */
	waterwayMajor: '#a8bdc3',
	/** Streams, canals, drains, ditches — where larval habitat actually lives. */
	waterwayMinor: '#b4c6cb',
	/** The casing that keeps a 1px ditch legible over land cover. */
	waterwayCasing: '#e8edea',

	building: '#e0e5e1',
	buildingEdge: '#cdd5cf',

	/**
	 * Roads carry hierarchy through width and casing weight, never hue. A quiet
	 * base cannot afford the warm motorway tints Streets uses, and width alone
	 * turns out to be enough once the casings are graded.
	 */
	roadFill: '#fcfefd',
	roadMinorFill: '#f7faf8',
	roadCasing: '#d8ded9',
	roadCasingMajor: '#c6cec8',
	pathLine: '#c2ccc5',

	/**
	 * Admin boundaries, drawn as clearly subordinate greys. A SIMMER Region is
	 * 2px solid #2d46b6 with a fill wash; nothing here can be mistaken for one.
	 */
	adminCountry: '#7e8d8b',
	adminState: '#8d9c9a',
	adminCounty: '#9aa8a6',

	label: '#3d4a48',
	labelMuted: '#5c6b68',
	/** Water names run bluer than land names so they read as water, not place. */
	labelWater: '#6b8189',
	labelAdmin: '#6e7d7b',
	labelHalo: '#f4f7f5',
	/** The uniform civic POI dot. One tone; the label says which kind. */
	poiDot: '#8fa09b',

	hillshadeShadow: '#7d8f8a',
	hillshadeHighlight: '#fbfdfc',
};

/**
 * Dusk. Dimmed slate for tablets in a truck cab at dawn and dusk trap runs —
 * dark enough to stop blowing out night vision, light enough that the existing
 * `map-palette` marks still read without re-tuning every hue.
 *
 * Deliberately not near-black. See README: `mapDomain.address` (#2d46b6) and
 * `mapDomain.chemical` (#7c5cbf) are the two marks that weaken here, and the
 * lift values they need are documented there rather than guessed at.
 */
const dusk = {
	ground: '#2a3335',
	groundAlt: '#222a2c',
	groundQuiet: '#273032',
	park: '#24302e',
	parkDeep: '#1f2b29',
	sand: '#2f342f',
	rock: '#2b3133',
	glacier: '#39474a',

	water: '#16242b',
	waterEdge: '#243a43',
	wetland: '#1c2b2a',
	wetlandNoveg: '#182730',
	wetlandEdge: '#38504e',
	waterwayMajor: '#2c4753',
	waterwayMinor: '#243b45',
	waterwayCasing: '#1c2427',

	building: '#313b3d',
	buildingEdge: '#3b4749',

	roadFill: '#4d5c5d',
	roadMinorFill: '#414f50',
	roadCasing: '#3d4a4b',
	roadCasingMajor: '#48585a',
	pathLine: '#4a5859',

	adminCountry: '#6a7b7d',
	adminState: '#5d6d6f',
	adminCounty: '#526163',

	label: '#c3ceca',
	labelMuted: '#97a5a2',
	labelWater: '#8fabb4',
	labelAdmin: '#8b9a98',
	labelHalo: '#131b1d',
	poiDot: '#78888a',

	hillshadeShadow: '#0d1315',
	hillshadeHighlight: '#43514f',
};

/**
 * Print. Letter-size PDF for board packets and public notices, rendered through
 * the Static Images API at roughly 150dpi.
 *
 * Everything is tuned for a map that gets downsampled and possibly photocopied:
 * line weights are scaled up by the generator, labels are near-black, water is
 * carried darker so it survives losing its colour, and hillshade is dropped
 * entirely because a soft tonal wash turns to mud on paper.
 */
const print = {
	ground: '#f7f8f6',
	groundAlt: '#ecefec',
	groundQuiet: '#f1f3f0',
	park: '#e2e9e1',
	parkDeep: '#d6e0d5',
	sand: '#f2f0e6',
	rock: '#eceeeb',
	glacier: '#f6f9f9',

	water: '#b9ccd2',
	waterEdge: '#7d97a0',
	wetland: '#cbd8ce',
	wetlandNoveg: '#bfced4',
	wetlandEdge: '#7d938d',
	waterwayMajor: '#7d97a0',
	waterwayMinor: '#92a9b0',
	waterwayCasing: '#f7faf8',

	building: '#e6eae6',
	buildingEdge: '#b3bdb6',

	roadFill: '#fdfffe',
	roadMinorFill: '#f9fbfa',
	roadCasing: '#a9b3ad',
	roadCasingMajor: '#8e9a93',
	pathLine: '#9aa69f',

	adminCountry: '#4f5c5a',
	adminState: '#63706e',
	adminCounty: '#77837f',

	label: '#232e2c',
	labelMuted: '#414f4c',
	labelWater: '#3e5a63',
	labelAdmin: '#4a5755',
	labelHalo: '#fafcfa',
	poiDot: '#6b7a75',

	hillshadeShadow: '#7d8f8a',
	hillshadeHighlight: '#fbfdfc',
};

/**
 * Hybrid. SIMMER cartography over Mapbox satellite imagery.
 *
 * Only the overlay roles carry values here — imagery supplies land cover, so the
 * ground/park/building entries are never painted. The contrast runs the other
 * way from every other variant: labels are near-white over a dark halo, and road
 * casings go dark so a light road fill reads over bright imagery.
 *
 * `waterEdge` is the load-bearing one. Imagery renders water as a dark, mushy
 * region under tree canopy; a crisp edge is what makes a pond's boundary
 * legible. It sits at a pale cyan that none of the domain marks occupy — the
 * nearest is `mapDensity.none` (#3f93bf), which is far darker and far more
 * saturated.
 */
const hybrid = {
	...day,
	water: 'rgba(0, 0, 0, 0)',
	waterEdge: '#a8ccd6',
	wetland: 'rgba(0, 0, 0, 0)',
	wetlandNoveg: 'rgba(0, 0, 0, 0)',
	wetlandEdge: '#9dc4b6',
	waterwayMajor: '#a8ccd6',
	waterwayMinor: '#93bac6',
	waterwayCasing: 'rgba(20, 30, 32, 0.45)',

	roadFill: '#f2f5f3',
	roadMinorFill: '#dfe6e2',
	roadCasing: 'rgba(22, 30, 32, 0.55)',
	roadCasingMajor: 'rgba(18, 25, 27, 0.7)',
	pathLine: '#cdd8d2',

	adminCountry: '#c9d3d1',
	adminState: '#bfcac8',
	adminCounty: '#b9c4c2',

	label: '#f6f9f7',
	labelMuted: '#dae3e0',
	labelWater: '#cfe6ee',
	labelAdmin: '#c9d4d1',
	labelHalo: '#17211f',
	poiDot: '#dae3e0',
};

/**
 * The four variants. `weight` scales every line width the generator emits, and
 * the boolean flags decide which layer groups are built at all — see `layers.mjs`.
 */
export const VARIANTS = [
	{
		id: 'simmer-day',
		name: 'SIMMER Day',
		palette: day,
		/** Imagery replaces the vector ground plane. */
		imagery: false,
		terrain: true,
		landcover: true,
		buildings: true,
		poiLandmarks: true,
		weight: 1,
	},
	{
		id: 'simmer-hybrid',
		name: 'SIMMER Hybrid',
		palette: hybrid,
		imagery: true,
		terrain: false,
		landcover: false,
		buildings: false,
		poiLandmarks: true,
		weight: 1,
	},
	{
		id: 'simmer-dusk',
		name: 'SIMMER Dusk',
		palette: dusk,
		imagery: false,
		terrain: true,
		landcover: true,
		buildings: true,
		poiLandmarks: true,
		weight: 1,
	},
	{
		id: 'simmer-print',
		name: 'SIMMER Print',
		palette: print,
		imagery: false,
		// Hillshade turns to mud at 150dpi and destroys greyscale legibility.
		terrain: false,
		landcover: true,
		buildings: true,
		// A board packet does not need gas stations.
		poiLandmarks: false,
		weight: 1.3,
	},
];
