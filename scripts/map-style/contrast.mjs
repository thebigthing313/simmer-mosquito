/**
 * Measures every SIMMER map mark against every basemap surface it can land on.
 *
 *   node scripts/map-style/contrast.mjs
 *   node scripts/map-style/contrast.mjs --fail   # exit 1 if any mark is under 3:1
 *
 * This is the map-room counterpart to `packages/ui-web/src/styles.contrast.test.ts`,
 * and it exists for the same reason DESIGN.md gives: prove it with a number, not
 * an eye. A basemap is exactly the kind of surface where contrast quietly fails —
 * you only see a mark against *some* of the ground it can sit on, and the pond it
 * disappears over is the one nobody panned to during review.
 *
 * WCAG 1.4.11 puts non-text graphical objects on a 3:1 floor. Map marks are
 * graphical objects, so that is the threshold used here.
 *
 * Marks are read from the real `@simmer-mosquito/design-tokens` build rather than
 * restated, so this cannot drift from what the layers actually paint. That does
 * mean `packages/design-tokens` has to be built first.
 */

import {
	mapContext,
	mapDensity,
	mapDomain,
	mapInteraction,
	mapLifecycle,
	mapProgress,
	mapStatus,
} from '../../packages/design-tokens/dist/map-palette.js';
import { VARIANTS } from './palette.mjs';

const THRESHOLD = 3;

/** The basemap surfaces a data mark can realistically be drawn over. */
const SURFACES = ['ground', 'groundAlt', 'park', 'parkDeep', 'water', 'wetland', 'building'];

const GROUPS = {
	interaction: mapInteraction,
	lifecycle: mapLifecycle,
	domain: mapDomain,
	status: mapStatus,
	progress: mapProgress,
	context: mapContext,
	density: mapDensity,
};

function channel(value) {
	const c = value / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
	const n = Number.parseInt(hex.slice(1), 16);
	const r = channel((n >> 16) & 255);
	const g = channel((n >> 8) & 255);
	const b = channel(n & 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
	const la = luminance(a);
	const lb = luminance(b);
	const [hi, lo] = la > lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * The casing a mark is drawn with.
 *
 * This is the whole reason a naive fill-vs-ground table is misleading. Point
 * marks are not bare fills — `mapInteraction.pointStroke` exists specifically to
 * "keep a point mark legible over dense basemap tiles", and selection and
 * measurement carry their own casings. So a mark is legible over a surface when
 * *either* its fill or its casing separates from that surface: if the fill sinks
 * into the ground the casing still outlines the shape, and vice versa.
 *
 * Judging the fill alone would condemn most of the palette over water and tell
 * you nothing you could act on.
 */
function casingFor(group, name) {
	if (group === 'interaction' && name === 'selected') return mapInteraction.selectedStroke;
	if (group === 'interaction' && name === 'measure') return mapInteraction.measureStroke;
	// The *Line entries and the stroke roles are themselves casings; they are
	// judged bare, because nothing is drawn under them.
	if (name.endsWith('Stroke') || name.endsWith('Line') || group === 'context') return null;
	return mapInteraction.pointStroke;
}

const failures = [];

for (const variant of VARIANTS) {
	// Hybrid paints no ground of its own — imagery does, and imagery has no fixed
	// colour to measure against. Skip it rather than report a meaningless number.
	if (variant.imagery) continue;

	const surfaces = SURFACES.map((key) => [key, variant.palette[key]]).filter(
		([, value]) => typeof value === 'string' && value.startsWith('#'),
	);

	// Rolled up per mark rather than per pair. A raw pair list runs to hundreds of
	// rows and reads as catastrophe; what actually matters is whether a mark is
	// weak *everywhere* (the palette needs a different value) or weak on one
	// surface (it needs care where that surface appears — over water, say, which
	// on this product is exactly where habitat and larval marks live).
	const rows = [];
	for (const [group, marks] of Object.entries(GROUPS)) {
		for (const [name, hex] of Object.entries(marks)) {
			const casing = casingFor(group, name);
			const weakOn = [];
			let worst = Number.POSITIVE_INFINITY;
			for (const [surfaceName, surfaceHex] of surfaces) {
				const best = Math.max(
					contrast(hex, surfaceHex),
					casing === null ? 0 : contrast(casing, surfaceHex),
				);
				if (best < THRESHOLD) weakOn.push(surfaceName);
				worst = Math.min(worst, best);
			}
			if (weakOn.length > 0) {
				rows.push({ label: `${group}.${name}`, hex, weakOn, worst, total: surfaces.length });
				failures.push(`${variant.id}:${group}.${name}`);
			}
		}
	}

	rows.sort((a, b) => b.weakOn.length - a.weakOn.length || a.worst - b.worst);
	console.log(`\n${variant.name}   (${surfaces.length} basemap surfaces, ${THRESHOLD}:1 floor)`);
	console.log('─'.repeat(78));
	if (rows.length === 0) {
		console.log('  every mark clears the floor on every surface, by fill or by casing.');
		continue;
	}
	for (const row of rows) {
		const scope = row.weakOn.length === row.total ? 'EVERYWHERE' : row.weakOn.join(', ');
		console.log(
			`  ${row.label.padEnd(26)} ${row.hex}  worst ${row.worst.toFixed(2)}:1` +
				`  weak on ${String(row.weakOn.length).padStart(2)}/${row.total}: ${scope}`,
		);
	}
}

console.log('');
if (failures.length > 0) {
	console.log(`${failures.length} mark/variant combination(s) below ${THRESHOLD}:1 somewhere.`);
	console.log('See README → "What the contrast pass found" before treating any of it as a bug.');
	if (process.argv.includes('--fail')) process.exit(1);
} else {
	console.log(`All marks clear ${THRESHOLD}:1 on every basemap surface, by fill or by casing.`);
}
