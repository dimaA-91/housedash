import type { VoiceAction, VoiceMessage } from '@/lib/family-voice-shared';

/**
 * Schnittstelle jeder Sprach-Engine. Die Oberfläche kennt nur diese Ereignisse, deshalb lässt sich der Anbieter
 * austauschen: neue Datei mit dieser Schnittstelle, Eintrag in createVoiceEngine, fertig.
 */
/** listening: bereit, Linie steht still. hearing: Du redest gerade. thinking: Frage ist da, Antwort entsteht. speaking: Antwort läuft. */
export type VoicePhase = 'idle' | 'connecting' | 'listening' | 'hearing' | 'thinking' | 'speaking';
export interface VoiceEvents {
  phase: (phase: VoicePhase) => void;
  level: (level: number) => void;
  /** Eine fertige Aussage im Gespräch. */
  message: (message: VoiceMessage) => void;
  /** Teilantwort, die gerade entsteht. Leer, sobald die fertige Aussage da ist. */
  partial: (text: string) => void;
  action: (action: VoiceAction) => void;
  notice: (text: string) => void;
  /** Kein Mikrofon: Das Gespräch läuft weiter, die Oberfläche bietet Schreiben an. */
  microphone: (problem: string) => void;
  /** Die Engine ist am Ende. fallback: Eine andere Engine könnte es noch schaffen. */
  ended: (reason: { error?: string; fallback?: boolean }) => void;
}
export interface VoiceEngine {
  readonly id: string;
  start(): Promise<void>;
  stop(): void;
  /** Getippte Frage. Die Antwort kommt wie eine gesprochene. */
  sendText(text: string): void;
  setMicrophoneEnabled(enabled: boolean): void;
  resumeAudio(): Promise<void>;
}
export interface VoiceEngineOptions {
  microphoneId: string;
  /** Output device of this browser for the spoken answer. Empty: system default. */
  speakerId?: string;
  history?: VoiceMessage[];
}

/** Liest eine NDJSON-Antwort des Servers Zeile für Zeile. */
export async function readEvents(response: Response, onEvent: (event: Record<string, unknown>) => void | Promise<void>) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Keine Antwort vom Sprachdienst.');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) await onEvent(JSON.parse(buffer));
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (line) await onEvent(JSON.parse(line));
    }
  }
}
export const microphoneMessage = (failure: unknown) => failure instanceof DOMException
  ? ({ NotAllowedError: 'Bitte den Mikrofonzugriff in diesem Browser erlauben.', NotFoundError: 'An diesem Gerät ist kein Mikrofon. Du kannst stattdessen schreiben.', OverconstrainedError: 'Das gewählte Mikrofon ist nicht verfügbar. Bitte in den Einstellungen „Systemstandard“ wählen.' } as Record<string, string>)[failure.name] || 'Das Mikrofon dieses Geräts ist gerade nicht verfügbar.'
  : failure instanceof Error ? failure.message : 'Das Mikrofon ist nicht verfügbar.';
