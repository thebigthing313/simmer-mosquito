/**
 * The SIMMER basemap layer graph.
 *
 * One graph, resolved four times against four palettes (see `palette.mjs`). The
 * variant flags decide which groups are built at all; nothing here is copied per
 * style, so a cartographic decision is made once and reaches every surface.
 *
 * ## Zoom staging: water-first staged reveal
 *
 * All four feature groups (water, roads, buildings, land cover + terrain) are in
 * the style, but they are never all present at once — that is the only way a base
 * carrying this much information stays quiet enough for the data marks to win.
 *
 *   z3-8    water + wetland + admin + place labels. Land flat, no roads.
 *   z9-11   water + land cover; terrain fades in; major roads only.
 *   z12-14  water + full road network and names; land cover drops to a tint.
 *   z15+    water + roads + buildings; terrain and land cover off entirely.
 *
 * Water is the one group present at every zoom. It is not context — breeding
 * habitat is the job, so it holds tonal weight at the agency overview where
 * everything else has faded out.
 *
 * ## Known tileset limits (mapbox-streets-v8)
 *
 * The `water` source layer is a **single merged polygon per tile with no class
 * field**. Individual water bodies cannot be filtered, which means permanent vs
 * intermittent *ponds* is not expressible from this tileset at any price.
 * Intermittent water is therefore delivered where the data supports it:
 * `waterway` carries a real `stream_intermittent` class for linear water, and
 * `landuse_overlay` separates `wetland` from `wetland_noveg`. Seasonal ponds have
 * to come from SIMMER's own habitat geometry as a data layer.
 *
 * The `admin` layer tops out at `admin_level` 2, which is counties in the US.
 * Municipal boundaries are not in this tileset; "city limits" below county level
 * would need a separate uploaded tileset.
 */

/**
 * Both tilesets are composited into one source (see `build.mjs`), which is how
 * Mapbox's own styles do it: one tile request per zoom/xy instead of two, and no
 * source-layer collisions because streets-v8 and terrain-v2 share no layer names.
 */
const STREETS = 'composite';
const TERRAIN = 'composite';

/** Localised name, falling back to the untranslated one. */
const NAME = ['coalesce', ['get', 'name_en'], ['get', 'name']];

/**
 * The map's typographic voice: a condensed grotesque, deliberately separate from
 * the Poppins used across product chrome. Narrow enough that "West Kaweah
 * Drainage Canal" fits at 12px without collision, and hinted well enough to hold
 * at 10px over imagery.
 *
 * Note this is Roboto Condensed and not Barlow Semi Condensed: Mapbox's hosted
 * font catalogue carries plain Barlow only, and a fontstack naming a font Mapbox
 * does not serve falls back silently rather than erroring. Roboto Condensed is
 * the same register and is genuinely available. Arial Unicode MS is Mapbox's
 * universal fallback and covers scripts the primary face does not.
 */
const FONT = ['Roboto Condensed Regular', 'Arial Unicode MS Regular'];
const FONT_BOLD = ['Roboto Condensed Bold', 'Arial Unicode MS Bold'];
const FONT_LIGHT = ['Roboto Condensed Light', 'Arial Unicode MS Regular'];

/**
 * `maritime` and `disputed` are typed inconsistently across tileset versions —
 * boolean in some, the strings "true"/"false" in others. Comparing against a raw
 * boolean silently matches nothing on the string form, which shows up as coastal
 * admin lines drawn out to sea. Normalise to string and match both.
 */
function isFalsy(field) {
	return ['match', ['to-string', ['get', field]], ['true', '1'], false, true];
}

/** `interpolate` with the exponential base Mapbox uses for road widths. */
function width(stops, weight = 1) {
	const expr = ['interpolate', ['exponential', 1.5], ['zoom']];
	for (const [zoom, value] of stops) {
		expr.push(zoom, Math.round(value * weight * 100) / 100);
	}
	return expr;
}

