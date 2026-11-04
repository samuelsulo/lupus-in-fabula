import { locale } from "./i18n.ts";

/** Reads lines aloud with the browser's speech synthesis, for the automatic narrator. */
export class Narration {
  private enabled = true;

  static get supported(): boolean {
    return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && Narration.supported) speechSynthesis.cancel();
  }

  /** Queues a line. Lines are read one after the other. */
  say(text: string): void {
    if (!this.enabled || !Narration.supported) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale.value === "it" ? "it-IT" : "en-US";
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
  }

  /** Drops whatever is queued, e.g. when the game moves on faster than the voice. */
  stop(): void {
    if (Narration.supported) speechSynthesis.cancel();
  }
}
