/**
 * ¿El error viene de una aplicación que quedó vieja?
 *
 * Los fragmentos de `/_next/static` llevan hash: cada compilación genera
 * nombres nuevos y borra los viejos del servidor. Una pestaña abierta durante
 * un despliegue conserva en memoria el mapa anterior, y al navegar a una
 * pantalla que todavía no había cargado pide un archivo que ya no existe.
 *
 * Vive acá y no en el componente para poder probarlo: distinguir esto de un
 * corte de red decide qué se le ofrece al usuario, y ofrecer "probar de nuevo"
 * ante un fragmento inexistente lo deja en un callejón.
 */
export function esVersionVieja(error: {
  name?: string;
  message?: string;
}): boolean {
  const texto = `${error.name ?? ""} ${error.message ?? ""}`;
  return /ChunkLoadError|Loading chunk|Failed to load chunk|Importing a module script failed|error loading dynamically imported module/i.test(
    texto,
  );
}
