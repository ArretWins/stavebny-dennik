export class SerializedStateStore<T> {
  private value: T;
  private queue: Promise<void> = Promise.resolve();

  constructor(initialValue: T, private readonly write: (value: T) => Promise<void>) {
    this.value = initialValue;
  }

  get snapshot(): T {
    return this.value;
  }

  replace(value: T): void {
    this.value = value;
  }

  update(mutator: (value: T) => T): Promise<T> {
    const operation = this.queue.then(async () => {
      const next = mutator(this.value);
      await this.write(next);
      this.value = next;
      return next;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
