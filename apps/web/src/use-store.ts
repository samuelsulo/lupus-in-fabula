import { onScopeDispose, shallowRef, type ShallowRef } from "vue";

/** Turns any subscribable external store into a Vue ref. */
export function useExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
): ShallowRef<T> {
  const state = shallowRef(getSnapshot());
  const unsubscribe = subscribe(() => (state.value = getSnapshot()));
  onScopeDispose(unsubscribe);
  return state;
}
