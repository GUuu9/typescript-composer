export interface MqttConfig { url: string; clientId: string; username?: string; password?: string }
export interface MqttMessage { topic: string; qos: 0 | 1 | 2; retain: boolean; dup: boolean }
export interface MqttBridge { name: string; topic: string; qos: 0 | 1; handle(payload: unknown, message: Readonly<MqttMessage>): void | Promise<void> }
