import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { createDi } from './di.ts';

type Di = ReturnType<typeof createDi>;
const diContext = createContext<Di | null>(null);

export function DiProvider({ di, children }: { di: Di; children: ReactNode }) {
  return <diContext.Provider value={di}>{children}</diContext.Provider>;
}

export function useDi(): Di {
  const di = useContext(diContext);
  if (!di) throw new Error('DiProvider가 필요합니다.');
  return di;
}