/**
 * A casing is the fill width plus a gutter that grows with it. Deriving it here
 * rather than hand-writing a second stop table is what keeps a road's casing from
 * drifting out of proportion when its fill width is tuned.
 */
function casing(stops, weight = 1) {
	return width(
		stops.map(([zoom, value]) => [zoom, value + Math.max(0.6, value * 0.4)]),
		weight,
	);
}

/** Linear `interpolate` over zoom, for opacity ramps and text sizes. */
function ramp(stops) {
	const expr = ['interpolate', ['linear'], ['zoom']];
	for (const [zoom, value] of stops) {
		expr.push(zoom, value);
	}
	return expr;
}

/** The shared halo treatment. Solid, never alpha — see the Solid Indicator Rule. */
function halo(p, width_ = 1.2) {
	return {
		'text-halo-color': p.labelHalo,
		'text-halo-width': width_,
		'text-halo-blur': 0.2,
	};
}

/**
 * Road tiers, ordered as they are drawn. Width stops are per-tier so the
 * hierarchy is legible by weight alone — this base spends no hue on roads.
 */
const ROADS = [
	{
		id: 'motorway',
		classes: ['motorway', 'motorway_link'],
		minzoom: 8,
		major: true,
		stops: [
			[8, 0.5],
			[12, 2.5],
			[16, 9],
			[20, 34],
		],
	},
	{
		id: 'trunk',
		classes: ['trunk', 'trunk_link'],
		minzoom: 8,
		major: true,
		stops: [
			[8, 0.4],
			[12, 2.2],
			[16, 8],
			[20, 30],
		],
	},
	{
		id: 'primary',
		classes: ['primary', 'primary_link'],
		minzoom: 9,
		major: true,
		stops: [
			[9, 0.4],
			[12, 1.8],
			[16, 7],
			[20, 26],
		],
	},
	{
		id: 'secondary',
		classes: ['secondary', 'secondary_link'],
		minzoom: 10,
		major: false,
		stops: [
			[10, 0.4],
			[13, 1.6],
			[16, 6],
			[20, 22],
		],
	},
	{
		id: 'tertiary',
		classes: ['tertiary', 'tertiary_link'],
		minzoom: 11,
		major: false,
		stops: [
			[11, 0.4],
			[13, 1.2],
			[16, 5],
			[20, 18],
		],
	},
	{
		id: 'street',
		classes: ['street', 'street_limited'],
		minzoom: 12,
		major: false,
		stops: [
			[12, 0.4],
			[14, 1.2],
			[16, 4],
			[20, 16],
		],
	},
	{
		id: 'minor',
		classes: ['service', 'track'],
		minzoom: 13,
		major: false,
		stops: [
			[13, 0.3],
			[15, 1],
			[16, 2.4],
			[20, 12],
		],
	},
];

const ROAD_CLASSES = ROADS.flatMap((tier) => tier.classes);

/** Surface roads only. Bridges and tunnels are drawn by their own layers. */
const SURFACE = ['match', ['get', 'structure'], ['none', 'ford'], true, false];

/** The flat wash everything else sits on, or the satellite raster in its place. */
function ground({ palette: p, imagery }) {
	const layers = [];

	layers.push({
		id: 'background',
		type: 'background',
		paint: { 'background-color': imagery ? '#0d1416' : p.ground },
	});

	if (imagery) {
		layers.push({
			id: 'satellite',
			type: 'raster',
			source: 'satellite',
			paint: { 'raster-opacity': 1, 'raster-fade-duration': 200 },
		});
	}

	return layers;
}

/**
 * Enters at z9, drops to a faint tint at z13, and is gone by z16 so it never
 * competes with buildings and data marks at working zoom.
 */
