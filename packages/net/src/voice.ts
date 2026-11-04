import type { Room } from "trystero";

export interface VoiceState {
  micEnabled: boolean;
  muted: boolean;
  error: string | null;
}

/**
 * Voice chat over WebRTC audio streams. Who may talk to whom is decided by the
 * host: we only send audio to allowed peers and drop audio from the others.
 */
export class VoiceController {
  private stream: MediaStream | null = null;
  private muted = false;
  private error: string | null = null;
  private speakTo = new Set<string>();
  private hearFrom = new Set<string>();
  private sentTo = new Set<string>();
  private readonly audio = new Map<string, HTMLAudioElement>();
  private readonly volumes = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private state: VoiceState = { micEnabled: false, muted: false, error: null };

  constructor(private readonly room: Room) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): VoiceState {
    return this.state;
  }

  async enableMic(deviceId?: string): Promise<void> {
    try {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.sentTo.clear();
      this.error = null;
      this.applyMute();
      this.syncOutgoing();
    } catch {
      this.stream = null;
      this.error = "Microphone unavailable. Check the browser permissions.";
    }
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
    this.emit();
  }

  setPermissions(speakTo: string[], hearFrom: string[]): void {
    this.speakTo = new Set(speakTo);
    this.hearFrom = new Set(hearFrom);
    this.syncOutgoing();
    for (const [peerId, element] of this.audio) this.applyListening(peerId, element);
  }

  setPeerVolume(peerId: string, volume: number): void {
    this.volumes.set(peerId, volume);
    const element = this.audio.get(peerId);
    if (element) element.volume = volume;
  }

  onPeerStream(stream: MediaStream, peerId: string): void {
    const element = new Audio();
    element.autoplay = true;
    element.srcObject = stream;
    this.audio.set(peerId, element);
    this.applyListening(peerId, element);
  }

  /** A peer connected: it may be one we are allowed to talk to. */
  onPeerJoin(peerId: string): void {
    this.sentTo.delete(peerId);
    this.syncOutgoing();
  }

  onPeerLeave(peerId: string): void {
    this.sentTo.delete(peerId);
    this.audio.get(peerId)?.pause();
    this.audio.delete(peerId);
  }

  dispose(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    for (const element of this.audio.values()) element.pause();
    this.audio.clear();
    this.listeners.clear();
  }

  private applyListening(peerId: string, element: HTMLAudioElement): void {
    element.muted = !this.hearFrom.has(peerId);
    element.volume = this.volumes.get(peerId) ?? 1;
  }

  private applyMute(): void {
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = !this.muted));
  }

  /** Sends our stream to the peers we may talk to, and stops sending to the others. */
  private syncOutgoing(): void {
    if (!this.stream) return;
    const connected = new Set(Object.keys(this.room.getPeers()));
    for (const peerId of connected) {
      const allowed = this.speakTo.has(peerId);
      const sending = this.sentTo.has(peerId);
      if (allowed && !sending) {
        this.sentTo.add(peerId);
        Promise.allSettled(this.room.addStream(this.stream, { target: peerId }));
      } else if (!allowed && sending) {
        this.sentTo.delete(peerId);
        this.room.removeStream(this.stream, { target: peerId });
      }
    }
  }

  private emit(): void {
    this.state = { micEnabled: this.stream !== null, muted: this.muted, error: this.error };
    this.listeners.forEach((listener) => listener());
  }
}
