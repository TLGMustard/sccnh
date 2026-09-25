import postgres, { type Sql } from 'postgres';

let client: Sql | null = null;

export function getDatabase(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to access volunteer data.');
  if (!client) client = postgres(url, { max: 5, prepare: false });
  return client;
}

export async function query<T extends Record<string, unknown>>(statement: string, values: postgres.ParameterOrJSON<never>[] = []): Promise<T[]> {
  let index = 0;
  const sql = statement.replace(/\?/g, () => `$${++index}`);
  return getDatabase().unsafe(sql, values) as Promise<T[]>;
}

export async function execute(statement: string, values: postgres.ParameterOrJSON<never>[] = []): Promise<number> {
  const result = await query(statement, values);
  return Number((result as typeof result & { count?: number }).count ?? 0);
}
