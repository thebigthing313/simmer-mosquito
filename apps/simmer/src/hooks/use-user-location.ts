import { useEffect, useState } from 'react';

interface Coordinates {
	lat: number;
	lng: number;
}

export function useUserLocation() {
	const [location, setLocation] = useState<Coordinates | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!navigator.geolocation) {
			setIsLoading(false);
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(position) => {
				setLocation({
					lat: position.coords.latitude,
					lng: position.coords.longitude,
				});
				setIsLoading(false);
			},
			(error) => {
				// Permission denied or other error
				console.error('Error getting user location:', error);
				setLocation(null);
				setIsLoading(false);
			},
		);
	}, []);

	return { location, isLoading };
}
