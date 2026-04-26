export function createStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  return {
    getState() {
      return structuredClone(state);
    },
    setState(updater, meta = {}) {
      const previousState = structuredClone(state);
      state = typeof updater === 'function' ? updater(structuredClone(state)) : structuredClone(updater);

      listeners.forEach((listener) => {
        listener(structuredClone(state), previousState, meta);
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