function landCover({ palette: p, landcover }) {
	const layers = [];

	if (landcover) {
		const coverOpacity = ramp([
			[8.5, 0],
			[10, 1],
			[13, 0.55],
			[15, 0.15],
			[16, 0],
		]);

		layers.push({
			id: 'landcover',
			type: 'fill',
			source: STREETS,
			'source-layer': 'landuse',
			minzoom: 8,
			filter: [
				'match',
				['get', 'class'],
				['wood', 'scrub', 'grass', 'agriculture', 'park', 'pitch', 'sand', 'rock', 'glacier'],
				true,
				false,
			],
			paint: {
				'fill-color': [
					'match',
					['get', 'class'],
					['wood'],
					p.parkDeep,
					['scrub', 'park', 'pitch'],
					p.park,
					['grass', 'agriculture'],
					p.groundQuiet,
					['sand'],
					p.sand,
					['rock'],
					p.rock,
					['glacier'],
					p.glacier,
					p.groundQuiet,
				],
				'fill-opacity': coverOpacity,
				'fill-antialias': true,
			},
		});

		layers.push({
			id: 'landuse-urban',
			type: 'fill',
			source: STREETS,
			'source-layer': 'landuse',
			minzoom: 9,
			filter: [
				'match',
				['get', 'class'],
				['residential', 'commercial_area', 'industrial', 'facility', 'airport', 'parking'],
				true,
				false,
			],
			paint: { 'fill-color': p.groundAlt, 'fill-opacity': coverOpacity },
		});

		layers.push({
			id: 'landuse-civic',
			type: 'fill',
			source: STREETS,
			'source-layer': 'landuse',
			minzoom: 11,
			filter: ['match', ['get', 'class'], ['school', 'hospital', 'cemetery'], true, false],
			paint: { 'fill-color': p.park, 'fill-opacity': coverOpacity },
		});

		layers.push({
			id: 'national-park',
			type: 'fill',
			source: STREETS,
			'source-layer': 'landuse_overlay',
			minzoom: 5,
			filter: ['==', ['get', 'class'], 'national_park'],
			paint: {
				'fill-color': p.parkDeep,
				'fill-opacity': ramp([
					[5, 0.5],
					[12, 0.35],
					[16, 0],
				]),
			},
		});
	}

	return layers;
}

/** Relief, peaking at z11 where it explains standing water. */
function terrainShade({ palette: p, terrain }) {
	const layers = [];

	if (terrain) {
		layers.push({
			id: 'hillshade',
			type: 'fill',
			source: TERRAIN,
			'source-layer': 'hillshade',
			minzoom: 9,
			maxzoom: 14,
			paint: {
				'fill-color': [
					'match',
					['get', 'class'],
					['shadow'],
					p.hillshadeShadow,
					p.hillshadeHighlight,
				],
				// Peaks at z11 where terrain explains standing water, then clears out
				// before buildings and dense marks arrive.
				'fill-opacity': [
					'interpolate',
					['linear'],
					['zoom'],
					9,
					0,
					11,
					['match', ['get', 'class'], ['shadow'], 0.1, 0.14],
					12.5,
					['match', ['get', 'class'], ['shadow'], 0.05, 0.07],
					14,
					0,
				],
				'fill-antialias': false,
			},
		});
	}

	return layers;
}

/**
 * The one group present at every zoom. Wetland is separated from open water
 * because marsh and swamp are breeding sites, and a flat lake-blue hides them.
 */
