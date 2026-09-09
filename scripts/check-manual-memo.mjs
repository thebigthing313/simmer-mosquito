#!/usr/bin/env node

/**
 * Refuses a `useMemo` or `useCallback` on a compiled path that carries no
 * written reason for surviving the React Compiler.
 *
 * Run it with `pnpm check:manual-memo`. About two seconds, a parse per module
 * and no compiler run.
 *
 * ## What it is for
 *
 * #649 put the compiler on `apps/web`, `apps/admin` and `packages/ui-web`, and
 * the second half of that destination is deleting the hand-written memoization
 * the compiler now does. #839 settled the rule: **strip by default**, and the
 * keeper list is closed at two classes, a wrapper feeding
 * `useSyncExternalStore`'s `subscribe` or `getSnapshot`, where losing stability
 * is a hang rather than a re-render, and a wrapper whose value crosses into a
 * dependency array outside the compiled corpus. Everything else goes, and a
 * dependency list that disagrees with its closure is fixed rather than excused.
 *
 * A deletion needs no argument. A survivor carries
 * `// manual-memo-reason: one sentence ending in a full stop.` on the line
 * above it, and this gate is what makes that binding.
 *
 * ## The corpus is derived, not written
 *
 * A wrapper is in scope when its path is on `COMPILER_PHASES`, which is the
 * same register `check:compiler-bailouts` sorts by and `check:compiler-coverage`
 * audits. Outside it nothing is memoizing the value, so the wrapper is out of
 * corpus rather than exempt, and putting its directory on a phase drags it in.
 * Writing the corpus out a second time here would let "is this compiled" and
 * "is this gated" answer differently.
 *
 * The tests trees are out. A suite renders a hook to assert what it dispatched
 * and is not shipped code, and #776 measured the compiler pass really running
 * over the jsdom suites of a compiled app, which changes nothing a reader of
 * this gate would act on.
 *
 * ## A ratchet, not a zero
 *
 * 848 wrappers stood on compiled paths the day this was written, so a gate at
 * zero would fail every branch on history and be switched off within the week.
 * That number is 43 higher than #839's survey, and the 43 are the correction:
 * a wrapper written `useMemo<T>(` carries no `useMemo(` for a grep to find, and
 * the survey was a grep. A parse reads the callee rather than the text after
 * it, which is the same reason `check:compiler-coverage` is a parse.
 * `MANUAL_MEMO_BACKLOG` is the register, keyed by file the way
 * `REACT_RULE_BACKLOG` and `BAILING_FILES` are, and it **fails in both
 * directions**: a file whose count rises has grown a wrapper, and a file whose
 * count falls has had one stripped and owes the register the edit. One total
 * over the workspace is what a swap holds, and per-file is what a swap inside
 * one module holds, which the strip phases are expected to make visible as they
 * land. The register empties at the end of the strip, and this gate then reads
 * as the zero it could not ship as.
 *
 * A marker takes a wrapper out of the count entirely rather than lowering it,
 * so a survivor is invisible to the ratchet and only the backlog moves.
 *
 * ## No directive-pairing exemption
 *
 * `check:compiler-bailouts` pairs a bail-out against a `"use no memo"` directive
 * positionally, and the first draft of this rule was going to do the same, on
 * the theory that a function the compiler is not memoizing needs its wrappers.
 * Measured, both opted-out functions in the workspace contain **zero wrappers**:
 * `ResultRows` in `result-list.tsx` is `useVirtualizer` and `useState`, and
 * `useHeldRows` in `inspections/table.tsx` is a `useRef` and a render-phase
 * read. An exemption path covering nothing is headroom the next finding lands
 * inside, so if that case ever arrives the wrapper carries an ordinary marker
 * and the reason names the directive.
 *
 * ## The floors, and the probes that are not floors
 *
 * `MINIMUM_FILES` is against a walk that has stopped finding the compiled
 * corpus, and `MINIMUM_WRAPPERS` against a detector that found the files and
 * read no calls out of them. Both otherwise print the summary line a clean run
 * prints.
 *
 * `PROBES` is the guard neither floor can be, and it earns its place from the
 * end state rather than from today: when the backlog reaches empty, every count
 * this gate produces is zero, and a detector that has stopped detecting reads
 * exactly like a finished strip. So the probes hand the reader six sources with
 * known answers, one per callee shape the detector must see, plus the three a
 * rule one notch too wide reads wrong.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from '@babel/core';
import { isOptedIn } from './lib/compiler-phases.mjs';
import { maskedSource } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles } from './lib/source-files.mjs';
import { count, failure, markersIn, readMarker } from './lib/style-gate.mjs';

const GATE = 'check-manual-memo';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** The word that opens a marker. */
const MARKER_WORD = 'manual-memo-reason';

