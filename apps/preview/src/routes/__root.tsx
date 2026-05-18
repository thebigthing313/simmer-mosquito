import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	BoxIcon,
	ComponentIcon,
	ContrastIcon,
	MoonIcon,
	PanelLeftIcon,
	PuzzleIcon,
	ScanEyeIcon,
	SettingsIcon,
	SunIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

const navItems = [
	{ to: '/design-tokens', label: 'Design Tokens', icon: ContrastIcon },
	{ to: '/icons', label: 'Icon Registry', icon: SettingsIcon },
	{ to: '/kitchen-sink', label: 'Kitchen Sink', icon: ComponentIcon },
	{ to: '/sandbox', label: 'Sandbox', icon: PuzzleIcon },
	{ to: '/templates', label: 'Templates & A11y', icon: ScanEyeIcon },
] as const;

export const Route = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	const [darkMode, setDarkMode] = useState(false);

	useEffect(() => {
		document.documentElement.classList.toggle('dark', darkMode);
	}, [darkMode]);

	return (
		<div className="preview-shell">
			<aside className="preview-sidebar" aria-label="Preview navigation">
				<div className="preview-brand">
					<div className="preview-brand-mark">
						<BoxIcon aria-hidden="true" />
					</div>
					<div>
						<strong>SIMMER Preview</strong>
						<span>Living styleguide</span>
					</div>
				</div>
				<nav className="preview-nav">
					{navItems.map((item) => (
						<Link
							activeProps={{ className: 'is-active' }}
							className="preview-nav-link"
							key={item.to}
							to={item.to}
						>
							<item.icon aria-hidden="true" />
							<span>{item.label}</span>
						</Link>
					))}
				</nav>
				<Separator />
				<div className="preview-sidebar-note">
					<span>Phase 1-2</span>
					<p>Token gallery wired to shared CSS variables and local UI primitives.</p>
				</div>
			</aside>
			<div className="preview-workspace">
				<header className="preview-topbar">
					<div className="preview-topbar-title">
						<PanelLeftIcon aria-hidden="true" />
						<span>Component Workshop</span>
					</div>
					<fieldset className="preview-controls">
						<legend>Global preview controls</legend>
						<Button size="sm" variant="outline" type="button">
							<SunIcon aria-hidden="true" />
							<span>Light</span>
						</Button>
						<Switch
							aria-label="Toggle dark mode"
							checked={darkMode}
							onCheckedChange={setDarkMode}
						/>
						<Button size="icon-sm" variant="ghost" type="button" aria-label="Dark mode placeholder">
							<MoonIcon aria-hidden="true" />
						</Button>
					</fieldset>
				</header>
				<main className="preview-main">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
