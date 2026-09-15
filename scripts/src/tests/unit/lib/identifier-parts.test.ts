/**
 * The part split the identifier half of `check-vocabulary.mjs` reads the tree
 * through.
 *
 * The rule is that an identifier spells a refused word when one of the parts
 * its case convention separates is exactly that word. A splitter one notch too
 * wide reads `useLiveQuery` as saying `user`; one notch too narrow reads
 * `HabitatSite` as one part and says nothing. The gate's own `PROBES` hold
 * seven of those shapes at run time; this suite holds the rest of the table,
 * because the shapes are the whole contract and each is one line to state.
 */

import { describe, expect, it } from 'vitest';
import { identifiersIn, partsOf, spells } from '../../../../lib/identifier-parts.mjs';
import { maskedSource } from '../../../../lib/masked-source.mjs';

describe('partsOf', () => {
	it('splits camelCase on each capital', () => {
		expect(partsOf('useLiveQuery')).toEqual(['use', 'Live', 'Query']);
		expect(partsOf('siteName')).toEqual(['site', 'Name']);
	});

	it('splits PascalCase the same way', () => {
		expect(partsOf('HabitatSite')).toEqual(['Habitat', 'Site']);
	});

	it('splits snake_case on the underscore and drops it', () => {
		expect(partsOf('user_id')).toEqual(['user', 'id']);
		expect(partsOf('__proto__')).toEqual(['proto']);
	});

	it('splits SCREAMING_SNAKE into whole words', () => {
		expect(partsOf('TENANT_ID')).toEqual(['TENANT', 'ID']);
	});

	it('keeps a run of capitals together until the one that opens a word', () => {
		expect(partsOf('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
		expect(partsOf('getURLSite')).toEqual(['get', 'URL', 'Site']);
	});

	it('reads a run of digits as a part of its own', () => {
		expect(partsOf('md5Site')).toEqual(['md', '5', 'Site']);
		expect(partsOf('site2')).toEqual(['site', '2']);
	});

	it('treats a dollar sign as a separator', () => {
		expect(partsOf('$site')).toEqual(['site']);
	});
});

describe('spells', () => {
	it('matches a part exactly, lower-cased', () => {
		expect(spells('siteName', 'site')).toBe(true);
		expect(spells('HabitatSite', 'site')).toBe(true);
		expect(spells('agency_id', 'agency')).toBe(true);
		expect(spells('SEAT_COUNT', 'seat')).toBe(true);
	});

	it('does not match a prefix or a suffix of a part', () => {
		expect(spells('useLiveQuery', 'user')).toBe(false);
		expect(spells('website', 'site')).toBe(false);
		expect(spells('sites', 'site')).toBe(false);
	});
});

describe('identifiersIn', () => {
	it('reads every token off the masked source, keys and attributes included', () => {
		const source = 'const a = { site: 1 };\n<Row site="x" />;\n';
		const names = identifiersIn(maskedSource(source)).map((identifier) => identifier.name);
		// The attribute's value is a string body and is masked; its name is a token.
		expect(names).toEqual(['const', 'a', 'site', 'Row', 'site']);
	});

	it('reads nothing out of a comment or a string', () => {
		const source = "// siteName\nconst label = 'siteName';\n/* HabitatSite */\n";
		const names = identifiersIn(maskedSource(source)).map((identifier) => identifier.name);
		expect(names).toEqual(['const', 'label']);
	});

	it('reports an index a line count off the source can use', () => {
		const source = 'const a = 1;\nconst siteName = 2;\n';
		const found = identifiersIn(maskedSource(source)).find(
			(identifier) => identifier.name === 'siteName',
		);
		expect(found?.index).toBe(source.indexOf('siteName'));
	});
});