/** The two wrappers the compiler replaces. */
const WRAPPERS = new Set(['useMemo', 'useCallback']);

/**
 * Unmarked wrappers still standing, by repo-relative path.
 *
 * A file absent from this register must hold none. A file present must hold
 * exactly its number. Both directions fail; see the header.
 *
 * @type {Readonly<Record<string, number>>}
 */
const MANUAL_MEMO_BACKLOG = {
	'apps/web/src/components/acknowledged-write.tsx': 2,
	'apps/web/src/components/additional-personnel-list.tsx': 1,
	'apps/web/src/components/app-shell/app-shell-root.tsx': 2,
	'apps/web/src/components/catalog/catalog-search.ts': 2,
	'apps/web/src/components/cleanup/habitat-merge.tsx': 5,
	'apps/web/src/components/cleanup/merge-confirm-dialog.tsx': 1,
	'apps/web/src/components/cleanup/record-cleanup.tsx': 3,
	'apps/web/src/components/comments-section.tsx': 5,
	'apps/web/src/components/danger-zone-card.tsx': 1,
	'apps/web/src/components/explorer/use-collection-method-options.ts': 1,
	'apps/web/src/components/explorer/use-control-method-options.ts': 2,
	'apps/web/src/components/explorer/use-date-range-filters.ts': 4,
	'apps/web/src/components/explorer/use-entity-tags.ts': 2,
	'apps/web/src/components/explorer/use-explorer-panel.ts': 3,
	'apps/web/src/components/explorer/use-habitat-type-options.ts': 1,
	'apps/web/src/components/explorer/use-paged-map-resource.ts': 3,
	'apps/web/src/components/explorer/use-personnel-options.ts': 1,
	'apps/web/src/components/explorer/use-region-membership.ts': 2,
	'apps/web/src/components/explorer/use-region-options.ts': 1,
	'apps/web/src/components/explorer/use-species-options.ts': 1,
	'apps/web/src/components/explorer/use-tag-options.ts': 1,
	'apps/web/src/components/key-entry/key-entry-dialog.tsx': 8,
	'apps/web/src/components/key-entry/use-key-entry-tally.ts': 6,
	'apps/web/src/components/map/geolocate-control.tsx': 1,
	'apps/web/src/components/map/map-context-menu.tsx': 1,
	'apps/web/src/components/map/map-readout.tsx': 1,
	'apps/web/src/components/map/record-location-card.tsx': 6,
	'apps/web/src/components/map/region-boundary-picker.tsx': 1,
	'apps/web/src/components/map/use-address-point.ts': 2,
	'apps/web/src/components/map/use-draw-location.ts': 9,
	'apps/web/src/components/map/use-geolocation.ts': 1,
	'apps/web/src/components/map/use-map-draw.ts': 29,
	'apps/web/src/components/map/use-map-measure.ts': 7,
	'apps/web/src/components/map/use-route-layer.ts': 2,
	'apps/web/src/components/mission-stop-execution.tsx': 2,
	'apps/web/src/components/registrations/contact-registrations.tsx': 1,
	'apps/web/src/components/registrations/registration-draft.tsx': 2,
	'apps/web/src/components/registrations/registration-form.tsx': 1,
	'apps/web/src/components/registrations/use-registration-roster.ts': 2,
	'apps/web/src/components/route-planning/route-map.tsx': 2,
	'apps/web/src/components/route-planning/routes-index-page.tsx': 2,
	'apps/web/src/components/stop-order/use-stop-order.ts': 2,
	'apps/web/src/forms/record-extras.ts': 2,
	'apps/web/src/routes/-activity-data.ts': 1,
	'apps/web/src/routes/-activity-view.ts': 7,
	'apps/web/src/routes/-habitat-detail.tsx': 2,
	'apps/web/src/routes/-habitat-inspection-stats.tsx': 1,
	'apps/web/src/routes/adult-surveillance/-adult-pickers.tsx': 1,
	'apps/web/src/routes/adult-surveillance/-collection-key-entry.tsx': 1,
	'apps/web/src/routes/adult-surveillance/-trap-collection-history.tsx': 3,
	'apps/web/src/routes/adult-surveillance/-trap-directory-data.ts': 2,
	'apps/web/src/routes/adult-surveillance/collections/$id.tsx': 6,
	'apps/web/src/routes/adult-surveillance/collections/$id_.edit.tsx': 1,
	'apps/web/src/routes/adult-surveillance/collections/-collection-form.tsx': 3,
	'apps/web/src/routes/adult-surveillance/collections/create.tsx': 2,
	'apps/web/src/routes/adult-surveillance/collections/index.tsx': 11,
	'apps/web/src/routes/adult-surveillance/index.tsx': 6,
	'apps/web/src/routes/adult-surveillance/trap-directory.tsx': 3,
	'apps/web/src/routes/adult-surveillance/traps/$id.tsx': 9,
	'apps/web/src/routes/adult-surveillance/traps/$id_.edit.tsx': 1,
	'apps/web/src/routes/adult-surveillance/traps/-trap-form.tsx': 1,
	'apps/web/src/routes/adult-surveillance/traps/create.tsx': 1,
	'apps/web/src/routes/adult-surveillance/traps/index.tsx': 11,
	'apps/web/src/routes/adult-surveillance/traps/routes/$id_.edit.tsx': 8,
	'apps/web/src/routes/adult-surveillance/traps/routes/-trap-route-data.ts': 3,
	'apps/web/src/routes/control-operations/biocontrol/$id.tsx': 1,
	'apps/web/src/routes/control-operations/biocontrol/$id_.edit.tsx': 1,
	'apps/web/src/routes/control-operations/biocontrol/-biocontrol-form.tsx': 3,
	'apps/web/src/routes/control-operations/biocontrol/create.tsx': 1,
	'apps/web/src/routes/control-operations/biocontrol/index.tsx': 12,
	'apps/web/src/routes/control-operations/chemical/$id.tsx': 6,
	'apps/web/src/routes/control-operations/chemical/$id_.edit.tsx': 1,
	'apps/web/src/routes/control-operations/chemical/-application-form.tsx': 14,
	'apps/web/src/routes/control-operations/chemical/-batch-drawer.tsx': 1,
	'apps/web/src/routes/control-operations/chemical/-insecticide-drawer.tsx': 1,
	'apps/web/src/routes/control-operations/chemical/create.tsx': 1,
	'apps/web/src/routes/control-operations/chemical/formulations.tsx': 5,
	'apps/web/src/routes/control-operations/chemical/index.tsx': 11,
	'apps/web/src/routes/control-operations/chemical/insecticides.tsx': 1,
	'apps/web/src/routes/control-operations/index.tsx': 7,
	'apps/web/src/routes/control-operations/source-reduction/$id.tsx': 1,
	'apps/web/src/routes/control-operations/source-reduction/$id_.edit.tsx': 1,
	'apps/web/src/routes/control-operations/source-reduction/-source-reduction-form.tsx': 2,
	'apps/web/src/routes/control-operations/source-reduction/create.tsx': 1,
	'apps/web/src/routes/control-operations/source-reduction/index.tsx': 11,
	'apps/web/src/routes/daily-work/$profileId.tsx': 4,
	'apps/web/src/routes/gis/addresses/$id_.edit.tsx': 1,
	'apps/web/src/routes/gis/addresses/-address-form.tsx': 7,
	'apps/web/src/routes/gis/addresses/create.tsx': 1,
	'apps/web/src/routes/gis/addresses/index.tsx': 6,
	'apps/web/src/routes/gis/regions/$id_.edit.tsx': 1,
	'apps/web/src/routes/gis/regions/-folder-dialog.tsx': 1,
	'apps/web/src/routes/gis/regions/-region-dnd.ts': 1,
	'apps/web/src/routes/gis/regions/-region-form.tsx': 1,
	'apps/web/src/routes/gis/regions/-region-rename.ts': 1,
	'apps/web/src/routes/gis/regions/create.tsx': 1,
	'apps/web/src/routes/gis/regions/import.tsx': 7,
	'apps/web/src/routes/gis/regions/index.tsx': 13,
	'apps/web/src/routes/gis/weather/$id.tsx': 2,
	'apps/web/src/routes/gis/weather/$id_.edit.tsx': 1,
	'apps/web/src/routes/gis/weather/$id_.import.tsx': 2,
	'apps/web/src/routes/gis/weather/-weather-summaries-card.tsx': 3,
	'apps/web/src/routes/gis/weather/-weather-summary-dialog.tsx': 4,
	'apps/web/src/routes/gis/weather/create.tsx': 1,
	'apps/web/src/routes/gis/weather/index.tsx': 9,
	'apps/web/src/routes/larval-surveillance/-inspection-filters.tsx': 11,
	'apps/web/src/routes/larval-surveillance/-overview-data.ts': 1,
	'apps/web/src/routes/larval-surveillance/-sample-key-entry.tsx': 1,
	'apps/web/src/routes/larval-surveillance/habitats/$id_.edit.tsx': 1,
	'apps/web/src/routes/larval-surveillance/habitats/-route-data.ts': 4,
	'apps/web/src/routes/larval-surveillance/habitats/-route-stop-list.tsx': 3,
	'apps/web/src/routes/larval-surveillance/habitats/create.tsx': 1,
	'apps/web/src/routes/larval-surveillance/habitats/index.tsx': 15,
	'apps/web/src/routes/larval-surveillance/habitats/routes/$id_.edit.tsx': 10,
	'apps/web/src/routes/larval-surveillance/index.tsx': 7,
	'apps/web/src/routes/larval-surveillance/inspections/$id_.edit.tsx': 1,
	'apps/web/src/routes/larval-surveillance/inspections/-inspection-form.tsx': 3,
	'apps/web/src/routes/larval-surveillance/inspections/create.tsx': 2,
	'apps/web/src/routes/larval-surveillance/inspections/index.tsx': 6,
	'apps/web/src/routes/larval-surveillance/inspections/table.tsx': 5,
	'apps/web/src/routes/larval-surveillance/samples/$id.tsx': 8,
	'apps/web/src/routes/larval-surveillance/samples/index.tsx': 13,
	'apps/web/src/routes/my-organization/-components/key-bindings.tsx': 4,
	'apps/web/src/routes/operations/-command-runner.ts': 1,
	'apps/web/src/routes/operations/-operations-data.ts': 5,
	'apps/web/src/routes/operations/-worklist-map.tsx': 2,
	'apps/web/src/routes/operations/assignments/$id.tsx': 3,
	'apps/web/src/routes/operations/assignments/$id_.edit.tsx': 9,
	'apps/web/src/routes/operations/assignments/-assignment-data.ts': 12,
	'apps/web/src/routes/operations/assignments/-assignment-form.tsx': 1,
	'apps/web/src/routes/operations/assignments/-assignment-target-picker.tsx': 3,
	'apps/web/src/routes/operations/assignments/create.tsx': 2,
	'apps/web/src/routes/operations/assignments/index.tsx': 10,
	'apps/web/src/routes/operations/index.tsx': 10,
	'apps/web/src/routes/operations/missions/$id_.add-stop.tsx': 1,
	'apps/web/src/routes/operations/missions/$id_.edit.tsx': 3,
	'apps/web/src/routes/operations/missions/-mission-form.tsx': 3,
	'apps/web/src/routes/operations/missions/-mission-notifications-card.tsx': 1,
	'apps/web/src/routes/operations/missions/-mission-run.ts': 13,
	'apps/web/src/routes/operations/missions/-mission-stops.tsx': 1,
	'apps/web/src/routes/operations/missions/create.tsx': 2,
	'apps/web/src/routes/operations/missions/index.tsx': 11,
	'apps/web/src/routes/operations/requests-for-control/$id.tsx': 2,
	'apps/web/src/routes/operations/requests-for-control/$id_.edit.tsx': 1,
	'apps/web/src/routes/operations/requests-for-control/-request-form.tsx': 1,
	'apps/web/src/routes/operations/requests-for-control/create.tsx': 2,
	'apps/web/src/routes/operations/requests-for-control/index.tsx': 10,
	'apps/web/src/routes/public-engagement/contacts/$id_.edit.tsx': 1,
	'apps/web/src/routes/public-engagement/contacts/create.tsx': 1,
	'apps/web/src/routes/public-engagement/contacts/index.tsx': 1,
	'apps/web/src/routes/public-engagement/index.tsx': 5,
	'apps/web/src/routes/public-engagement/outreach/$id_.edit.tsx': 1,
	'apps/web/src/routes/public-engagement/outreach/-outreach-form.tsx': 2,
	'apps/web/src/routes/public-engagement/outreach/create.tsx': 1,
	'apps/web/src/routes/public-engagement/outreach/index.tsx': 10,
	'apps/web/src/routes/public-engagement/service-requests/$id.tsx': 6,
	'apps/web/src/routes/public-engagement/service-requests/$id_.edit.tsx': 1,
	'apps/web/src/routes/public-engagement/service-requests/-service-request-form.tsx': 2,
	'apps/web/src/routes/public-engagement/service-requests/create.tsx': 2,
	'apps/web/src/routes/public-engagement/service-requests/index.tsx': 13,
};