function water({ palette: p, weight: w, imagery }) {
	const layers = [];

	if (!imagery) {
		layers.push({
			id: 'wetland',
			type: 'fill',
			source: STREETS,
			'source-layer': 'landuse_overlay',
			filter: ['match', ['get', 'class'], ['wetland', 'wetland_noveg'], true, false],
			paint: {
				'fill-color': ['match', ['get', 'class'], ['wetland_noveg'], p.wetlandNoveg, p.wetland],
				'fill-opacity': ramp([
					[4, 0.7],
					[10, 0.9],
					[14, 1],
				]),
			},
		});
	}

	// A dashed edge is what actually separates wetland from open water at a
	// glance. Done with a line rather than `fill-pattern` on purpose: a pattern
	// needs a sprite image, which would tie every style to an uploaded asset.
	layers.push({
		id: 'wetland-edge',
		type: 'line',
		source: STREETS,
		'source-layer': 'landuse_overlay',
		minzoom: 9,
		filter: ['match', ['get', 'class'], ['wetland', 'wetland_noveg'], true, false],
		layout: { 'line-join': 'round' },
		paint: {
			'line-color': p.wetlandEdge,
			'line-width': width(
				[
					[9, 0.5],
					[14, 1],
					[18, 1.6],
				],
				w,
			),
			'line-dasharray': [3, 2],
			'line-opacity': ramp([
				[9, 0],
				[10, 0.7],
			]),
		},
	});

	if (!imagery) {
		layers.push({
			id: 'water',
			type: 'fill',
			source: STREETS,
			'source-layer': 'water',
			paint: { 'fill-color': p.water },
		});
	}

	// Over imagery this is the load-bearing layer: satellite renders water as a
	// dark mush under canopy, and a crisp edge is what makes a pond's boundary
	// readable. On the vector variants it does quieter work, giving flat water a
	// defined shoreline against land cover of a similar value.
	layers.push({
		id: 'water-edge',
		type: 'line',
		source: STREETS,
		'source-layer': 'water',
		minzoom: imagery ? 6 : 10,
		layout: { 'line-join': 'round' },
		paint: {
			'line-color': p.waterEdge,
			'line-width': width(
				imagery
					? [
							[6, 0.5],
							[12, 1.2],
							[18, 2.4],
						]
					: [
							[10, 0.4],
							[14, 0.8],
							[18, 1.4],
						],
				w,
			),
			'line-opacity': imagery ? 0.9 : 0.7,
		},
	});

	return layers;
}

/**
 * Streams, canals, drains, and ditches get a casing so a 1px line still reads
 * over land cover and imagery. Stock Streets loses these at mid zoom, which is
 * exactly where larval habitat lives.
 */
function waterways({ palette: p, weight: w, imagery }) {
	const layers = [];

	layers.push({
		id: 'waterway-casing',
		type: 'line',
		source: STREETS,
		'source-layer': 'waterway',
		minzoom: 11,
		filter: [
			'match',
			['get', 'class'],
			['river', 'canal', 'stream', 'drain', 'ditch'],
			true,
			false,
		],
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': p.waterwayCasing,
			'line-width': casing(
				[
					[11, 0.8],
					[14, 1.6],
					[18, 5],
				],
				w,
			),
			'line-opacity': ramp([
				[11, 0],
				[12, imagery ? 0.5 : 0.85],
			]),
		},
	});

	layers.push({
		id: 'waterway-river',
		type: 'line',
		source: STREETS,
		'source-layer': 'waterway',
		minzoom: 7,
		filter: ['match', ['get', 'class'], ['river'], true, false],
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': p.waterwayMajor,
			'line-width': width(
				[
					[7, 0.4],
					[12, 1.6],
					[16, 4],
					[20, 12],
				],
				w,
			),
			'line-opacity': ramp([
				[7, 0],
				[8, 1],
			]),
		},
	});

	layers.push({
		id: 'waterway-canal',
		type: 'line',
		source: STREETS,
		'source-layer': 'waterway',
		minzoom: 10,
		filter: ['match', ['get', 'class'], ['canal'], true, false],
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': p.waterwayMajor,
			'line-width': width(
				[
					[10, 0.4],
					[14, 1.4],
					[18, 4],
				],
				w,
			),
			'line-opacity': ramp([
				[10, 0],
				[11, 1],
			]),
		},
	});

	layers.push({
		id: 'waterway-minor',
		type: 'line',
		source: STREETS,
		'source-layer': 'waterway',
		minzoom: 11.5,
		filter: ['match', ['get', 'class'], ['stream'], true, false],
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': p.waterwayMinor,
			'line-width': width(
				[
					[11.5, 0.4],
					[14, 1],
					[18, 3],
				],
				w,
			),
			'line-opacity': ramp([
				[11.5, 0],
				[12.5, 1],
			]),
		},
	});

	// Ephemeral water, drawn dashed. A ditch that only holds water after rain is a
	// different operational object from a permanent one, and this is the only
	// place the tileset lets us say so.
	layers.push({
		id: 'waterway-intermittent',
		type: 'line',
		source: STREETS,
		'source-layer': 'waterway',
		minzoom: 11.5,
		filter: ['match', ['get', 'class'], ['stream_intermittent'], true, false],
		layout: { 'line-cap': 'butt', 'line-join': 'round' },
		paint: {
			'line-color': p.waterwayMinor,
			'line-width': width(
				[
					[11.5, 0.4],
					[14, 1],
					[18, 3],
				],
				w,
			),
			'line-dasharray': [2.5, 1.5],
			'line-opacity': ramp([
				[11.5, 0],
				[12.5, 1],
			]),
		},
	});

	layers.push({
		id: 'waterway-drain',
		type: 'line',
		source: STREETS,
		'source-layer': 'waterway',
		minzoom: 13,
		filter: ['match', ['get', 'class'], ['drain', 'ditch'], true, false],
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': p.waterwayMinor,
			'line-width': width(
				[
					[13, 0.4],
					[16, 1],
					[20, 3],
				],
				w,
			),
			'line-opacity': ramp([
				[13, 0],
				[14, 0.9],
			]),
		},
	});

	return layers;
}

