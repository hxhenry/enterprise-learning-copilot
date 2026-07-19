import { describe, expect, it } from "vitest";

import { KeyedSerialExecutor } from "@/lib/concurrency/keyed-serial-executor";

function createDeferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

describe("KeyedSerialExecutor", () => {
  it("serializes work for the same key", async () => {
    const executor = new KeyedSerialExecutor();
    const firstRelease = createDeferred();
    const firstStarted = createDeferred();
    const order: string[] = [];

    const first = executor.run("action-123", async () => {
      order.push("first-start");
      firstStarted.resolve();
      await firstRelease.promise;
      order.push("first-end");
    });

    await firstStarted.promise;

    const second = executor.run("action-123", async () => {
      order.push("second-start");
      order.push("second-end");
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    firstRelease.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  it("releases the next operation when the previous one fails", async () => {
    const executor = new KeyedSerialExecutor();

    const first = executor.run("action-123", async () => {
      throw new Error("first failed");
    });
    const second = executor.run("action-123", async () => "completed");

    await expect(first).rejects.toThrow("first failed");
    await expect(second).resolves.toBe("completed");
  });
});
