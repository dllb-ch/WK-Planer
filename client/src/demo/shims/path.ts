// node:path for the browser demo (import.meta.dirname is undefined there).
export const resolve = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('/');
export const join = resolve;
export const dirname = (p: string) => p.replace(/\/[^/]*$/, '');
export default { resolve, join, dirname };
