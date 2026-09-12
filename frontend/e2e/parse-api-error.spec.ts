import { test, expect } from "@playwright/test";
import { AxiosError } from "axios";

import { parseApiError } from "../lib/errors";

/**
 * FastAPI devuelve el 422 en inglés y con el nombre técnico del campo
 * ("category: Input should be 'yoga', 'crossfit'..."). Quien está llenando el
 * formulario no sabe qué es `category` ni tiene por qué leer inglés: el toast de
 * clases pintaba ese mensaje crudo y parecía que el sistema exigía spinning.
 */
function error422(detail: unknown) {
  return new AxiosError("Unprocessable", "422", undefined, undefined, {
    status: 422,
    data: { detail },
    statusText: "Unprocessable Entity",
    headers: {},
    config: {} as never,
  });
}

test("un enum inválido se explica en español y con el nombre visible del campo", () => {
  // El 422 exacto que devolvía el formulario al mandar "Spinning".
  expect(
    parseApiError(error422([{ loc: ["body", "category"], msg: "Input should be 'yoga'", type: "enum" }])),
  ).toBe("Categoría tiene un valor no válido");
});

test("un campo faltante dice que es obligatorio", () => {
  expect(
    parseApiError(error422([{ loc: ["body", "max_capacity"], msg: "Field required", type: "missing" }])),
  ).toBe("Capacidad es obligatorio");
});

test("varios errores se juntan con punto y coma", () => {
  expect(
    parseApiError(
      error422([
        { loc: ["body", "name"], msg: "Field required", type: "missing" },
        { loc: ["body", "price"], msg: "...", type: "int_parsing" },
      ]),
    ),
  ).toBe("Nombre es obligatorio; Precio debe ser un número");
});

test("un índice numérico en loc no se usa como nombre de campo", () => {
  expect(
    parseApiError(error422([{ loc: ["body", "weekdays", 0], msg: "...", type: "int_parsing" }])),
  ).toBe("Días de la semana debe ser un número");
});

test("un campo sin etiqueta cae al nombre crudo sin guiones bajos", () => {
  expect(
    parseApiError(error422([{ loc: ["body", "class_credits_per_month"], msg: "...", type: "missing" }])),
  ).toBe("class credits per month es obligatorio");
});

test("un value_error del backend se muestra sin el prefijo de pydantic", () => {
  expect(
    parseApiError(
      error422([
        {
          loc: ["body", "color"],
          msg: "Value error, El color debe ser hexadecimal, por ejemplo #F97316",
          type: "value_error",
        },
      ]),
    ),
  ).toBe("Color El color debe ser hexadecimal, por ejemplo #F97316");
});

test("un tipo sin traducir conserva el texto del backend en vez de perderlo", () => {
  // Degradar a "no es válido" borraba el único dato que explicaba el 422.
  expect(
    parseApiError(
      error422([{ loc: ["body", "sku"], msg: "String should match pattern", type: "string_pattern_mismatch" }]),
    ),
  ).toBe("SKU String should match pattern");
});

test("un tipo sin traducir y sin msg cae a un texto genérico", () => {
  expect(parseApiError(error422([{ loc: ["body", "sku"], msg: "", type: "raro" }]))).toBe(
    "SKU no es válido",
  );
});

test("un detail de texto del backend se muestra tal cual", () => {
  expect(parseApiError(error422("El entrenador ya tiene una clase a esa hora"))).toBe(
    "El entrenador ya tiene una clase a esa hora",
  );
});

test("sin respuesta del servidor se dice que es de conexión, no del formulario", () => {
  expect(parseApiError(new AxiosError("Network Error"))).toBe("Network Error");
});

test("lo que no es un error de axios cae al mensaje de respaldo", () => {
  expect(parseApiError(new Error("boom"), "Error guardando clase")).toBe("Error guardando clase");
});