/** The road network: tunnels and paths below, surface tiers, then bridges above. */
function roads({ palette: p, weight: w }) {
	const layers = [];

	layers.push({
		id: 'road-tunnel',
		type: 'line',
		source: STREETS,
		'source-layer': 'road',
		minzoom: 12,
		filter: [
			'all',
			['==', ['get', 'structure'], 'tunnel'],
			['match', ['get', 'class'], ROAD_CLASSES, true, false],
		],
		layout: { 'line-cap': 'butt', 'line-join': 'round' },
		paint: {
			'line-color': p.roadCasing,
			'line-width': width(
				[
					[12, 0.6],
					[16, 3],
					[20, 12],
				],
				w,
			),
			'line-dasharray': [3, 2],
		},
	});

	// Paths sit under the road network, not over it: a dashed trail crossing a
	// service road should be interrupted by the road, because the road is the more
	// important feature at the crossing.
	layers.push({
		id: 'road-path',
		type: 'line',
		source: STREETS,
		'source-layer': 'road',
		minzoom: 14,
		filter: ['all', SURFACE, ['match', ['get', 'class'], ['path', 'pedestrian'], true, false]],
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': p.pathLine,
			'line-width': width(
				[
					[14, 0.5],
					[18, 1.4],
					[20, 2.4],
				],
				w,
			),
			'line-dasharray': [2, 2],
			'line-opacity': ramp([
				[14, 0],
				[15, 0.9],
			]),
		},
	});

	// Every casing before every fill, and least-important tier first.
	//
	// Both halves of that matter and both are easy to get wrong. Interleaving
	// casing/fill per tier lets a trunk's casing paint over a motorway's fill, so
	// junctions get a grey notch cut through the more important road. And emitting
	// tiers in ROADS order — which runs major-first, because that is how the
	// hierarchy reads — would leave motorways at the bottom of the stack with
	// service roads drawn over them.
	const drawOrder = [...ROADS].reverse();
	const fadeFor = (tier) =>
		ramp([
			[tier.minzoom, 0],
			[tier.minzoom + 1, 1],
		]);

	for (const tier of drawOrder) {
		layers.push({
			id: `road-${tier.id}-casing`,
			type: 'line',
			source: STREETS,
			'source-layer': 'road',
			minzoom: tier.minzoom,
			filter: ['all', SURFACE, ['match', ['get', 'class'], tier.classes, true, false]],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': tier.major ? p.roadCasingMajor : p.roadCasing,
				'line-width': casing(tier.stops, w),
				'line-opacity': fadeFor(tier),
			},
		});
	}

	for (const tier of drawOrder) {
		layers.push({
			id: `road-${tier.id}`,
			type: 'line',
			source: STREETS,
			'source-layer': 'road',
			minzoom: tier.minzoom,
			filter: ['all', SURFACE, ['match', ['get', 'class'], tier.classes, true, false]],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': tier.id === 'minor' ? p.roadMinorFill : p.roadFill,
				'line-width': width(tier.stops, w),
				'line-opacity': fadeFor(tier),
			},
		});
	}

	// Bridges redraw above the surface network so a crossing reads correctly.
	layers.push({
		id: 'road-bridge-casing',
		type: 'line',
		source: STREETS,
		'source-layer': 'road',
		minzoom: 12,
		filter: [
			'all',
			['==', ['get', 'structure'], 'bridge'],
			['match', ['get', 'class'], ROAD_CLASSES, true, false],
		],
		layout: { 'line-cap': 'butt', 'line-join': 'round' },
		paint: {
			'line-color': p.roadCasingMajor,
			'line-width': casing(
				[
					[12, 1.4],
					[16, 6],
					[20, 22],
				],
				w,
			),
		},
	});

	layers.push({
		id: 'road-bridge',
		type: 'line',
		source: STREETS,
		'source-layer': 'road',
		minzoom: 12,
		filter: [
			'all',
			['==', ['get', 'structure'], 'bridge'],
			['match', ['get', 'class'], ROAD_CLASSES, true, false],
		],
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': p.roadFill,
			'line-width': width(
				[
					[12, 1.4],
					[16, 6],
					[20, 22],
				],
				w,
			),
		},
	});

	return layers;
}