/** The floor under the walk. See the header. */
const MINIMUM_FILES = 700;

/** The floor under the detector. See the header. */
const MINIMUM_WRAPPERS = 500;

/**
 * Sources whose wrapper counts are known.
 *
 * One per callee shape, because this codebase writes both: `apps/web` imports
 * `useMemo` by name and the generated shadcn source under `packages/ui-web`
 * writes `React.useMemo`. Three must answer zero: a name that merely starts
 * with the word, a member call on something that is not React, and an import
 * of the name, which is a specifier rather than a call.
 *
 * @type {ReadonlyArray<{ name: string, source: string, wrappers: number }>}
 */
const PROBES = [
	{ name: 'probe-bare.ts', source: 'export const a = (f) => useCallback(f, []);\n', wrappers: 1 },
	{
		name: 'probe-member.ts',
		source: 'export const b = (f) => React.useMemo(() => f, [f]);\n',
		wrappers: 1,
	},
	{
		name: 'probe-both.tsx',
		source:
			'export const C = () => {\n\tconst v = useMemo(() => 1, []);\n\tconst h = React.useCallback(() => v, [v]);\n\treturn <p onClick={h}>{v}</p>;\n};\n',
		wrappers: 2,
	},
	{
		name: 'probe-prefix.ts',
		source: 'export const d = (f) => useMemoizedThing(f);\n',
		wrappers: 0,
	},
	{
		name: 'probe-foreign-member.ts',
		source: 'export const e = (lib, f) => lib.useMemo(f);\n',
		wrappers: 0,
	},
	{
		name: 'probe-import.ts',
		source: "import { useMemo, useCallback } from 'react';\nexport const f = useMemo;\n",
		wrappers: 0,
	},
];

