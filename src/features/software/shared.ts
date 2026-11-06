/** Zustand des Hostdienstes housedash-updater, so wie ihn die Oberfläche sieht. */
export interface SoftwareUpdate {
  version: string; published: string; notes: string;
}
export interface SoftwareJob {
  version: string; phase: 'start' | 'download' | 'verify' | 'images' | 'install' | 'done' | 'failed';
  progress: number; ok: boolean | null; startedAt: string; finishedAt: string | null; message: string;
  /** true: started by the nightly automatic install. */
  automatic?: boolean;
}
export interface SoftwareState {
  /** false: Der Updater läuft auf diesem Gerät nicht (zum Beispiel beim Entwickeln am PC). */
  available: boolean;
  installed: string; repo: string; lastCheck: string | null; checkError: string | null;
  update: SoftwareUpdate | null; job: SoftwareJob | null; error?: string;
  /** Install downloaded updates automatically at night. Off by default. */
  autoInstall?: boolean;
  /** The offered update is already downloaded and verified. */
  prepared?: boolean;
}
