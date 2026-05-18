import { green, yellow } from '@simmer-mosquito/design-tokens';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { createFileRoute } from '@tanstack/react-router';
import { contrastRatio, formatHex, formatRgb, parseCssColor } from '../color';
import { useCssTokens } from '../useCssTokens';

export const Route = createFileRoute('/design-tokens')({
	component: DesignTokensPage,
});

const brandRampTokens = [
	'--simmer-green-50',
	'--simmer-green-100',
	'--simmer-green-200',
	'--simmer-green-300',
	'--simmer-green-400',
	'--simmer-green-500',
	'--simmer-green-600',
	'--simmer-green-700',
	'--simmer-green-800',
	'--simmer-green-900',
	'--simmer-yellow-50',
	'--simmer-yellow-100',
	'--simmer-yellow-200',
	'--simmer-yellow-300',
	'--simmer-yellow-400',
	'--simmer-yellow-500',
	'--simmer-yellow-600',
	'--simmer-yellow-700',
	'--simmer-yellow-800',
	'--simmer-yellow-900',
] as const;

const aliasTokens = [
	'--simmer-green',
	'--simmer-dark-green',
	'--simmer-darker-green',
	'--simmer-yellow',
] as const;

const semanticColorTokens = [
	'--simmer-purple',
	'--simmer-red',
	'--simmer-blue',
	'--background',
	'--foreground',
	'--card',
	'--primary',
	'--secondary',
	'--muted',
	'--accent',
	'--destructive',
	'--border',
	'--input',
	'--ring',
	'--chart-1',
	'--chart-2',
	'--chart-3',
	'--chart-4',
	'--chart-5',
	'--success',
	'--info',
	'--catalog',
	'--danger',
	'--warning',
] as const;

const typeSamples = [
	{ name: 'Header 1', className: 'token-type-h1', meta: '1.5rem / 1.2 / 800' },
	{ name: 'Header 2', className: 'token-type-h2', meta: '1.125rem / 1.2 / 800' },
	{ name: 'Body', className: 'token-type-body', meta: '1rem / 1.55 / 400' },
	{ name: 'Small', className: 'token-type-small', meta: '0.875rem / 1.4 / 500' },
	{ name: 'Caption', className: 'token-type-caption', meta: '0.75rem / 1.2 / 800' },
] as const;

const spacingTokens = [
	['xs', 4],
	['sm', 8],
	['md', 16],
	['lg', 24],
	['xl', 32],
] as const;

function DesignTokensPage() {
	const brandRampCssTokens = useCssTokens(brandRampTokens);
	const aliasCssTokens = useCssTokens(aliasTokens);
	const semanticCssTokens = useCssTokens(semanticColorTokens);
	const greenRamp = brandRampCssTokens.slice(0, 10);
	const yellowRamp = brandRampCssTokens.slice(10);
	return (
		<div className="token-page">
			<header className="preview-page-header">
				<div>
					<p className="preview-eyebrow">System primitives</p>
					<h1>Design Tokens</h1>
				</div>
				<p>
					Live values from shared token exports and CSS variables, rendered as operational checks
					instead of static documentation.
				</p>
			</header>

			<section className="preview-section" aria-labelledby="color-palette">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Color</p>
						<h2 id="color-palette">Palette</h2>
					</div>
					<Badge tone="info" variant="outline">
						{brandRampTokens.length + semanticColorTokens.length} tokens
					</Badge>
				</div>
				<div className="brand-ramp-grid">
					<ColorRamp title="Brand Green" tokens={greenRamp} exportedScale={green} />
					<ColorRamp title="Brand Yellow" tokens={yellowRamp} exportedScale={yellow} />
				</div>
				<ul className="alias-strip" aria-label="Legacy brand aliases">
					{aliasCssTokens.map((token) => (
						<AliasChip key={token.name} name={token.name} value={token.value} />
					))}
				</ul>
				<div className="color-grid">
					{semanticCssTokens.map((token) => (
						<ColorSwatch key={token.name} name={token.name} value={token.value} />
					))}
				</div>
			</section>

			<div className="token-two-column">
				<section className="preview-section" aria-labelledby="typography-scale">
					<div className="preview-section-header">
						<div>
							<p className="preview-eyebrow">Type</p>
							<h2 id="typography-scale">Typography</h2>
						</div>
					</div>
					<div className="type-stack">
						{typeSamples.map((sample) => (
							<div className="type-row" key={sample.name}>
								<div>
									<span>{sample.name}</span>
									<strong className={sample.className}>Mosquito control field records</strong>
								</div>
								<code>{sample.meta}</code>
							</div>
						))}
					</div>
				</section>

				<section className="preview-section" aria-labelledby="spacing-scale">
					<div className="preview-section-header">
						<div>
							<p className="preview-eyebrow">Rhythm</p>
							<h2 id="spacing-scale">Spacing</h2>
						</div>
					</div>
					<div className="spacing-stack">
						{spacingTokens.map(([name, size]) => (
							<div className="spacing-row" key={name}>
								<span>{name}</span>
								<div style={{ width: `${size * 3}px` }} />
								<code>{size}px</code>
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	);
}

function ColorRamp({
	title,
	tokens,
	exportedScale,
}: {
	readonly title: string;
	readonly tokens: readonly { readonly name: string; readonly value: string }[];
	readonly exportedScale: Record<string, string>;
}) {
	return (
		<div className="color-ramp">
			<div className="color-ramp-header">
				<strong>{title}</strong>
				<span>50-900</span>
			</div>
			<div className="color-ramp-swatches">
				{tokens.map((token) => {
					const stop = token.name.split('-').at(-1) ?? '';
					return (
						<div className="ramp-stop" key={token.name}>
							<div style={{ background: `var(${token.name})` }} />
							<span>{stop}</span>
							<code>{exportedScale[stop] ?? token.value}</code>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function AliasChip({ name, value }: { readonly name: string; readonly value: string }) {
	return (
		<li className="alias-chip">
			<span style={{ background: `var(${name})` }} />
			<strong>{name}</strong>
			<code>{value}</code>
		</li>
	);
}

function ColorSwatch({ name, value }: { readonly name: string; readonly value: string }) {
	const rgb = parseCssColor(value);
	const onSurfaceRatio = rgb === null ? 0 : contrastRatio(rgb, { r: 250, g: 251, b: 250 });
	const onTextRatio = rgb === null ? 0 : contrastRatio(rgb, { r: 36, g: 49, b: 55 });
	const bestRatio = Math.max(onSurfaceRatio, onTextRatio);
	const safety = bestRatio >= 4.5 ? 'AA' : bestRatio >= 3 ? 'Large text' : 'Low';

	return (
		<article className="color-card">
			<div className="color-swatch" style={{ background: `var(${name})` }} />
			<div className="color-card-body">
				<div className="color-card-title">
					<strong>{name}</strong>
					<Badge
						tone={bestRatio >= 4.5 ? 'success' : bestRatio >= 3 ? 'warning' : 'danger'}
						variant="outline"
					>
						{safety}
					</Badge>
				</div>
				<code>{value}</code>
				{rgb === null ? null : (
					<>
						<code>{formatHex(rgb)}</code>
						<code>{formatRgb(rgb)}</code>
					</>
				)}
			</div>
		</article>
	);
}
