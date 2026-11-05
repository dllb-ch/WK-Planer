// node:url for the browser demo (seed.ts checks whether it is run as a script).
export const fileURLToPath = (u: string | URL) => String(u);
export const pathToFileURL = (p: string) => new URL(`file://${p}`);
export default { fileURLToPath, pathToFileURL };
