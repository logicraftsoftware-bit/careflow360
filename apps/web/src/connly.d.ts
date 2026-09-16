declare module "connly" {
  export default class Connly {
    constructor(serverUrl: string, token: string);
    connect(): void;
    disconnect(): void;
    setStatus(status: string): void;
    onConnect(callback: (data: { isConnected: boolean }) => void): void;
    onDisconnect(callback: (data: { isConnected: boolean }) => void): void;
    onStatus(callback: (data: unknown) => void): void;
    onCallAction(callback: (data: unknown) => void): void;
    onError(callback: (error: unknown) => void): void;
  }
}
