export interface SocketIoConfig { authToken?: string }
export interface SocketIoBridge { name: string; handle(payload: unknown): unknown | Promise<unknown> }
