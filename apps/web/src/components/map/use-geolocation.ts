import { useCallback, useEffect, useRef, useState } from 'react';

export type GeolocationStatus =
	| 'idle'
	| 'locating'
	| 'success'
	| 'denied'
	| 'unavailable'
	| 'error';

export interface GeolocationCoords {
	readonly longitude: number;
	readonly latitude: number;
	/** Accuracy radius in meters, as reported by the browser. */
	readonly accuracy: number;
}

export interface UseGeolocationResult {
	readonly status: GeolocationStatus;
	readonly coords: GeolocationCoords | null;
	readonly error: string | null;
	readonly isSupported: boolean;
	/** Request the device location; prompts for permission on first use. */
	readonly locate: () => void;
}

const GEOLOCATION_OPTIONS: PositionOptions = {
	enableHighAccuracy: true,
	timeout: 10_000,
	maximumAge: 30_000,
};

/**
 * Wraps the browser Geolocation API behind an intent-shaped interface: call
 * `locate()` and read `status`. Permission prompting, success, denial, timeout,
 * and unsupported environments all collapse into one status enum plus a
 * human-readable error, so the calling control stays declarative.
 *
 * @param onLocated invoked with fresh coordinates each successful fix.
 */
export function useGeolocation(
	onLocated?: (coords: GeolocationCoords) => void,
): UseGeolocationResult {
	const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
	const [status, setStatus] = useState<GeolocationStatus>(isSupported ? 'idle' : 'unavailable');
	const [coords, setCoords] = useState<GeolocationCoords | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Keep the latest callback without making `locate` change identity.
	const onLocatedRef = useRef(onLocated);
	onLocatedRef.current = onLocated;

	// Guard against setting state after the control unmounts mid-request.
	const isMounted = useRef(true);
	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);

	const locate = useCallback(() => {
		if (!isSupported) {
			setStatus('unavailable');
			setError('Location services are not available in this browser.');
			return;
		}

		setStatus('locating');
		setError(null);

		navigator.geolocation.getCurrentPosition(
			(position) => {
				if (!isMounted.current) {
					return;
				}
				const next: GeolocationCoords = {
					longitude: position.coords.longitude,
					latitude: position.coords.latitude,
					accuracy: position.coords.accuracy,
				};
				setCoords(next);
				setStatus('success');
				setError(null);
				onLocatedRef.current?.(next);
			},
			(positionError) => {
				if (!isMounted.current) {
					return;
				}
				if (positionError.code === positionError.PERMISSION_DENIED) {
					setStatus('denied');
					setError('Location permission was denied.');
					return;
				}
				setStatus('error');
				setError(
					positionError.code === positionError.TIMEOUT
						? 'Timed out while finding your location.'
						: 'Could not determine your location.',
				);
			},
			GEOLOCATION_OPTIONS,
		);
	}, [isSupported]);

	return { status, coords, error, isSupported, locate };
}
