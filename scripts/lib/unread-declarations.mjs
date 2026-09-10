/**
 * The declarations in one module whose name starts with an underscore and that
 * nothing in the module reads.
 *
 * `check-unread-declarations.mjs` is the gate over this; its header carries the
 * rule and the hole it closes. What is here is the detector alone, so the suite
 * at `scripts/src/tests/unit/lib/unread-declarations.test.ts` can hand it a
 * source string and read the answer back without a tree to walk.
 *
 * ## Bindings, not names
 *
 * The scan is a parse and the question is asked of a scope binding, which is
 * what keeps a name written inside a string or a comment from counting as a
 * read. A regex over the text would count both, and the gate would then go
 * quiet the moment somebody mentioned a dead constant in the docblock above it.
 * That is `check-compiler-coverage.mjs`'s conclusion about its own first draft,
 * reached here before rather than after.
 *
 * Asking it of a binding also settles shadowing for free: an outer `_x` that
 * nothing reads is dead even when an inner `_x` is read on every line of the
 * function below it, because those are two bindings.
 *
 * ## What is a declaration here
 *
 * `DECLARATION_TYPES` is the whole rule, and two shapes are deliberately not on
 * it.
 *
 * A parameter is out, because an unused parameter in a callback signature is
 * the case the underscore convention exists for: `(_event, index) => index`
 * takes the first argument to reach the second and there is nothing to delete.
 * A catch clause's binding is out for the same reason and falls out of the same
 * rule, since Babel hangs it off the `CatchClause` rather than off a
 * declaration.
 *
 * A destructuring pattern is out, which is the other half of that: `const
 * { intents: _intents, ...rest } = payload` names a property in order to drop
 * it from `rest`, so the binding is the mechanism rather than a leftover. So a
 * `VariableDeclarator` counts only when its id is a plain identifier, and #860
 * left eleven of those patterns standing across the workspace after deleting
 * the fifteen real ones.
 *
 * An ambient declaration is out. `declare const __APP_VERSION__: string` in
 * `apps/web/src/globals.d.ts` describes a constant Vite substitutes at build
 * time, so no module reads it under that name and none ever will.
 *
 * ## An export answers itself
 *
 * `export const _x = 1` and a bare `export { _x }` both mark the binding
 * referenced in Babel's own accounting, so an exported declaration never
 * reaches this as a finding. That is the seam rather than an oversight: whether
 * anything reads an export is a question over the whole graph, which one module
 * cannot answer, and `fallow dead-code` gates unused exports at zero. This has
 * the module-private half, which is the half neither `fallow` nor Biome sees.
 */

import { parseSync, traverse } from '@babel/core';

/**
 * The node types a binding's own path may be, for the binding to be a
 * declaration this reads.
 *
 * An import is on the list even though the workspace holds no
 * underscore-prefixed one today. Biome's `noUnusedImports` is an error here and
 * the underscore prefix is what silences it, so an import is the same claim in
 * the same syntax as a `const`, and leaving it off would take the next one out
 * of scope rather than report it.
 */
const DECLARATION_TYPES = new Set([
	'VariableDeclarator',
	'FunctionDeclaration',
	'ClassDeclaration',
	'ImportSpecifier',
	'ImportDefaultSpecifier',
	'ImportNamespaceSpecifier',
	'TSTypeAliasDeclaration',
	'TSInterfaceDeclaration',
	'TSEnumDeclaration',
	'TSModuleDeclaration',
]);

/**
 * The parser plugins one module is read with.
 *
 * `jsx` is added for `.tsx` and refused for `.ts`, which is
 * `check-compiler-coverage.mjs`'s rule for the same reason: TypeScript spells a
 * generic call `f<T>(x)`, and with `jsx` on the parser reads the first `<` as a
 * tag.
 */
const parserPluginsFor = (path) => (path.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript']);

/** Whether a binding was introduced by a declaration this gate reads. */
const isDeclaration = (binding) => {
	const node = binding.path.node;

	if (!DECLARATION_TYPES.has(node.type)) {
		return false;
	}
	if (node.type === 'VariableDeclarator' && node.id.type !== 'Identifier') {
		return false;
	}
	return node.declare !== true && binding.path.parent?.declare !== true;
};

/**
 * Every underscore-prefixed declaration in one module that nothing reads.
 *
 * A parse error is thrown rather than answered as "nothing found", because a no
 * from a broken parse is the silent pass the gate exists to remove. The caller
 * turns it into a refusal naming the file.
 *
 * @param {string} path The module's path, which decides the parser plugins and names the error.
 * @param {string} source The module, as written.
 * @returns {Array<{ name: string, line: number }>} Findings, in source order.
 */
export function unreadDeclarations(path, source) {
	const ast = parseSync(source, {
		babelrc: false,
		configFile: false,
		filename: path,
		sourceType: 'module',
		parserOpts: { plugins: parserPluginsFor(path) },
	});

	const seen = new Set();
	const findings = [];

	traverse(ast, {
		Scopable(scopePath) {
			for (const [name, binding] of Object.entries(scopePath.scope.bindings)) {
				if (!name.startsWith('_') || seen.has(binding)) {
					continue;
				}
				seen.add(binding);

				if (!binding.referenced && isDeclaration(binding)) {
					findings.push({ name, line: binding.identifier.loc?.start.line ?? 0 });
				}
			}
		},
	});

	return findings.sort((one, other) => one.line - other.line);
}
