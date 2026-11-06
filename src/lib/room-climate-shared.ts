/** Live sensor data is transient; no calendar/family-data schema migration. */
export interface RoomClimateSample {
  temperatureC: number;
  humidityPercent: number;
  measuredAt: string;
}

export interface RoomClimateReading {
  sample: RoomClimateSample | null;
  status: 'ok' | 'stale' | 'unavailable';
  lastAttemptAt: string | null;
  message: string | null;
}

export const ROOM_CLIMATE_INTERVAL_MS = 30_000;
export const ROOM_CLIMATE_STALE_MS = 120_000;
