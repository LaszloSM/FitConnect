import { AxiosError } from "axios";

type PydanticError = { loc: string[]; msg: string; type: string };

/**
 * Extrae un mensaje legible del error de Axios/FastAPI.
 * FastAPI retorna: { detail: string } o { detail: PydanticError[] }
 */
export function parseApiError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (!data) return err.message ?? "Error de conexión";

    if (typeof data.detail === "string") return data.detail;

    if (Array.isArray(data.detail)) {
      return (data.detail as PydanticError[])
        .map((e) => `${e.loc.at(-1)}: ${e.msg}`)
        .join("; ");
    }

    if (data.message) return String(data.message);
  }

  if (err instanceof Error) return err.message;
  return "Ocurrió un error inesperado";
}
