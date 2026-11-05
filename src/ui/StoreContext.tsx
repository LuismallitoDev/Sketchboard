import { createContext, useContext, useSyncExternalStore } from "react";
import type { Store } from "../state/store";

const Ctx = createContext<Store | null>(null);
export const StoreProvider = Ctx.Provider;

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

/** Re-renders the component on every scene or state change; read the data from `store` afterwards. */
export function useStoreVersion(): number {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getVersion);
}
