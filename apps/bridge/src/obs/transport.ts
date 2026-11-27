export type ObsMessage = { op: number; d?: Record<string, unknown> };

// Small seam for testing the adapter without an OBS installation. The real
// implementation is a loopback-only OBS WebSocket v5 client.
export interface ObsTransport {
  connect(): Promise<void>;
  send(message: ObsMessage): void;
  onMessage(handler: (message: ObsMessage) => void): void;
  onClose(handler: () => void): void;
  close(): void;
}
