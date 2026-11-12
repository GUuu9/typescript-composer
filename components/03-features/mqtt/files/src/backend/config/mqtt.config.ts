import type { MqttConfig } from '../communications/mqtt/mqtt.contract.ts';

export function validateMqttTopic(topic: string): string {
  if (typeof topic !== 'string' || !topic || Buffer.byteLength(topic) > 256 || /[\x00-\x1f\x7f+#]/.test(topic) || topic.startsWith('$')) throw new Error('MQTT topic must be an exact non-system topic up to 256 bytes');
  return topic;
}
export function validateMqttConfig(config: MqttConfig): MqttConfig {
  let url: URL;
  try { url = new URL(config?.url); } catch { throw new Error('MQTT_URL must be an mqtt/mqtts broker URL'); }
  if (!['mqtt:', 'mqtts:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('MQTT_URL must not contain credentials, paths or query parameters');
  if (typeof config.clientId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(config.clientId)) throw new Error('MQTT_CLIENT_ID must contain 1~64 letters, digits, underscores or hyphens');
  for (const key of ['username', 'password'] as const) if (config[key] !== undefined && (typeof config[key] !== 'string' || Buffer.byteLength(config[key]) > 1024 || /[\x00-\x1f\x7f]/.test(config[key]))) throw new Error('Invalid MQTT credentials');
  if (config.password !== undefined && !config.username) throw new Error('MQTT_USERNAME is required with MQTT_PASSWORD');
  return { url: url.href, clientId: config.clientId, ...(config.username !== undefined ? { username: config.username } : {}), ...(config.password !== undefined ? { password: config.password } : {}) };
}
export function readMqttConfig(): MqttConfig {
  return validateMqttConfig({ url: process.env.MQTT_URL ?? '', clientId: process.env.MQTT_CLIENT_ID ?? '',
    ...(process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME } : {}), ...(process.env.MQTT_PASSWORD ? { password: process.env.MQTT_PASSWORD } : {}),
  });
}
