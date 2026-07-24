import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { ComponentType, SVGProps } from 'react';

/**
 * Pre-shell surfaces: the unauthenticated landing page and the chrome
 * loading/error fallbacks used by the root route. The authenticated shell lives
 * in `components/app-shell`.
 *
 * The landing page is the one product surface that earns a committed brand
 * treatment: a drenched-green "map room" stage carrying the real SIMMER logo,
 * paired with a calm, focused sign-in panel.
 */

const BrandMark = iconRegistry.simmer.brandMark.icon;
const SurveillanceIcon = iconRegistry.generic.scanEye.icon;
const ControlIcon = iconRegistry.domains.controlOperations.icon;
const EngagementIcon = iconRegistry.domains.publicEngagement.icon;
const WarningIcon = iconRegistry.actions.warning.icon;

type LandingCapability = {
	readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
	readonly title: string;
	readonly detail: string;
};

const CAPABILITIES: readonly LandingCapability[] = [
	{
		icon: SurveillanceIcon,
		title: 'Surveillance in the field',
		detail: 'Larval and adult populations tracked across every habitat and trap.',
	},
	{
		icon: ControlIcon,
		title: 'Control operations, coordinated',
		detail: 'Treatments, source reduction, and biocontrol planned where the work happens.',
	},
	{
		icon: EngagementIcon,
		title: 'Public requests to dispatch',
		detail: 'Service requests routed from residents straight into field work.',
	},
];

export function LandingPage({
	authReason,
	redirectTo,
}: {
	readonly authReason?: 'organization_required';
	readonly redirectTo: string;
}) {
	const redirectPath = toRedirectPath(redirectTo);

	return (
		<div className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-1">
			<LandingStage />
			<LandingEntry authReason={authReason} redirectPath={redirectPath} />
		</div>
	);
}

/** The committed brand stage: real logo, value proposition, and capability list. */
function LandingStage() {
	return (
		<section className="landing-stage relative isolate flex flex-col overflow-hidden px-8 py-10 text-white sm:px-10 sm:py-12 lg:min-h-screen lg:px-14 lg:py-14">
			<div className="landing-rise relative z-10 flex flex-1 flex-col justify-between gap-9 lg:gap-14">
				<img
					src="/logo.svg"
					alt="SIMMER"
					width={248}
					height={122}
					className="landing-logo w-[190px] max-w-[58%] lg:w-[240px]"
				/>

				<div className="flex flex-col justify-center gap-6 lg:gap-7">
					<h1 className="m-0 max-w-[16ch] text-balance font-bold text-[clamp(1.95rem,1.2rem+2.4vw,2.9rem)] leading-[1.08] tracking-[-0.02em]">
						Run mosquito control from one living map.
					</h1>
					<p className="m-0 max-w-[48ch] text-pretty text-[1.02rem] leading-relaxed text-simmer-green-100">
						Surveillance, field operations, and public requests stay tied to the ground they happen
						on — so your team sees what needs attention next, and acts on it without leaving the
						map.
					</p>

					<ul className="m-0 mt-1 grid list-none gap-4 p-0">
						{CAPABILITIES.map(({ icon: Icon, title, detail }) => (
							<li key={title} className="flex items-start gap-3.5">
								<span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-white/10 text-white ring-1 ring-inset ring-white/15">
									<Icon className="size-[1.15rem]" aria-hidden="true" />
								</span>
								<div className="grid gap-0.5">
									<p className="m-0 text-[0.95rem] font-semibold leading-tight text-white">
										{title}
									</p>
									<p className="m-0 max-w-[42ch] text-[0.86rem] leading-snug text-simmer-green-100">
										{detail}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>

				<p className="m-0 text-[0.85rem] leading-normal text-simmer-green-100/90">
					Built for the mosquito control and surveillance agencies that keep communities protected.
				</p>
			</div>
		</section>
	);
}

/** The calm entry panel: welcome copy, the sign-in actions, and account recovery. */
function LandingEntry({
	authReason,
	redirectPath,
}: {
	readonly authReason: 'organization_required' | undefined;
	readonly redirectPath: string;
}) {
	return (
		<section className="landing-fade flex items-center justify-center bg-(--app-stage) px-6 py-12 sm:px-10">
			<div className="flex w-full max-w-[420px] flex-col gap-7">
				<div className="grid gap-2">
					<h2 className="m-0 text-[1.5rem] font-bold leading-tight text-foreground">
						Welcome back
					</h2>
					<p className="m-0 leading-normal text-muted-foreground">
						Sign in to your agency workspace, or create an account to get started.
					</p>
				</div>

				{authReason === 'organization_required' ? (
					<Alert className="border-warning/30 bg-[color-mix(in_oklch,var(--warning-bg)_60%,var(--card))] text-foreground">
						<WarningIcon className="text-warning" />
						<AlertTitle>Organization access needed</AlertTitle>
						<AlertDescription className="text-muted-foreground">
							You&rsquo;re signed in, but no active SIMMER organization is selected for your
							account. Choose or request an organization to continue.
						</AlertDescription>
					</Alert>
				) : null}

				<div className="grid gap-2.5">
					<Button asChild size="lg" className="w-full">
						<Link to="/sign-in" search={{ redirect: redirectPath }}>
							Sign in
						</Link>
					</Button>
					<Button asChild size="lg" variant="outline" className="w-full">
						<Link to="/sign-up" search={{ redirect: redirectPath }}>
							Create an account
						</Link>
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border/60 pt-5 text-sm">
					<span className="text-muted-foreground">Trouble signing in?</span>
					<Link
						to="/forgot-password"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Reset your password
					</Link>
				</div>
			</div>
		</section>
	);
}

/** Normalizes a landing `redirect` (which may be an absolute URL) to a same-origin path. */
function toRedirectPath(redirectTo: string): string {
	if (redirectTo.startsWith('/')) {
		return redirectTo;
	}

	try {
		const url = new URL(redirectTo);
		return `${url.pathname}${url.search}${url.hash}` || '/';
	} catch {
		return '/';
	}
}

export function WorkspaceChromeFallback() {
	return (
		<div className="grid min-h-screen place-items-center bg-(--app-stage) p-6">
			<Card variant="surface" className="w-[min(420px,100%)]">
				<CardContent padding="default" className="grid gap-3">
					<BrandMark aria-label="SIMMER" role="img" className="size-8" />
					<strong className="text-[1rem] text-foreground">Loading workspace</strong>
				</CardContent>
			</Card>
		</div>
	);
}

export function WorkspaceChromeError() {
	return (
		<div className="grid min-h-screen place-items-center bg-(--app-stage) p-6">
			<Card variant="surface" className="w-[min(460px,100%)]">
				<CardContent padding="default" className="grid gap-4">
					<div className="grid gap-2">
						<BrandMark aria-label="SIMMER" role="img" className="size-8" />
						<strong className="text-[1rem] text-foreground">Unable to load workspace data</strong>
					</div>
					<Button type="button" onClick={() => window.location.reload()}>
						Reload
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
