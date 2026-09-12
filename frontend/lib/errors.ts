import { AxiosError } from "axios";

type PydanticError = { loc: (string | number)[]; msg: string; type: string };

const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  full_name: "Nombre",
  email: "Correo",
  phone: "Teléfono",
  password: "Contraseña",
  amount: "Monto",
  price: "Precio",
  instructor: "Entrenador",
  instructor_id: "Entrenador",
  category: "Categoría",
  difficulty: "Dificultad",
  color: "Color",
  schedule: "Horario",
  weekdays: "Días de la semana",
  start_time: "Hora de inicio",
  max_capacity: "Capacidad",
  duration_minutes: "Duración",
  description: "Descripción",
  member_id: "Socio",
  plan_id: "Plan",
  start_date: "Fecha de inicio",
  end_date: "Fecha de fin",
  id_number: "Documento",
  id_type: "Tipo de documento",
  birth_date: "Fecha de nacimiento",
  address: "Dirección",
  notes: "Notas",
  quantity: "Cantidad",
  stock: "Stock",
  sku: "SKU",
  method: "Método de pago",
  reference: "Referencia",
  counted_cash: "Efectivo contado",
  opening_amount: "Base inicial",
  serial_number: "Número de serie",
  maintenance_interval_days: "Intervalo de mantenimiento",
};

function fieldLabel(loc: PydanticError["loc"]): string {
  // loc = ["body", "campo"] — el último segmento de texto es el campo
  const key = [...loc].reverse().find((p) => typeof p === "string" && p !== "body");
  if (typeof key !== "string") return "Dato";
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function errorText(e: PydanticError): string {
  switch (e.type) {
    case "missing":
      return "es obligatorio";
    case "enum":
      return "tiene un valor no válido";
    case "string_too_short":
      return "es demasiado corto";
    case "string_too_long":
      return "es demasiado largo";
    case "greater_than":
    case "greater_than_equal":
      return "es demasiado bajo";
    case "less_than":
    case "less_than_equal":
      return "es demasiado alto";
    case "int_parsing":
    case "float_parsing":
    case "decimal_parsing":
      return "debe ser un número";
    case "date_parsing":
    case "date_from_datetime_inexact":
      return "debe ser una fecha válida";
    case "time_parsing":
      return "debe ser una hora válida";
    case "uuid_parsing":
      return "no es una referencia válida";
    case "value_error":
      return e.msg.replace(/^Value error,\s*/i, "");
    default:
      // Un tipo que no sabemos traducir degrada al texto de Pydantic: en inglés,
      // pero dice qué pasó. "no es válido" no diagnostica nada.
      return e.msg || "no es válido";
  }
}

/**
 * Extrae un mensaje legible del error de Axios/FastAPI.
 * FastAPI retorna: { detail: string } o { detail: PydanticError[] }
 *
 * Los 422 se traducen: el `msg` de Pydantic viene en inglés y con el nombre
 * técnico del campo, que no le dice nada a quien está llenando el formulario.
 */
export function parseApiError(err: unknown, fallback?: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    // Sin respuesta: la petición ni llegó (red caída, backend abajo, CORS).
    // Decirlo así ahorra buscar el problema donde no está.
    if (!data) return fallback ?? err.message ?? "Error de conexión";

    if (typeof data.detail === "string") return data.detail;

    if (Array.isArray(data.detail)) {
      return (data.detail as PydanticError[])
        .map((e) => `${fieldLabel(e.loc)} ${errorText(e)}`)
        .join("; ");
    }

    if (data.message) return String(data.message);
  }

  if (err instanceof Error) return fallback ?? err.message;
  return fallback ?? "Ocurrió un error inesperado";
}
