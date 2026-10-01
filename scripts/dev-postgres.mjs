/**
 * A throwaway local Postgres, for exercising the Postgres driver without
 * installing a database server. Runs PGlite (Postgres compiled to WASM) behind
 * the normal Postgres wire protocol.
 *
 *   node scripts/dev-postgres.mjs 55433 ./data/pg
 *   DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55433/postgres?sslmode=disable" \
 *     DATABASE_POOL_MAX=1 npm run dev
 *
 * PGlite serves one session at a time, hence DATABASE_POOL_MAX=1. A real
 * Postgres (Neon, Supabase, RDS) has no such limit.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.argv[2] ?? 55433);
const dataDir = process.argv[3];

const db = await PGlite.create(dataDir);
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`postgres (pglite) listening on 127.0.0.1:${port}${dataDir ? `, data in ${dataDir}` : ', in memory'}`);

const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
