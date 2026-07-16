import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { asPersistenceOperationError } from "@/lib/database/errors";

async function runCheckpointOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw asPersistenceOperationError(error);
  }
}

export class PersistenceAwarePostgresSaver extends PostgresSaver {
  override setup(): Promise<void> {
    return runCheckpointOperation(() => super.setup());
  }

  override getTuple(
    ...args: Parameters<PostgresSaver["getTuple"]>
  ): ReturnType<PostgresSaver["getTuple"]> {
    return runCheckpointOperation(() => super.getTuple(...args));
  }

  override async *list(
    ...args: Parameters<PostgresSaver["list"]>
  ): ReturnType<PostgresSaver["list"]> {
    try {
      yield* super.list(...args);
    } catch (error) {
      throw asPersistenceOperationError(error);
    }
  }

  override put(
    ...args: Parameters<PostgresSaver["put"]>
  ): ReturnType<PostgresSaver["put"]> {
    return runCheckpointOperation(() => super.put(...args));
  }

  override putWrites(
    ...args: Parameters<PostgresSaver["putWrites"]>
  ): ReturnType<PostgresSaver["putWrites"]> {
    return runCheckpointOperation(() => super.putWrites(...args));
  }

  override deleteThread(
    ...args: Parameters<PostgresSaver["deleteThread"]>
  ): ReturnType<PostgresSaver["deleteThread"]> {
    return runCheckpointOperation(() => super.deleteThread(...args));
  }
}
