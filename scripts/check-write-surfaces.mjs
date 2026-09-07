#!/usr/bin/env node
/**
 * Asserts that every write surface in `apps/web` has a role floor in the
 * register, and that no route names a floor of its own.
 *
 * Run it with `pnpm check:write-surfaces`.
 *
 * ## What counts as a write surface
 *
 * A route counts when the last segment of its path is one of the six verbs this
 * app names a whole-page write flow with: `create`, `edit`, `import`, `merge`,
 * `cleanup`, `add-stop`. That rule classifies 40 of the 130 routes, and it is
 * exactly the set that guards today plus the three that #623 found open.
 *
 * The rule triage first proposed was "the route's component tree dispatches a
 * command hook", and it was measured before being dropped: 93 of the 130 routes
 * reach `apps/web/src/hooks/mutations` through their imports. Every detail page
 * reaches one, because it renders a comment box; every catalog page reaches one,
 * because it has an inline add row; the organization workspace reaches one on
 * every tab. Those are read surfaces carrying a write control, and a control is
 * gated where it is drawn, by `WriteOnly`. A route guard is for a page that
 * exists only to write, which is what the verb names.
 *
 * The cost of the verb rule is that a write surface named with a seventh verb
 * is invisible to it. The floor under the count is the guard against that: a
 * seventh verb is a new kind of page and lands with somebody reading this.
 *
 * ## What it asserts
 *
 * - Every write surface has an entry in the register.
 * - Every write surface guards itself in `beforeLoad`, naming its own path.
 * - No route calls `isBelowRole` with a role written at the call site, which is
 *   the syntax the register replaced.
 * - Every register entry names a route that exists, so a renamed route takes
 *   its floor with it rather than leaving allowance behind.
 *
 * Two floors, in the shape the other gates use: `MINIMUM_WRITE_SURFACES` under
 * the classified count, against a scan that has stopped finding them, and
 * `MINIMUM_WRITE_VERBS` under the verb list, because dropping a verb narrows
 * the scan silently and the summary line would still read as a pass.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTES_DIR = join(workspaceRoot, 'apps/web/src/routes');
const REGISTER = join(workspaceRoot, 'apps/web/src/lib/write-surfaces.ts');

/** The verbs this app names a whole-page write flow with. */
const WRITE_VERBS = ['add-stop', 'cleanup', 'create', 'edit', 'import', 'merge'];

/** A verb dropped from the list takes its routes out of scope rather than reporting them. */
const MINIMUM_WRITE_VERBS = 6;

/**
 * How few write surfaces means the walk has stopped finding routes rather than
 * the app having shrunk. There were 40 on 2026-09-07.
 */
const MINIMUM_WRITE_SURFACES = 30;

const ROUTE_ID = /createFileRoute\(\s*'([^']+)'\s*\)/;
const REGISTER_KEY = /^\t'(\/[^']*)':/gm;
const INLINE_ROLE = /isBelowRole\(\s*context\s*,\s*'[a-z]+'\s*\)/;
const GUARD_PATH = /isBelowWriteFloor\(\s*context\s*,\s*'([^']+)'\s*\)/;

function main() {
	if (WRITE_VERBS.length < MINIMUM_WRITE_VERBS) {
		fail(
			`the verb list holds ${WRITE_VERBS.length} verbs, fewer than the ${MINIMUM_WRITE_VERBS} this expects. A dropped verb takes its routes out of scope rather than reporting them.`,
		);
	}

	const routes = readRoutes();
	const surfaces = routes.filter((route) => isWriteSurface(route.path));
	if (surfaces.length < MINIMUM_WRITE_SURFACES) {
		fail(
			`classified only ${surfaces.length} write surfaces out of ${routes.length} routes, fewer than the ${MINIMUM_WRITE_SURFACES} this expects. The walk has stopped finding the route tree.`,
		);
	}

	const floors = readRegister();
	report(
		[
			...unregistered(surfaces, floors),
			...unguarded(surfaces),
			...inlineRoles(routes),
			...stale(routes, floors),
		],
		surfaces.length,
		floors.size,
	);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Every route module, with the path its `createFileRoute` declares. */
function readRoutes() {
	return [...typeScriptFilesUnder(ROUTES_DIR)].flatMap((file) => {
		const text = readFileSync(file, 'utf8');
		const id = text.match(ROUTE_ID);
		return id === null ? [] : [{ file: short(file), path: routePath(id[1]), text }];
	});
}

/**
 * The path a `Link` writes, from the id a route file declares.
 *
 * A non-nested route file is named `$id_`, and the trailing underscore is a
 * fact about the file rather than about the URL, so it comes off. The register
 * is keyed by what a `Link` and a navigation item carry.
 */
function routePath(id) {
	return id
		.split('/')
		.map((segment) =>
			segment.startsWith('$') && segment.endsWith('_') ? segment.slice(0, -1) : segment,
		)
		.join('/');
}

const isWriteSurface = (path) => WRITE_VERBS.includes(path.split('/').pop());

/** The paths the register carries a floor for. */
function readRegister() {
	const text = readFileSync(REGISTER, 'utf8');
	return new Set([...text.matchAll(REGISTER_KEY)].map(([, path]) => path));
}

// ---------------------------------------------------------------------------
// The four rules
// ---------------------------------------------------------------------------

function unregistered(surfaces, floors) {
	return surfaces
		.filter((route) => !floors.has(route.path))
		.map(
			(route) =>
				`${route.file} mounts a write surface with no floor in the register. Add '${route.path}' to WRITE_SURFACE_FLOORS, at the role apps/server/src/command-permissions.ts enforces for the command it sends.`,
		);
}

function unguarded(surfaces) {
	return surfaces.flatMap((route) => {
		const guard = route.text.match(GUARD_PATH);
		if (guard === null) {
			return [
				`${route.file} has no beforeLoad guard, so a role below its floor reaches the form and is refused at the save. Call isBelowWriteFloor(context, '${route.path}') and throw a redirect.`,
			];
		}
		return guard[1] === route.path
			? []
			: [
					`${route.file} guards against '${guard[1]}' rather than its own path '${route.path}', so it reads a floor belonging to another surface.`,
				];
	});
}

function inlineRoles(routes) {
	return routes
		.filter((route) => INLINE_ROLE.test(route.text))
		.map(
			(route) =>
				`${route.file} names a role at the call site. A floor is one fact: put it in the register and guard with isBelowWriteFloor.`,
		);
}

function stale(routes, floors) {
	const paths = new Set(routes.map((route) => route.path));
	return [...floors]
		.filter((path) => !paths.has(path))
		.map(
			(path) =>
				`the register carries a floor for '${path}', which is not a route in this app. Delete the entry or fix the path.`,
		);
}

const short = (path) => pathFrom(workspaceRoot, path);

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function fail(message) {
	console.error(`check-write-surfaces: ${message}`);
	process.exit(1);
}

function report(problems, surfaceCount, floorCount) {
	if (problems.length > 0) {
		const count = problems.length === 1 ? '1 problem' : `${problems.length} problems`;
		console.error(`check-write-surfaces: ${count}.\n`);
		for (const problem of problems) {
			console.error(`  ${problem}`);
		}
		console.error(`\nThe register is ${short(REGISTER)}.`);
		process.exit(1);
	}
	console.log(
		`check-write-surfaces: ${surfaceCount} write surfaces, each guarded at one of the ${floorCount} floors in the register.`,
	);
}

main();
