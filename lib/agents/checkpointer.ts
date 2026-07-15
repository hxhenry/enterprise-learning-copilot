import { MemorySaver } from "@langchain/langgraph";

const globalForLearningGraph = globalThis as typeof globalThis & {
  learningGraphCheckpointer?: MemorySaver;
};

export const learningGraphCheckpointer =
  globalForLearningGraph.learningGraphCheckpointer ??
  new MemorySaver();

if (process.env.NODE_ENV !== "production") {
  globalForLearningGraph.learningGraphCheckpointer =
    learningGraphCheckpointer;
}