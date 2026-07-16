import {
  getServerEnvironment,
  ServerEnvironmentError,
} from "@/lib/config/server-environment";
import { getLearningRuntime } from "@/lib/runtime/learning-runtime";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(): Promise<Response> {
  try {
    getServerEnvironment();

    const learningRuntime = await getLearningRuntime();

    await learningRuntime.checkReadiness();

    return Response.json(
      {
        status: "ready",
        persistence: learningRuntime.backend,
      },
      {
        headers: RESPONSE_HEADERS,
      },
    );
  } catch (error) {
    if (!(error instanceof ServerEnvironmentError)) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          event: "health.readiness.failed",
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }

    return Response.json(
      {
        status: "not-ready",
      },
      {
        status: 503,
        headers: RESPONSE_HEADERS,
      },
    );
  }
}
