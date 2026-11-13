import { t } from "../i18n";

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}

export function watchLocation(
  onPosition: (position: GeoPosition) => void,
  onError: (message: string) => void,
): number {
  if (!navigator.geolocation) {
    onError(t("Este dispositivo nao disponibiliza GPS pelo navegador."));
    return -1;
  }
  if (!window.isSecureContext) {
    onError(t("GPS requer HTTPS ou localhost."));
    return -1;
  }

  return navigator.geolocation.watchPosition(
    ({ coords, timestamp }) => onPosition({
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy,
      timestamp,
    }),
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? t("Permissao de localizacao negada.")
        : t("Nao foi possivel obter a localizacao GPS.");
      onError(message);
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
  );
}

export function stopWatchingLocation(watchId: number): void {
  if (watchId >= 0) {
    navigator.geolocation?.clearWatch(watchId);
  }
}

export function distanceBetween(
  first: Pick<GeoPosition, "lat" | "lon" | "accuracy">,
  second: Pick<GeoPosition, "lat" | "lon" | "accuracy">,
): { meters: number; uncertainty: number } {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lon - first.lon);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(first.lat)) * Math.cos(toRadians(second.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  const meters = 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { meters, uncertainty: Math.hypot(first.accuracy, second.accuracy) };
}