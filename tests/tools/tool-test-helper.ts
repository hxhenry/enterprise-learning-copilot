export async function executeTool<TInput, TOutput>(
  definition: unknown,
  input: TInput,
): Promise<TOutput> {
  const execute = (
    definition as {
      execute?: (value: TInput) => Promise<TOutput>;
    }
  ).execute;

  if (!execute) {
    throw new Error("The tool does not define an execute function.");
  }

  return execute(input);
}
