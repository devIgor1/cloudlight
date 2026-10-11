export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const data = (await response.json()) as T & { error?: string; code: string };
  if (!response.ok)
    throw new ApiError(
      data.error || "Não foi possível concluir a operação.",
      response.status,
      data.code,
    );
  return data;
}
export const post = <T>(
  path: string,
  data: unknown = {},
  options: RequestInit = {},
) => api<T>(path, { ...options, method: "POST", body: JSON.stringify(data) });
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Ocorreu um erro. Tente novamente.";
