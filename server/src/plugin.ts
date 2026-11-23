import type { FastifyInstance } from 'fastify';

/** Registriert Routen ohne eigene Kapselung (Hooks/Decorators der App gelten). */
export default function fp(fn: (app: FastifyInstance) => Promise<void>) {
  const plugin = async (app: FastifyInstance) => fn(app);
  (plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
  return plugin;
}
