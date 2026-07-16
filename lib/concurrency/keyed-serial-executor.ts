export class KeyedSerialExecutor {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previousTail = this.tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const currentTail = previousTail
      .catch(() => undefined)
      .then(() => released);

    this.tails.set(key, currentTail);

    await previousTail.catch(() => undefined);

    try {
      return await operation();
    } finally {
      release();

      if (this.tails.get(key) === currentTail) {
        this.tails.delete(key);
      }
    }
  }
}
