import { useControlMethodNames } from '../explorer/use-control-method-names';

/**
 * The recommended method's name, searched across all four control method
 * catalogs.
 */
export function useRecommendedMethodName(methodId: string | null): string | null {
	const methodNameById = useControlMethodNames();
	return methodId === null ? null : (methodNameById.get(methodId) ?? 'Unknown method');
}
