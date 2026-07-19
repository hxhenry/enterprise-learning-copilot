/**
 * Serializes operations that share a key while allowing unrelated keys to run
 * concurrently. This queue is process-local; distributed deployments need a
 * database constraint or distributed lock for the same guarantee.
 */
export class KeyedSerialExecutor {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previousTail = this.tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A failed predecessor must release ordering without poisoning later work.
    const currentTail = previousTail
      .catch(() => undefined)
      .then(() => released);

    // Publish our tail before waiting so later callers queue behind this run.
    this.tails.set(key, currentTail);

    await previousTail.catch(() => undefined);

    try {
      return await operation();
    } finally {
      release();

      // A later caller may already have installed a new tail for this key.
      if (this.tails.get(key) === currentTail) {
        this.tails.delete(key);
      }
    }
  }
}