// ---------------------------------------------------------------------------
// The detector
// ---------------------------------------------------------------------------

/**
 * The parser plugins one module is read with.
 *
 * `jsx` is added for `.tsx` and refused for `.ts`, which is
 * `check-compiler-coverage.mjs`'s rule and `check-compiler-bailouts.mjs`'s
 * before it: TypeScript spells a generic call `f<T>(x)`, and with `jsx` on the
 * parser reads the first `<` as a tag.
 */
const parserPluginsFor = (path) => (path.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript']);

/**
 * The name a call expression's callee wraps with, or `null` when it wraps with
 * neither.
 *
 * Two shapes and no third. `useMemo(...)` is what an app importing the name
 * writes, and `React.useMemo(...)` is what the generated shadcn source writes,
 * and the member shape is narrowed to the `React` object rather than taken from
 * any object: a `lib.useMemo` is a library's own hook and the compiler does not
 * touch it. A call assembled at runtime is out of reach here the way a computed
 * `role` is for `check:image-names`, and nothing in the workspace writes one.
 */
const namesAWrapper = (node) => node.type === 'Identifier' && WRAPPERS.has(node.name);

/** Whether a callee reads off `React`, which is the spelling the generated source uses. */
const readsOffReact = (callee) =>
	callee.type === 'MemberExpression' &&
	!callee.computed &&
	callee.object.type === 'Identifier' &&
	callee.object.name === 'React';

/** The wrapper a callee names, by either spelling, or `null` for neither. */
const calleeWrapper = (callee) => {
	if (namesAWrapper(callee)) {
		return callee.name;
	}
	return readsOffReact(callee) && namesAWrapper(callee.property) ? callee.property.name : null;
};

const wrapperName = (node) => (node.type === 'CallExpression' ? calleeWrapper(node.callee) : null);

/**
 * Every wrapper call in one parsed module, as `{ name, line }`.
 *
 * The line is the callee's rather than the statement's, which for
 * `const x = useMemo(` is the same line and for a wrapper written as an
 * argument is the line a reader would put the marker above.
 */
const wrappersIn = (node, found = []) => {
	if (node === null || typeof node !== 'object') {
		return found;
	}
	const name = Array.isArray(node) ? null : wrapperName(node);
	if (name !== null) {
		found.push({ name, line: node.callee.loc.start.line });
	}

	for (const child of childrenOf(node)) {
		wrappersIn(child, found);
	}
	return found;
};

/** The nodes below one node, with `loc` left out because it holds no calls. */
const childrenOf = (node) =>
	Array.isArray(node)
		? node
		: Object.keys(node).flatMap((key) => (key === 'loc' ? [] : [node[key]]));

/**
 * The wrappers in one source.
 *
 * A module that does not parse is a failure rather than an empty answer,
 * because an empty answer from a parse error is the silent pass this gate is
 * the other half of.
 */
const readWrappers = (path, source) => {
	let ast;
	try {
		ast = parseSync(source, {
			babelrc: false,
			configFile: false,
			filename: path,
			sourceType: 'module',
			parserOpts: { plugins: parserPluginsFor(path) },
		});
	} catch (error) {
		fail(`${path} did not parse, so the gate cannot say what it wraps: ${error.message}`);
	}
	return wrappersIn(ast.program);
};

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

/** One file's wrappers, its markers, and which wrappers those markers excuse. */
const readFile = (path) => {
	const source = readFileSync(join(workspaceRoot, path), 'utf8');
	const lines = source.split('\n');
	const masked = maskedSource(source).split('\n');
	const markers = markersIn(lines, MARKER_WORD, (at) =>
		readMarker(MARKER_WORD, lines[at], masked[at]),
	);
	const wrappers = readWrappers(path, source);

	const claimed = new Set();
	const unmarked = wrappers.filter((wrapper) => {
		const marker = markers.find(
			(each) => each.problem === undefined && each.target === wrapper.line && !claimed.has(each),
		);
		if (marker === undefined) {
			return true;
		}
		claimed.add(marker);
		return false;
	});

	return { path, lines, wrappers, markers, unmarked, claimed };
};

/**
 * What the rule refuses in one file: a malformed marker, a marker excusing
 * nothing, and a count that disagrees with the register in either direction.
 */
const problemsIn = (file) => [
	...file.markers
		.filter((marker) => marker.problem !== undefined)
		.map(
			(marker) =>
				`${file.path}:${marker.line} carries a ${MARKER_WORD} marker that does not read as one: ${marker.problem}.`,
		),
	...file.markers
		.filter((marker) => marker.problem === undefined && !file.claimed.has(marker))
		.map(
			(marker) =>
				`${file.path}:${marker.line} carries a ${MARKER_WORD} marker over a line that holds no useMemo or useCallback, so it excuses nothing.\n  Its reason reads: ${marker.reason}`,
		),
	...countProblem(file),
];

/** The register half, which is where a strip phase reports and a new wrapper fails. */
const countProblem = (file) => {
	const recorded = MANUAL_MEMO_BACKLOG[file.path] ?? 0;
	const found = file.unmarked.length;
	return found === recorded ? [] : [countMessage(file.path, found, recorded)];
};

/** What a disagreeing count reads as, which differs by the direction it moved. */
const countMessage = (path, found, recorded) => {
	const held = `${path} holds ${count(found, 'unstripped wrapper')}`;
	if (recorded === 0) {
		return `${held} and is not in MANUAL_MEMO_BACKLOG.\n  Delete the wrapper and let the compiler memoize it, or give it a "// ${MARKER_WORD}: ..." marker naming which of #839's two keeper classes it is in.`;
	}
	const moved =
		found > recorded
			? 'A wrapper was added on a compiled path.'
			: `Wrappers came out here, so the register owes the edit: set this file to ${found}, or delete the entry.`;
	return `${held} against ${recorded} in MANUAL_MEMO_BACKLOG.\n  ${moved}`;
};

/** A register entry naming a file the walk no longer reaches. */
const strayEntries = (files) => {
	const walked = new Set(files.map((file) => file.path));
	return Object.keys(MANUAL_MEMO_BACKLOG)
		.filter((path) => !walked.has(path))
		.map(
			(path) =>
				`MANUAL_MEMO_BACKLOG names ${path}, which is not on a compiled path any more.\n  Delete the entry; a stale one is headroom the next wrapper lands inside.`,
		);
};

/**
 * Run the probes, and refuse a run that reads any of them wrong.
 *
 * Ahead of the counts rather than beside them, for the reason in the header: at
 * the end of the strip every count is zero and a broken detector is invisible.
 */
const verifyProbes = () => {
	for (const probe of PROBES) {
		const found = readWrappers(probe.name, probe.source).length;
		if (found !== probe.wrappers) {
			fail(
				`the wrapper detector reads ${count(found, 'wrapper')} in ${probe.name} and there ${probe.wrappers === 1 ? 'is' : 'are'} ${probe.wrappers}. The detector is broken, so every count below is meaningless.`,
			);
		}
	}
};

/** The compiled corpus, held to its two floors. */
const readCorpus = () => {
	const files = [...sourceFiles(workspaceRoot, [])]
		.map((path) => pathFrom(workspaceRoot, path))
		.filter(isOptedIn)
		.map(readFile);

	if (files.length < MINIMUM_FILES) {
		fail(
			`only ${count(files.length, 'module')} on a compiled path, under the floor of ${MINIMUM_FILES}. The walk has stopped finding the corpus COMPILER_PHASES names.`,
		);
	}

	const wrappers = files.reduce((total, file) => total + file.wrappers.length, 0);
	const recorded = Object.values(MANUAL_MEMO_BACKLOG).reduce((total, each) => total + each, 0);
	if (recorded > 0 && wrappers < MINIMUM_WRAPPERS) {
		fail(
			`only ${count(wrappers, 'wrapper')} across ${files.length} modules, under the floor of ${MINIMUM_WRAPPERS}, while MANUAL_MEMO_BACKLOG still records ${recorded}. The detector found the files and read almost nothing out of them.`,
		);
	}

	return files;
};

const run = () => {
	verifyProbes();

	const files = readCorpus();
	const problems = [...files.flatMap(problemsIn), ...strayEntries(files)];

	if (problems.length > 0) {
		console.error(problems.join('\n\n'));
		process.exit(1);
	}

	const wrappers = files.reduce((total, file) => total + file.wrappers.length, 0);
	const kept = files.reduce((total, file) => total + file.claimed.size, 0);
	console.log(
		`${GATE}: ${count(wrappers, 'wrapper')} across ${files.length} compiled modules, ${wrappers - kept} on the MANUAL_MEMO_BACKLOG ratchet and ${kept} kept with a written reason.`,
	);
};

run();
