import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import {
	iconRegistryEntries,
	iconRegistryGroups,
	SearchIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createElement, useMemo, useState } from 'react';

export const Route = createFileRoute('/icons')({
	component: IconsPage,
});

function IconsPage() {
	const [query, setQuery] = useState('');
	const filteredGroups = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (normalizedQuery.length === 0) {
			return iconRegistryGroups;
		}

		return iconRegistryGroups
			.map((group) => ({
				...group,
				entries: group.entries.filter((entry) =>
					`${entry.name} ${entry.label} ${entry.category} ${entry.source}`
						.toLowerCase()
						.includes(normalizedQuery),
				),
			}))
			.filter((group) => group.entries.length > 0);
	}, [query]);

	return (
		<div className="workshop-page">
			<header className="preview-page-header">
				<div>
					<p className="preview-eyebrow">Registry</p>
					<h1>Icon Registry</h1>
				</div>
				<p>
					Web frontends should consume registered semantic icons from `ui-web`, not import icon
					libraries directly.
				</p>
			</header>

			<section className="preview-section" aria-labelledby="registered-icons">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Registered sources</p>
						<h2 id="registered-icons">{iconRegistryEntries.length} registered icons</h2>
					</div>
					<div className="icon-search">
						<SearchIcon aria-hidden="true" />
						<Input
							aria-label="Search registered icons"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search registry"
							value={query}
						/>
					</div>
				</div>
				<ScrollArea className="icon-scroll">
					<div className="icon-registry">
						{filteredGroups.map((group) => (
							<section className="icon-registry-group" key={group.category}>
								<div className="icon-registry-heading">
									<h3>{group.category}</h3>
									<span>{group.entries.length}</span>
								</div>
								<div className="icon-grid">
									{group.entries.map((entry) => (
										<div className="icon-cell" key={`${group.category}-${entry.name}`}>
											{createElement(entry.icon, { 'aria-hidden': true })}
											<span>{entry.name}</span>
											<code className="icon-cell-label">{entry.label}</code>
											<code className="icon-cell-source">{entry.source}</code>
										</div>
									))}
								</div>
							</section>
						))}
					</div>
				</ScrollArea>
			</section>
		</div>
	);
}
