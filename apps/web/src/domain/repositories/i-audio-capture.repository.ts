export interface IAudioCaptureRepository {
  requestMicrophone(): Promise<MediaStream>;
  requestAudioVideo(): Promise<MediaStream>;
  getDbLevel(): number;
  startAnalyser(stream: MediaStream): void;
  stopAnalyser(): void;
  startKeepAlive(): void;
  stopKeepAlive(): void;
}
