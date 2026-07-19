import { MemorySaver } from "@langchain/langgraph";

const globalForLearningGraph = globalThis as typeof globalThis & {
  learningGraphCheckpointer?: MemorySaver;
};

/*
 * MemorySaver is intentionally process-local. Reusing it through globalThis in
 * development prevents Fast Refresh from discarding active demo threads; it
 * does not provide durability across restarts or multiple server instances.
 */
export const learningGraphCheckpointer =
  globalForLearningGraph.learningGraphCheckpointer ??
  new MemorySaver();

if (process.env.NODE_ENV !== "production") {
  globalForLearningGraph.learningGraphCheckpointer =
    learningGraphCheckpointer;
}
