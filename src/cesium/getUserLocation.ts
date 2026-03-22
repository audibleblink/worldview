/**
 * WorldView - Browser Geolocation Utility
 * Wraps navigator.geolocation.getCurrentPosition in a Promise with a timeout.
 * Returns null on any failure (denied, unavailable, timeout).
 */

const TIMEOUT_MS = 3000;

export interface UserLocation {
  lat: number;
  lng: number;
}

/**
 * Attempt to get the user's current position from the browser.
 * Resolves with { lat, lng } on success, or null on any failure.
 * Never rejects — all errors are caught and mapped to null.
 */
export function getUserLocation(): Promise<UserLocation | null> {
  if (!navigator.geolocation) return Promise.resolve(null);

  return new Promise<UserLocation | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: TIMEOUT_MS, enableHighAccuracy: false },
    );
  });
}