/** Footprints, z15 and up, where an address is being found on the ground. */
function buildingFootprints({ palette: p, buildings }) {
	const layers = [];

	if (buildings) {
		layers.push({
			id: 'building',
			type: 'fill',
			source: STREETS,
			'source-layer': 'building',
			minzoom: 15,
			filter: ['!=', ['get', 'type'], 'building:part'],
			paint: {
				'fill-color': p.building,
				'fill-opacity': ramp([
					[15, 0],
					[16, 1],
				]),
				'fill-outline-color': p.buildingEdge,
			},
		});
	}

	return layers;
}

/**
 * Neutral grey and clearly subordinate. A SIMMER Region is 2px solid #2d46b6
 * with a fill wash; nothing drawn here can be mistaken for an agency object.
 * Note admin_level 2 is counties in the US — municipal limits are not in this
 * tileset.
 */
function boundaries({ palette: p, weight: w }) {
	const layers = [];

	const ADMIN = [
		{
			id: 'county',
			level: 2,
			color: p.adminCounty,
			minzoom: 7,
			dash: [3, 2],
			stops: [
				[7, 0.4],
				[12, 0.8],
				[16, 1.2],
			],
		},
		{
			id: 'state',
			level: 1,
			color: p.adminState,
			minzoom: 3,
			dash: [4, 2],
			stops: [
				[3, 0.5],
				[10, 1.1],
				[16, 1.8],
			],
		},
		{
			id: 'country',
			level: 0,
			color: p.adminCountry,
			minzoom: 1,
			dash: [1, 0],
			stops: [
				[1, 0.6],
				[8, 1.4],
				[16, 2.2],
			],
		},
	];

	for (const admin of ADMIN) {
		layers.push({
			id: `admin-${admin.id}`,
			type: 'line',
			source: STREETS,
			'source-layer': 'admin',
			minzoom: admin.minzoom,
			filter: [
				'all',
				['==', ['get', 'admin_level'], admin.level],
				isFalsy('maritime'),
				isFalsy('disputed'),
				['match', ['get', 'worldview'], ['all', 'US'], true, false],
			],
			layout: { 'line-join': 'round' },
			paint: {
				'line-color': admin.color,
				'line-width': width(admin.stops, w),
				'line-dasharray': admin.dash,
				'line-opacity': admin.id === 'county' ? 0.8 : 0.9,
			},
		});
	}

	return layers;
}

