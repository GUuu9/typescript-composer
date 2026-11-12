export interface CommunicationEntry {
  name: string;
  autoStart: boolean;
  readonly failure?: Promise<never>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
