export interface Initializable {
  initialize(): void | Promise<void>;
}

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface LifecycleEntry extends Partial<Initializable>, Partial<Disposable> {
  name: string;
  dependencies: string[];
}
