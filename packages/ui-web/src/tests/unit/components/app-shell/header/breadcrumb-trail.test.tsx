// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	BreadcrumbLabelProvider,
	useBreadcrumbTrail,
} from '../../../../../components/app-shell/breadcrumb-labels';
import { AppHeader } from '../../../../../components/app-shell/header/app-header';
import { ShellProvider } from '../../../../../components/app-shell/shell-context';
import type { ShellCrumb, ShellDomain } from '../../../../../components/app-shell/types';
import { iconRegistry } from '../../../../../icons/registry';

/**
 * A page that replaces the trail gets its trail, and the resolved one comes
 * back when it unmounts.
 *
 * The not-found page is the caller: a path no route matched resolves to no
 * navigation item, so the built trail named the first domain as though the
 * reader were in it.
 */

const ORGANIZATION = { id: 'org-1', name: 'Kern' };
const OVERVIEW: ShellDomain = {
	id: 'overview',
	label: 'Overview',
	icon: iconRegistry.generic.component.icon,
	groups: [{ id: 'overview-main', items: [{ id: 'dashboard', label: 'Dashboard', to: '/' }] }],
};
const TRAIL: readonly ShellCrumb[] = [{ label: 'Page not found' }];

function Replacer() {
	useBreadcrumbTrail(TRAIL);
	return null;
}

function Harness({ shown }: { readonly shown: boolean }) {
	return (
		<ShellProvider
			activePath="/nowhere/at-all"
			currentOrganization={ORGANIZATION}
			domains={[OVERVIEW]}
			onNavigate={() => {}}
			onSelectOrganization={() => {}}
			organizations={[ORGANIZATION]}
			user={{ name: 'Ada', email: 'ada@example.test' }}
		>
			<BreadcrumbLabelProvider>
				<AppHeader />
				{shown ? <Replacer /> : null}
			</BreadcrumbLabelProvider>
		</ShellProvider>
	);
}

afterEach(cleanup);

describe('useBreadcrumbTrail', () => {
	it('replaces the resolved trail while mounted and restores it after', async () => {
		const { rerender } = render(<Harness shown={true} />);

		expect(await screen.findByText('Page not found')).toBeTruthy();
		expect(screen.queryByText('Overview')).toBeNull();

		act(() => rerender(<Harness shown={false} />));

		expect(screen.queryByText('Page not found')).toBeNull();
		expect(screen.getByText('Overview')).toBeTruthy();
	});
});
