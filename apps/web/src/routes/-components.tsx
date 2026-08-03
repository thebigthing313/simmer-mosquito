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

/**
 * The three capabilities are the three integrated mosquito management tactics
 * SIMMER covers today, ordered the way a program runs them. Copy stays
 * descriptive: the reader runs a mosquito control agency and does not need the
 * value of surveillance explained back to them.
 */
const CAPABILITIES: readonly LandingCapability[] = [
	{
		icon: SurveillanceIcon,
		title: 'Surveillance',
		detail:
			'Larval and adult populations tracked per habitat, trap, and collection, against your action thresholds.',
	},
	{
		icon: ControlIcon,
		title: 'Control operations',
		detail:
			'Source reduction, biocontrol, and insecticide applications recorded with product, rate, and treated area.',
	},
	{
		icon: EngagementIcon,
		title: 'Community engagement',
		detail:
			'Service requests and the contacts behind them, kept alongside the field data they belong to.',
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

	// Locked to the viewport at desktop widths, like the shell it introduces:
	// each column owns its own overflow, so the window itself never scrolls.
	return (
		<div className="grid min-h-svh grid-rows-[auto_1fr] lg:h-svh lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-1">
			<LandingStage />
			<LandingEntry authReason={authReason} redirectPath={redirectPath} />
		</div>
	);
}

/** The committed brand stage: real logo, value proposition, and capability list. */
function LandingStage() {
	return (
		<section className="landing-stage relative isolate flex min-h-0 flex-col overflow-hidden px-(--landing-pad-x) py-(--landing-pad-y) text-white">
			<div className="landing-rise relative z-10 flex flex-1 flex-col justify-between gap-(--landing-gap)">
				<div className="grid gap-2">
					<img
						src="/logo.svg"
						alt="SIMMER"
						width={248}
						height={122}
						className="landing-logo w-(--landing-logo) max-w-[58%]"
					/>
					<p className="m-0 max-w-[64ch] text-[0.72rem] font-medium uppercase leading-snug tracking-[0.14em] text-simmer-green-100/80">
						Strategic Integrated Mosquito Management Enterprise Resources
					</p>
				</div>

				<div className="flex flex-col justify-center gap-(--landing-gap-tight)">
					<h1 className="m-0 max-w-[24ch] text-balance font-bold text-(length:--landing-display) leading-[1.08] tracking-[-0.02em]">
						Integrated mosquito management, on one living map.
					</h1>
					<p className="m-0 max-w-[62ch] text-pretty text-[1.02rem] leading-relaxed text-simmer-green-100">
						Surveillance, control operations, and public requests stay tied to the ground they
						happen on, so every decision rests on the data your program collected.
					</p>

					<ul className="m-0 grid list-none gap-(--landing-gap-tight) p-0">
						{CAPABILITIES.map(({ icon: Icon, title, detail }) => (
							<li key={title} className="flex items-start gap-3.5">
								<span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-white/10 text-white ring-1 ring-inset ring-white/15">
									<Icon className="size-[1.15rem]" aria-hidden="true" />
								</span>
								<div className="grid gap-0.5">
									<p className="m-0 text-[0.95rem] font-semibold leading-tight text-white">
										{title}
									</p>
									<p className="m-0 max-w-[54ch] text-[0.86rem] leading-snug text-simmer-green-100">
										{detail}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>

				<p className="landing-tail m-0 max-w-[88ch] text-[0.85rem] leading-normal text-simmer-green-100/90">
					Built around the five tactics of integrated mosquito management, for the agencies that
					keep communities protected.
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
	// `m-auto` rather than `items-center`: a centred flex child in a scroll
	// container puts its own overflowing top out of reach. The entry animation
	// rides the panel, not the section — translating a full-height grid item
	// pushes the window into overflow for as long as it runs.
	return (
		<section className="flex min-h-0 overflow-y-auto bg-(--app-stage) px-6 py-12 sm:px-10">
			<div className="landing-fade m-auto flex w-full max-w-[420px] flex-col gap-7">
				<div className="grid gap-2">
					<h2 className="m-0 text-[1.5rem] font-bold leading-tight text-foreground">
						Welcome Back
					</h2>
					<p className="m-0 leading-normal text-muted-foreground">
						Sign in to your agency workspace, or create an account to get started.
					</p>
				</div>

				{authReason === 'organization_required' ? (
					<Alert className="border-warning/30 bg-[color-mix(in_oklch,var(--warning-bg)_60%,var(--card))] text-foreground">
						<WarningIcon className="text-warning" />
						<AlertTitle>Organization Access Needed</AlertTitle>
						<AlertDescription className="text-muted-foreground">
							You&rsquo;re signed in, but no active SIMMER organization is selected for your
							account. Choose or request an organization to continue.
						</AlertDescription>
					</Alert>
				) : null}

				<div className="grid gap-2.5">
					<Button asChild size="lg" className="w-full">
						<Link to="/sign-in" search={{ redirect: redirectPath }}>
							Sign In
						</Link>
					</Button>
					<Button asChild size="lg" variant="outline" className="w-full">
						<Link to="/sign-up" search={{ redirect: redirectPath }}>
							Create an Account
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
