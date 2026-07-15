import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type SourceDocumentConfig = {
  fileName: string;
  title: string;
  category: "course" | "policy";
};

export type RetrievedKnowledge = {
  citationId: string;
  title: string;
  source: string;
  category: string;
  content: string;
};

const SOURCE_DOCUMENTS: SourceDocumentConfig[] = [
  {
    fileName: "cloud-security-fundamentals.md",
    title: "Cloud Security Fundamentals",
    category: "course",
  },
  {
    fileName: "identity-access-management.md",
    title: "Identity and Access Management",
    category: "course",
  },
  {
    fileName: "certification-policy.md",
    title: "Cloud Security Certification Policy",
    category: "policy",
  },
];

let vectorStorePromise: Promise<MemoryVectorStore> | null = null;

async function loadSourceDocuments(): Promise<Document[]> {
  return Promise.all(
    SOURCE_DOCUMENTS.map(async (sourceDocument) => {
      const filePath = join(
        process.cwd(),
        "data",
        "documents",
        sourceDocument.fileName,
      );

      const content = await readFile(filePath, "utf8");

      return new Document({
        pageContent: content,
        metadata: {
          source: sourceDocument.fileName,
          title: sourceDocument.title,
          category: sourceDocument.category,
        },
      });
    }),
  );
}

async function buildVectorStore(): Promise<MemoryVectorStore> {
  const rawDocuments = await loadSourceDocuments();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 120,
  });

  const documentChunks =
    await splitter.splitDocuments(rawDocuments);

  const embeddingModel =
    process.env.OPENAI_EMBEDDING_MODEL?.trim() ||
    "text-embedding-3-small";

  const embeddings = new OpenAIEmbeddings({
    model: embeddingModel,
  });

  return MemoryVectorStore.fromDocuments(
    documentChunks,
    embeddings,
  );
}

async function getVectorStore(): Promise<MemoryVectorStore> {
  if (!vectorStorePromise) {
    vectorStorePromise = buildVectorStore().catch((error) => {
      vectorStorePromise = null;
      throw error;
    });
  }

  return vectorStorePromise;
}

export async function searchCourseKnowledge(
  query: string,
  limit = 3,
): Promise<RetrievedKnowledge[]> {
  const vectorStore = await getVectorStore();

  const documents = await vectorStore.similaritySearch(
    query,
    limit,
  );

  return documents.map((document, index) => ({
    citationId: `S${index + 1}`,
    title:
      typeof document.metadata.title === "string"
        ? document.metadata.title
        : "Unknown document",
    source:
      typeof document.metadata.source === "string"
        ? document.metadata.source
        : "unknown",
    category:
      typeof document.metadata.category === "string"
        ? document.metadata.category
        : "unknown",
    content: document.pageContent,
  }));
}