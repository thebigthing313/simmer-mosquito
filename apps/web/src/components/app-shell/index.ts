export { AppHeader } from './header/app-header';
export { HeaderSearchBar } from './header/header-search-bar';
export { buildBreadcrumbs, firstDestination, resolveActive, shellDomains } from './navigation';
export { OutletShell } from './outlet/outlet-shell';
export { OutletSimpleLayout } from './outlet/simple-layout';
export { PrimarySidebar } from './primary-sidebar/primary-sidebar';
export { SecondarySidebar } from './secondary-sidebar/secondary-sidebar';
export { type ShellContextValue, ShellProvider, useShell } from './shell-context';
export type {
	ShellCrumb,
	ShellDomain,
	ShellNavGroup,
	ShellNavItem,
	ShellOrganization,
	ShellUser,
} from './types';