/** Everything typographic, drawn last so nothing paints over a name. */
function labels({ palette: p, poiLandmarks }) {
	const layers = [];

	layers.push({
		id: 'label-waterway',
		type: 'symbol',
		source: STREETS,
		'source-layer': 'waterway',
		minzoom: 12,
		filter: [
			'match',
			['get', 'class'],
			['river', 'canal', 'stream', 'stream_intermittent'],
			true,
			false,
		],
		layout: {
			'text-field': NAME,
			'text-font': FONT,
			'symbol-placement': 'line',
			'text-size': ramp([
				[12, 10],
				[18, 13],
			]),
			'text-letter-spacing': 0.02,
			'text-max-angle': 30,
			'symbol-spacing': 300,
		},
		paint: { 'text-color': p.labelWater, ...halo(p) },
	});

	// Named ponds, lakes, creeks, and canals. Crews and records reference water by
	// name; without these the operator has to cross-reference a habitat record to
	// know which pond they are looking at. `sizerank` is the tileset's own measure
	// of feature prominence, so it does the density work zoom alone cannot.
	layers.push({
		id: 'label-water',
		type: 'symbol',
		source: STREETS,
		'source-layer': 'natural_label',
		minzoom: 4,
		filter: [
			'all',
			[
				'match',
				['get', 'class'],
				['water', 'bay', 'reservoir', 'dock', 'water_feature', 'wetland', 'sea', 'ocean'],
				true,
				false,
			],
			['<=', ['get', 'filterrank'], 3],
		],
		layout: {
			'text-field': NAME,
			'text-font': FONT,
			'text-size': ['step', ['get', 'sizerank'], 15, 6, 13, 9, 11.5, 12, 10.5],
			'text-letter-spacing': 0.03,
			'text-max-width': 8,
		},
		paint: { 'text-color': p.labelWater, ...halo(p) },
	});

	layers.push({
		id: 'label-road',
		type: 'symbol',
		source: STREETS,
		'source-layer': 'road',
		minzoom: 12,
		filter: ['all', SURFACE, ['match', ['get', 'class'], ROAD_CLASSES, true, false]],
		layout: {
			'text-field': NAME,
			'text-font': FONT,
			'symbol-placement': 'line',
			'text-size': ramp([
				[12, 9.5],
				[16, 11],
				[20, 13],
			]),
			'text-letter-spacing': 0.01,
			'text-max-angle': 30,
			'symbol-spacing': 250,
			'text-pitch-alignment': 'viewport',
		},
		paint: { 'text-color': p.labelMuted, ...halo(p) },
	});

	// Civic and coordination POI only: the places an agency coordinates with, gets
	// complaints about, or must notify before spraying. Everything commercial is
	// cut at this tier. One uniform dot rather than category icons — the data
	// marks carry meaning on this map, and coloured POI icons would compete.
	const CIVIC = ['education', 'medical', 'park_like', 'public_facilities'];

	layers.push({
		id: 'poi-civic-dot',
		type: 'circle',
		source: STREETS,
		'source-layer': 'poi_label',
		minzoom: 13,
		filter: [
			'all',
			['match', ['get', 'class'], CIVIC, true, false],
			['<=', ['get', 'filterrank'], 2],
		],
		paint: {
			'circle-color': p.poiDot,
			'circle-radius': ramp([
				[13, 1.6],
				[18, 3],
			]),
			'circle-opacity': ramp([
				[13, 0],
				[14, 0.9],
			]),
			'circle-stroke-color': p.labelHalo,
			'circle-stroke-width': 0.8,
		},
	});

	layers.push({
		id: 'poi-civic',
		type: 'symbol',
		source: STREETS,
		'source-layer': 'poi_label',
		minzoom: 13,
		filter: [
			'all',
			['match', ['get', 'class'], CIVIC, true, false],
			['<=', ['get', 'filterrank'], 2],
		],
		layout: {
			'text-field': NAME,
			'text-font': FONT,
			'text-size': ramp([
				[13, 10],
				[18, 12],
			]),
			'text-offset': [0, 0.9],
			'text-anchor': 'top',
			'text-max-width': 9,
			'text-optional': true,
		},
		paint: { 'text-color': p.labelMuted, ...halo(p) },
	});

	// Wayfinding landmarks, high zoom only — where crews are navigating on foot or
	// by truck to a specific address, and "the trap behind the gas station" has to
	// be findable.
	if (poiLandmarks) {
		layers.push({
			id: 'poi-landmark',
			type: 'symbol',
			source: STREETS,
			'source-layer': 'poi_label',
			minzoom: 15,
			filter: [
				'all',
				['match', ['get', 'class'], ['religion', 'motorist', 'landmark', 'historic'], true, false],
				['<=', ['get', 'filterrank'], 1],
			],
			layout: {
				'text-field': NAME,
				'text-font': FONT_LIGHT,
				'text-size': ramp([
					[15, 9.5],
					[18, 11],
				]),
				'text-max-width': 9,
				'text-optional': true,
			},
			paint: {
				'text-color': p.labelMuted,
				'text-opacity': ramp([
					[15, 0],
					[16, 0.85],
				]),
				...halo(p, 1),
			},
		});
	}

	layers.push({
		id: 'label-settlement',
		type: 'symbol',
		source: STREETS,
		'source-layer': 'place_label',
		minzoom: 3,
		maxzoom: 15,
		filter: ['match', ['get', 'class'], ['settlement', 'settlement_subdivision'], true, false],
		layout: {
			'text-field': NAME,
			'text-font': FONT_BOLD,
			'text-size': [
				'interpolate',
				['linear'],
				['zoom'],
				3,
				['step', ['get', 'symbolrank'], 13, 9, 11, 12, 9.5],
				10,
				['step', ['get', 'symbolrank'], 20, 9, 15, 12, 12],
				14,
				['step', ['get', 'symbolrank'], 24, 9, 18, 12, 14],
			],
			'text-letter-spacing': 0.02,
			'text-max-width': 8,
		},
		paint: { 'text-color': p.label, ...halo(p, 1.4) },
	});

	layers.push({
		id: 'label-state',
		type: 'symbol',
		source: STREETS,
		'source-layer': 'place_label',
		minzoom: 3,
		maxzoom: 9,
		filter: ['==', ['get', 'class'], 'state'],
		layout: {
			'text-field': NAME,
			'text-font': FONT_BOLD,
			'text-size': ramp([
				[3, 9],
				[8, 14],
			]),
			'text-letter-spacing': 0.14,
			'text-transform': 'uppercase',
			'text-max-width': 7,
		},
		paint: { 'text-color': p.labelAdmin, ...halo(p, 1.4) },
	});

	layers.push({
		id: 'label-country',
		type: 'symbol',
		source: STREETS,
		'source-layer': 'place_label',
		minzoom: 1,
		maxzoom: 8,
		filter: ['==', ['get', 'class'], 'country'],
		layout: {
			'text-field': NAME,
			'text-font': FONT_BOLD,
			'text-size': ramp([
				[1, 10],
				[6, 17],
			]),
			'text-letter-spacing': 0.1,
			'text-transform': 'uppercase',
			'text-max-width': 7,
		},
		paint: { 'text-color': p.labelAdmin, ...halo(p, 1.4) },
	});

	return layers;
}

/**
 * Draw order, and the only place it is written down.
 *
 * A Mapbox style has no z-index — a layer paints over every layer before it in
 * the array, so this list *is* the cartography. Ground under cover under water
 * under roads under labels. Moving an entry moves what wins at a crossing.
 */
const GROUPS = [
	ground,
	landCover,
	terrainShade,
	water,
	waterways,
	roads,
	buildingFootprints,
	boundaries,
	labels,
];

export function buildLayers(variant) {
	return GROUPS.flatMap((group) => group(variant));
}
