export interface BeaconConfig {
  id: string;
  service_uuid: string;
  x_m: number;
  y_m: number;
  tx_power: number;
  path_loss: number;
}

export interface BleEstimate {
  x: number;
  y: number;
  accuracy: number;
  timestamp: number;
}

interface BleDevice {
  id: string;
}

interface AdvertisementEvent extends Event {
  device: BleDevice;
  rssi?: number;
}

interface BleScan {
  stop(): void;
}

interface BleAdapter extends EventTarget {
  requestLEScan(options: {
    filters: Array<{ services: string[] }>;
    keepRepeatedDevices: boolean;
  }): Promise<BleScan>;
}

type NavigatorWithBle = Navigator & { bluetooth?: BleAdapter };

export async function startBeaconScan(
  beacons: BeaconConfig[],
  onEstimate: (estimate: BleEstimate) => void,
): Promise<() => void> {
  if (!window.isSecureContext) {
    throw new Error("BLE requer HTTPS ou localhost.");
  }
  const adapter = (navigator as NavigatorWithBle).bluetooth;
  if (!adapter?.requestLEScan) {
    throw new Error("Este navegador nao permite scan BLE. Use GPS ou movimento manual.");
  }
  if (beacons.length < 3) {
    throw new Error("Sao necessarios pelo menos 3 beacons mapeados para estimar a posicao.");
  }

  const configured = new Map(beacons.map((beacon) => [beacon.id, beacon]));
  const services = [...new Set(beacons.map((beacon) => beacon.service_uuid.toLowerCase()))];
  const scan = await adapter.requestLEScan({
    filters: services.map((service) => ({ services: [service] })),
    keepRepeatedDevices: true,
  });
  const samples = new Map<string, number[]>();
  const receivedAt = new Map<string, number>();

  const listener = (event: Event): void => {
    const advertisement = event as AdvertisementEvent;
    const beacon = configured.get(advertisement.device.id);
    if (!beacon || typeof advertisement.rssi !== "number") {
      return;
    }
    const history = samples.get(beacon.id) ?? [];
    history.push(advertisement.rssi);
    if (history.length > 6) history.shift();
    samples.set(beacon.id, history);
    receivedAt.set(beacon.id, Date.now());

    const active = beacons.filter((item) => {
      const recentSamples = samples.get(item.id);
      return recentSamples?.length && Date.now() - (receivedAt.get(item.id) ?? 0) < 4000;
    }).map((item) => {
      const averageRssi = samples.get(item.id)!.reduce((sum, value) => sum + value, 0)
        / samples.get(item.id)!.length;
      const distance = 10 ** ((item.tx_power - averageRssi) / (10 * item.path_loss));
      return { x: item.x_m, y: item.y_m, distance };
    });

    const estimate = trilaterate(active);
    if (estimate) onEstimate({ ...estimate, timestamp: Date.now() });
  };

  adapter.addEventListener("advertisementreceived", listener);
  return () => {
    adapter.removeEventListener("advertisementreceived", listener);
    scan.stop();
  };
}

function trilaterate(beacons: Array<{ x: number; y: number; distance: number }>): Omit<BleEstimate, "timestamp"> | null {
  if (beacons.length < 3) return null;
  const [reference, ...others] = beacons;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let xb = 0;
  let yb = 0;

  for (const beacon of others) {
    const a = 2 * (beacon.x - reference.x);
    const b = 2 * (beacon.y - reference.y);
    const c = reference.distance ** 2 - beacon.distance ** 2
      + beacon.x ** 2 - reference.x ** 2
      + beacon.y ** 2 - reference.y ** 2;
    xx += a * a;
    xy += a * b;
    yy += b * b;
    xb += a * c;
    yb += b * c;
  }

  const determinant = xx * yy - xy * xy;
  if (Math.abs(determinant) < 0.001) return null;
  const x = (xb * yy - yb * xy) / determinant;
  const y = (yb * xx - xb * xy) / determinant;
  const residuals = beacons.map((beacon) =>
    Math.hypot(x - beacon.x, y - beacon.y) - beacon.distance,
  );
  const rms = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length);
  return { x, y, accuracy: Math.max(8, rms + 5) };
}