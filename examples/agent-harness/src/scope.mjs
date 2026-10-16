/** A small ownership scope, inspired by Cordis effects rather than its API. */
export function createScope() {
  const services = new Map();
  const mounts = [];
  let closed = false;

  async function unwind(effects) {
    const errors = [];
    for (const cleanup of effects.reverse()) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Plugin cleanup failed');
  }

  return {
    get(name) {
      if (!services.has(name)) throw new Error(`Unknown service: ${name}`);
      return services.get(name);
    },
    async mount(plugin) {
      if (closed) throw new Error('Scope is disposed');
      const effects = [];
      const ctx = {
        get(name) {
          if (!services.has(name)) throw new Error(`Unknown service: ${name}`);
          return services.get(name);
        },
        provide(name, service) {
          if (services.has(name)) throw new Error(`Duplicate service: ${name}`);
          services.set(name, service);
          effects.push(() => services.delete(name));
        },
        onDispose(cleanup) { effects.push(cleanup); },
      };
      try {
        await plugin(ctx);
        mounts.push(effects);
      } catch (error) {
        try { await unwind(effects); } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'Plugin mount and cleanup failed');
        }
        throw error;
      }
    },
    async dispose() {
      if (closed) return;
      closed = true;
      const errors = [];
      for (const effects of mounts.reverse()) {
        try { await unwind(effects); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Scope disposal failed');
    },
  };
}
