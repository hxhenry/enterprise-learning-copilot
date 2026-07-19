export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { getServerEnvironment } = await import(
    "@/lib/config/server-environment"
  );

  getServerEnvironment();
}
