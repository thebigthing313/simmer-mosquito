/**
 * The page's name reads the leaf first and then its parent.
 *
 * `index.html` named every page `SIMMER`, so each tab, each history entry and
 * each screen-reader page change said the same word. The name comes off the
 * breadcrumb trail now, and two crumbs rather than one because a leaf such as
 * `Map` is shared by several domains.
 */

import { describe, expect, it } from 'vitest';
import { pageTitle } from '../../../../../components/app-shell/header/route-announcer';

describe('pageTitle', () => {
	it('names the leaf, then its parent', () => {
		expect(pageTitle(['Operations', 'Control Missions', 'Map'])).toBe('Map · Control Missions');
	});

	it('names a one-crumb trail by that crumb alone', () => {
		expect(pageTitle(['Dashboard'])).toBe('Dashboard');
	});

	it('skips a blank crumb rather than drawing an empty slot', () => {
		expect(pageTitle(['Habitats', ' '])).toBe('Habitats');
	});

	it('is empty for an empty trail, which leaves the shipped title alone', () => {
		expect(pageTitle([])).toBe('');
	});
});
