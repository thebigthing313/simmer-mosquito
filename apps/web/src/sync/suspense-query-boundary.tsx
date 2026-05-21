import type React from 'react';
import { Component, Suspense } from 'react';

interface SuspenseQueryBoundaryProps {
	readonly children: React.ReactNode;
	readonly errorFallback?: React.ReactNode;
	readonly loadingFallback: React.ReactNode;
	readonly resetKey?: string;
}

interface SuspenseQueryBoundaryState {
	readonly error: Error | null;
}

export function SuspenseQueryBoundary({
	children,
	errorFallback,
	loadingFallback,
	resetKey,
}: SuspenseQueryBoundaryProps) {
	const boundaryProps =
		resetKey === undefined
			? { fallback: errorFallback ?? null }
			: { fallback: errorFallback ?? null, resetKey };

	return (
		<QueryErrorBoundary {...boundaryProps}>
			<Suspense fallback={loadingFallback}>{children}</Suspense>
		</QueryErrorBoundary>
	);
}

class QueryErrorBoundary extends Component<
	{
		readonly children: React.ReactNode;
		readonly fallback: React.ReactNode;
		readonly resetKey?: string;
	},
	SuspenseQueryBoundaryState
> {
	override state: SuspenseQueryBoundaryState = {
		error: null,
	};

	static getDerivedStateFromError(error: Error): SuspenseQueryBoundaryState {
		return { error };
	}

	override componentDidUpdate(previousProps: { readonly resetKey?: string }) {
		if (this.state.error !== null && previousProps.resetKey !== this.props.resetKey) {
			this.setState({ error: null });
		}
	}

	override render() {
		if (this.state.error !== null) {
			return this.props.fallback;
		}

		return this.props.children;
	}
}
