// node:async_hooks for the browser demo. The demo handles one request at a time (start.ts), so the store of the
// running request (its transaction) is simply the current one.
export class AsyncLocalStorage<T> {
  private store: T | undefined;
  getStore() {
    return this.store;
  }
  async run<R>(store: T, fn: () => Promise<R> | R): Promise<R> {
    const before = this.store;
    this.store = store;
    try {
      return await fn();
    } finally {
      this.store = before;
    }
  }
}
export default { AsyncLocalStorage };
