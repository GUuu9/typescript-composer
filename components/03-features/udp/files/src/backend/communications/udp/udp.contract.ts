export interface UdpPeer { address: string; port: number }
export interface UdpConfig { host: string; port: number; allowedPeers?: string[]; authToken?: string }
export interface UdpMessage { route: string; payload: unknown; token?: string }
export interface UdpBridge { name: string; handle(payload: unknown, peer: Readonly<UdpPeer>): void | Promise<void> }
