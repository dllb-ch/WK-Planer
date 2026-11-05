// node:fs for the browser demo: the server only reads its schema and checks for the built client.
import schema from '../../../../server/src/sql/schema.sql?raw';

export const readFileSync = (path: string) => {
  if (String(path).endsWith('schema.sql')) return schema;
  throw new Error(`readFileSync(${path}) is not available in the demo`);
};
export const existsSync = () => false;
export default { readFileSync, existsSync };
