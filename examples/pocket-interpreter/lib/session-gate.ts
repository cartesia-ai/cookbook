export interface Stoppable {
  stop(): unknown;
}

export function createSessionGate<S extends Stoppable>() {
  let current: S | null = null;
  let pending: symbol | null = null;

  return {
    get busy() {
      return current !== null || pending !== null;
    },
    async start(open: () => Promise<S>): Promise<S | null> {
      if (current || pending) return null;
      const token = Symbol("start");
      pending = token;
      let session: S;
      try {
        session = await open();
      } catch (err) {
        if (pending !== token) return null;
        pending = null;
        throw err;
      }
      if (pending !== token) {
        await session.stop();
        return null;
      }
      pending = null;
      current = session;
      return session;
    },
    async stop() {
      pending = null;
      const session = current;
      current = null;
      await session?.stop();
    },
  };
}
