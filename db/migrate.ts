import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getDatabase } from './index';

await migrate(drizzle(getDatabase()), { migrationsFolder: './drizzle-postgres' });
await getDatabase().end();
