import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOM_CLIMATE_INTERVAL_MS, ROOM_CLIMATE_STALE_MS, type RoomClimateReading, type RoomClimateSample } from '@/lib/room-climate-shared';

const IIO_ROOT = '/sys/bus/iio/devices';
let sample: RoomClimateSample | null = null;
let attemptedAt: number | null = null;
let message: string | null = null;
let pending: Promise<void> | null = null;
let sensorPath: string | null = null;

async function findSensor(signal: AbortSignal): Promise<string> {
  if (sensorPath) return sensorPath;
  const devices = await fs.readdir(IIO_ROOT);
  for (const device of devices) {
    if (!/^iio:device\d+$/.test(device)) continue;
    const candidate = path.join(IIO_ROOT, device);
    try {
      const name = (await fs.readFile(path.join(candidate, 'name'), { encoding: 'utf8', signal })).trim();
      if (name === 'dht11' || name === 'dht11@4') return sensorPath = candidate;
    } catch (error) {
      if (signal.aborted) throw error;
      // Another IIO device may disappear during discovery.
    }
  }
  throw Object.assign(new Error('Kein Raumsensor verfügbar.'), { code: 'ENOENT' });
}

async function readMilli(file: string, min: number, max: number, signal: AbortSignal): Promise<number> {
  const raw = (await fs.readFile(file, { encoding: 'utf8', signal })).trim();
  const value = Number(raw) / 1000;
  if (!/^-?\d+$/.test(raw) || !Number.isFinite(value) || value < min || value > max) {
    throw new Error('Ungültiger Messwert.');
  }
  return value;
}

async function refresh(): Promise<void> {
  // The kernel performs GPIO timing, off the Node event loop. All clients share
  // one read; failed reads are throttled too. DHT values must never be read per render.
  const signal = AbortSignal.timeout(6_000);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const device = await findSensor(signal);
        // Sequential: the kernel caches the DHT measurement for two seconds,
        // so both attributes normally refer to the same hardware measurement.
        const temperatureC = await readMilli(path.join(device, 'in_temp_input'), -40, 80, signal);
        const humidityPercent = await readMilli(path.join(device, 'in_humidityrelative_input'), 0, 100, signal);
        sample = { temperatureC, humidityPercent, measuredAt: new Date().toISOString() };
        message = null;
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENODEV') sensorPath = null;
        // DHT11 occasionally loses a pulse/checksum. Retry once after its minimum
        // sampling period, without spawning commands or adding another reader.
        if (attempt === 0 && !signal.aborted && ['EIO', 'ETIMEDOUT', 'EAGAIN'].includes(code ?? '')) {
          await delay(2_100, undefined, { signal });
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    message = code === 'ENOENT' || code === 'ENODEV' ? 'Raumsensor nicht erreichbar.'
      : code === 'EACCES' || code === 'EPERM' ? 'Zugriff auf den Raumsensor fehlt.'
        : 'Momentan keine gültige Messung vom Raumsensor.';
    // Preserve the last good measurement and its ORIGINAL timestamp.
  } finally {
    attemptedAt = Date.now();
  }
}

export async function readRoomClimate(): Promise<RoomClimateReading> {
  if (attemptedAt === null || Date.now() - attemptedAt >= ROOM_CLIMATE_INTERVAL_MS) {
    if (!pending) pending = refresh().finally(() => { pending = null; });
    await pending;
  }
  return {
    sample,
    status: !sample ? 'unavailable' : message || Date.now() - Date.parse(sample.measuredAt) >= ROOM_CLIMATE_STALE_MS ? 'stale' : 'ok',
    lastAttemptAt: attemptedAt === null ? null : new Date(attemptedAt).toISOString(),
    message,
  };
}
