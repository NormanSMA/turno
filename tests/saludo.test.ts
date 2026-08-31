/**
 * Cómo se le habla a alguien por su nombre.
 *
 * Salió de un caso real: `angarciam@uamv.edu.ni` hacía que la portada saludara
 * "Buenas noches, Angarciam" a Adriana García Mayorga. Un nombre inventado a
 * partir del correo es lo primero que ve al entrar, y está mal.
 */

import { describe, expect, it } from "vitest";
import {
  comoIdentificar,
  nombreParaSaludar,
  normalizarNombre,
} from "@/core/saludo";

describe("cuando NO se sabe el nombre", () => {
  it("no se inventa: se saluda sin nombre", () => {
    // La regla entera. `null` es un resultado válido, no un error.
    expect(nombreParaSaludar(null)).toBeNull();
    expect(nombreParaSaludar(undefined)).toBeNull();
    expect(nombreParaSaludar("")).toBeNull();
    expect(nombreParaSaludar("   ")).toBeNull();
  });

  it("para IDENTIFICAR sí gana el correo", () => {
    // Al revés que al saludar: en una lista de accesos una fila vacía no
    // identifica a nadie, mientras que el correo sí.
    expect(comoIdentificar(null, "angarciam@uamv.edu.ni")).toBe(
      "angarciam@uamv.edu.ni",
    );
  });
});

describe("saludo", () => {
  it("usa solo el primer nombre", () => {
    // A alguien se lo saluda por su nombre, no por su nombre completo.
    expect(nombreParaSaludar("Adriana Noemi García Mayorga")).toBe("Adriana");
  });

  it("arregla lo que viene en mayúsculas", () => {
    // Las listas de matrícula llegan así, y grita en una interfaz.
    expect(nombreParaSaludar("ADRIANA NOEMI GARCIA MAYORGA")).toBe("Adriana");
  });

  it("tolera espacios de más", () => {
    expect(nombreParaSaludar("  adriana   noemi  ")).toBe("Adriana");
  });
});

describe("normalización del nombre completo", () => {
  it("capitaliza sin romper los acentos", () => {
    expect(normalizarNombre("ADRIANA NOEMI GARCIA MAYORGA")).toBe(
      "Adriana Noemi Garcia Mayorga",
    );
    expect(normalizarNombre("josé maría")).toBe("José María");
  });

  it("deja las partículas en minúscula, salvo al principio", () => {
    expect(normalizarNombre("MARÍA DE LOS ÁNGELES")).toBe(
      "María de los Ángeles",
    );
    // Si el apellido abre el nombre, la partícula sí va en mayúscula.
    expect(normalizarNombre("DE LA TORRE")).toBe("De la Torre");
  });

  it("capitaliza después de guion y de apóstrofo", () => {
    // "Ana-maría" y "O'connor" se ven como errores de tipeo.
    expect(normalizarNombre("ANA-MARÍA")).toBe("Ana-María");
    expect(normalizarNombre("O'CONNOR")).toBe("O'Connor");
  });

  it("un nombre vacío es null, no una cadena vacía", () => {
    // Así quien lo consume tiene que decidir explícitamente qué hacer sin
    // nombre, en vez de pintar un hueco sin darse cuenta.
    expect(normalizarNombre("   ")).toBeNull();
  });
});
