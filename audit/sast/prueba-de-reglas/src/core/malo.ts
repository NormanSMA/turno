// Fixture: código deliberadamente malo, para comprobar que las reglas MUERDEN.
// No se compila ni se importa desde ningún lado; existe solo para el SAST.
import { redirect } from "next/navigation";

export function exportarCsv(filas: string[][]) {
  return filas.map((f) => f.join(",")).join("\n"); // turno-csv-sin-serializar
}

export function decidir() {
  const ahora = new Date(); // turno-nucleo-sin-reloj-propio
  return ahora.getHours() > 12;
}

export function saludo() {
  return "Pedido listo 🎉"; // turno-sin-emojis
}

export function volver(params: URLSearchParams) {
  const destino = params.get("volver");
  redirect(destino!); // turno-volver-sin-validar
}

declare function aPedidoAdmitido(p: unknown): unknown;
export async function reservarMal(prisma: any, clave: string) {
  const previo = await prisma.pedido.findUnique({
    where: { idempotencyKey: clave },
    include: { franja: true },
  });
  return aPedidoAdmitido(previo); // turno-idempotencia-sin-comprobar
}
