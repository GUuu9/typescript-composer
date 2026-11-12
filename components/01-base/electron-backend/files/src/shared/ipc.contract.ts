export interface IpcRoute { readonly path: string; readonly method: string; readonly channel: string; }
export type IpcReply = { ok: true; value: unknown } | { ok: false; error: 'IPC_REQUEST_FAILED' };
export type DesktopApi = Readonly<Record<string, () => Promise<IpcReply>>>;
export function validateIpcValue(value: unknown): void {
  const seen = new Set<object>();
  function visit(item: unknown): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || !item || seen.has(item)) throw new Error('Invalid IPC payload');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error('Invalid IPC payload');
    seen.add(item);
    for (const entry of Object.values(item)) visit(entry);
    seen.delete(item);
  }
  visit(value);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 64 * 1024) throw new Error('IPC payload too large');
}
