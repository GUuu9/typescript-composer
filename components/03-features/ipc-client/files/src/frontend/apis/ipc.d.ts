import type { DesktopApi } from '../../shared/ipc.contract.ts';
declare global { interface Window { readonly desktopApi: DesktopApi; } }
export {};
