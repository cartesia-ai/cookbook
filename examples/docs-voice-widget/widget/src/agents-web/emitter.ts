export class Emitter<M extends { [K in keyof M]: unknown }> {
  private listeners = new Map<keyof M, Set<(e: never) => void>>();

  on<K extends keyof M>(type: K, fn: (e: M[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as (e: never) => void);
    return () => {
      set!.delete(fn as (e: never) => void);
    };
  }

  protected emit<K extends keyof M>(type: K, event: M[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (e: M[K]) => void)(event);
      } catch {}
    }
  }
}
