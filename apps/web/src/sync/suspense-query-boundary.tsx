import type React from 'react';
import { Component, Suspense } from 'react';

/**
 * The error fallback, either as a fixed node or as a render function.
 *
 * The function form exists because a fallback that cannot see what was thrown
 * can only say "something failed", which leaves the reader with nothing to
 * report. `reset` clears the caught error and re-renders the children, so a
 * fallback can offer a retry that does not cost a full page load.
 */
type ErrorFallback = React.ReactNode | ((error: unknown, reset: () => void) => React.ReactNode);

interface SuspenseQueryBoundaryProps {
	readonly children: React.ReactNode;
	readonly errorFallback?: ErrorFallback;
	readonly loadingFallback: React.ReactNode;
	readonly resetKey?: string;
}

interface SuspenseQueryBoundaryState {
	readonly error: unknown;
	readonly caught: boolean;
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
		readonly fallback: ErrorFallback;
		readonly resetKey?: string;
	},
	SuspenseQueryBoundaryState
> {
	// `caught` rather than a `null` error: a bare `throw` and a rejected
	// `undefined` both reach here as a thrown `undefined`, and a boundary that
	// tests the value for null renders its children again on the next commit.
	override state: SuspenseQueryBoundaryState = {
		error: undefined,
		caught: false,
	};

	static getDerivedStateFromError(error: unknown): SuspenseQueryBoundaryState {
		return { error, caught: true };
	}

	override componentDidUpdate(previousProps: { readonly resetKey?: string }) {
		if (this.state.caught && previousProps.resetKey !== this.props.resetKey) {
			this.reset();
		}
	}

	reset = () => {
		this.setState({ error: undefined, caught: false });
	};

	override render() {
		if (this.state.caught) {
			const { fallback } = this.props;
			return typeof fallback === 'function' ? fallback(this.state.error, this.reset) : fallback;
		}

		return this.props.children;
	}
}
