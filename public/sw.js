/**
 * Service worker de TURNO.
 *
 * El sistema ya reconocía que el WiFi del campus se corta —es la razón del
 * sondeo del ADR-05— pero la aplicación seguía dependiendo de la red para
 * mostrar cualquier cosa. Eso falla justo en el peor momento: el estudiante
 * camina al comercio con la pantalla abierta, pierde la señal en el pasillo, y
 * llega al mostrador sin lo único que necesita, que es su código de retiro.
 *
 * Este archivo arregla ese modo de falla concreto. No es "soporte offline"
 * genérico: es que el código y la hora sobrevivan a la caída de la red.
 *
 * Tres estrategias, según lo que se pide:
 *
 *   · Estáticos de la compilación (`/_next/static`) — CACHE FIRST. Llevan hash
 *     en el nombre, así que un archivo dado nunca cambia de contenido; ir a la
 *     red a revalidar sería gastar batería para confirmar lo obvio.
 *
 *   · Navegaciones — NETWORK FIRST, con la última copia como respaldo y
 *     `/sin-conexion` como último recurso. Primero la red porque el estado del
 *     pedido cambia; el respaldo existe para que la app abra igual.
 *
 *   · Lecturas de pedidos (`GET /api/pedidos/...`) — NETWORK FIRST con copia.
 *     Es lo que hace que la pantalla de seguimiento muestre el código aunque no
 *     haya señal. La pantalla marca la copia como desactualizada; ver abajo la
 *     cabecera `X-Turno-Desde-Cache`.
 *
 * Lo que NO se guarda nunca: nada que no sea GET, y nada de `/api/auth`. Un
 * token o una respuesta de sesión en un caché del disco es una credencial
 * esperando a que alguien abra el navegador después.
 *
 * PRIVACIDAD — los pedidos guardados son datos personales de quien inició
 * sesión, y el teléfono puede prestarse. Por eso `borrarTodo` se dispara al
 * cerrar sesión (ver `src/lib/sw-cliente.ts`), no solo al cambiar de versión.
 */

/**
 * La versión sale del `?v=` con que la página registra este worker, y ese
 * valor cambia en cada compilación (ver `next.config.ts`).
 *
 * No es cosmético. Los fragmentos de `/_next/static` llevan hash en el nombre,
 * así que una compilación nueva genera nombres nuevos y borra los viejos del
 * servidor. Una página guardada de la compilación ANTERIOR apunta a fragmentos
 * que ya no existen: el usuario que vuelve después de un despliegue recibiría
 * una pantalla rota, y peor, una que se repara sola solo si sabe vaciar el
 * caché. Al cambiar la versión, `activate` borra todo lo de la anterior.
 */
const VERSION = `turno-${new URL(self.location.href).searchParams.get("v") ?? "0"}`;
const ESTATICOS = `${VERSION}-estaticos`;
const PAGINAS = `${VERSION}-paginas`;
const DATOS = `${VERSION}-datos`;
const MIOS = [ESTATICOS, PAGINAS, DATOS];

const RESPALDO_SIN_CONEXION = "/sin-conexion";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(PAGINAS)
      .then((c) => c.add(RESPALDO_SIN_CONEXION))
      // Si la página de respaldo no se puede precargar, el worker igual sirve:
      // el resto de las estrategias no dependen de ella. Fallar la instalación
      // por esto dejaría a la app sin ninguna protección.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves.filter((k) => !MIOS.includes(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Cierre de sesión: la página pide borrar todo rastro local. */
self.addEventListener("message", (evento) => {
  if (evento.data?.tipo !== "borrar-todo") return;
  evento.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.map((k) => caches.delete(k)))),
  );
});

/**
 * Busca en UN caché concreto, no en todos.
 *
 * `caches.match(req)` a secas recorre todos los cachés del origen, incluidos
 * los de una versión anterior que todavía no terminó de borrarse. Acotarlo
 * evita servir una página de la compilación vieja justo en el arranque, que es
 * el momento en que esa carrera existe.
 */
async function buscarEn(nombre, peticion) {
  const c = await caches.open(nombre);
  return c.match(peticion);
}

/** Copia la respuesta al caché sin bloquear la entrega al usuario. */
function guardar(nombre, peticion, respuesta) {
  const copia = respuesta.clone();
  caches.open(nombre).then((c) => c.put(peticion, copia)).catch(() => undefined);
  return respuesta;
}

/**
 * Marca una respuesta servida desde el caché.
 *
 * La pantalla necesita distinguir "esto acaba de llegar del servidor" de "esto
 * es lo último que supimos". Mostrar datos viejos sin decirlo es peor que no
 * mostrarlos: el estudiante creería que su pedido sigue en preparación cuando
 * ya lo marcaron listo.
 */
async function marcarComoCache(respuesta) {
  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set("X-Turno-Desde-Cache", "1");
  return new Response(await respuesta.blob(), {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: cabeceras,
  });
}


/**
 * Red primero, pero preguntando si algo cambió (ADR-14).
 *
 * La API va con `Cache-Control: no-store`, así que el navegador no revalida
 * por su cuenta: si nadie manda `If-None-Match`, el servidor arma la consulta
 * completa —items, eventos, franja, comercio— diez veces por minuto para
 * devolver siempre lo mismo. Quien tiene la copia anterior es este worker, así
 * que es él quien puede preguntar.
 *
 * El servidor NO contesta 304: en Next 16 un 304 devuelto desde un Route
 * Handler no llega al cliente (ver `sinCambios` en `src/lib/http.ts`). Contesta
 * 200 con un cuerpo mínimo y la cabecera `X-Turno-Sin-Cambios`, que es lo que
 * se mira acá. El ahorro real igual ocurre: la consulta pesada no se ejecuta.
 *
 * Esa respuesta NO se marca con `X-Turno-Desde-Cache`. Esa otra cabecera
 * significa "esto es lo último que supimos, puede estar viejo"; ésta significa
 * lo contrario —el servidor acaba de confirmar que sigue vigente—. Confundirlas
 * haría aparecer el cartel de "sin conexión" en una pantalla perfectamente
 * actualizada.
 */
async function revalidarPedido(peticion) {
  const guardada = await buscarEn(DATOS, peticion);
  const etag = guardada?.headers.get("ETag");

  const conValidador = etag
    ? new Request(peticion, { headers: nuevasCabeceras(peticion, etag) })
    : peticion;

  try {
    const r = await fetch(conValidador);

    // Nada cambió: se sirve la copia, que está vigente y completa.
    if (guardada && r.headers.get("X-Turno-Sin-Cambios") === "1") {
      return guardada.clone();
    }
    if (r.ok) return guardar(DATOS, peticion, r);
    return r;
  } catch {
    // Sin red: la última copia, y esta vez sí marcada como posiblemente vieja.
    if (guardada) return marcarComoCache(guardada);
    return new Response(
      JSON.stringify({ error: "Sin conexión y sin copia local." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

/** Copia las cabeceras de la petición y agrega el validador. */
function nuevasCabeceras(peticion, etag) {
  const h = new Headers(peticion.headers);
  h.set("If-None-Match", etag);
  return h;
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth")) return;

  // 1. Estáticos con hash: caché primero.
  if (url.pathname.startsWith("/_next/static")) {
    evento.respondWith(
      buscarEn(ESTATICOS, peticion).then(
        (hit) =>
          hit ??
          fetch(peticion).then((r) => guardar(ESTATICOS, peticion, r)),
      ),
    );
    return;
  }

  // 2. Lecturas de pedidos: red primero, con revalidación y copia de respaldo.
  if (url.pathname.startsWith("/api/pedidos")) {
    evento.respondWith(revalidarPedido(peticion));
    return;
  }

  // 3. Navegaciones: red primero, última copia, y si no, la página de respaldo.
  if (peticion.mode === "navigate") {
    evento.respondWith(
      fetch(peticion)
        .then((r) => (r.ok ? guardar(PAGINAS, peticion, r) : r))
        .catch(
          async () =>
            (await buscarEn(PAGINAS, peticion)) ??
            (await buscarEn(PAGINAS, RESPALDO_SIN_CONEXION)) ??
            new Response("Sin conexión.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }),
        ),
    );
  }
});

/* ===================== Web Push (ADR-14) =====================
 *
 * Lo anterior de este archivo resuelve que la aplicación ABRA sin red. Esto
 * resuelve lo contrario: que el estudiante se entere sin tener la aplicación
 * abierta. `src/lib/aviso.ts` ya avisaba con la Notification API, pero solo
 * mientras la página siguiera cargada en alguna pestaña — y el caso real es
 * que confirma el pedido, guarda el teléfono y camina.
 */

self.addEventListener("push", (evento) => {
  // Sin datos no se muestra nada. Un aviso vacío es peor que ninguno: el
  // usuario lo abre, no encuentra nada y aprende a ignorar los siguientes.
  if (!evento.data) return;

  let carga;
  try {
    carga = evento.data.json();
  } catch {
    return;
  }
  if (!carga || !carga.titulo) return;

  evento.waitUntil(
    self.registration.showNotification(carga.titulo, {
      body: carga.cuerpo ?? "",
      // `tag` fija la identidad: una reentrega del mismo aviso REEMPLAZA a la
      // anterior en vez de apilarse. Nadie quiere cuatro notificaciones del
      // mismo pedido.
      tag: carga.tag ?? "turno",
      renotify: true,
      icon: "/icon",
      badge: "/icon",
      // Dos pulsos cortos: se distingue de una llamada sin ser alarmante.
      vibrate: [120, 60, 120],
      // La URL viaja en `data` y no en el cuerpo: `notificationclick` la
      // necesita, y el cuerpo es texto que lee una persona.
      data: { url: carga.url ?? "/mis-pedidos" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(
    evento.notification.data?.url ?? "/mis-pedidos",
    self.location.origin,
  );

  // Nunca navegar fuera de este origen desde un aviso. Es el mismo criterio
  // del RNF-15 para el `volver` del inicio de sesión: un destino externo
  // controlado por el contenido del mensaje es una redirección abierta.
  if (destino.origin !== self.location.origin) return;

  evento.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((ventanas) => {
        // Si ya hay una pestaña de TURNO abierta se reutiliza. Abrir una
        // segunda dejaría al estudiante con dos copias de su pedido y la
        // primera desactualizada.
        for (const v of ventanas) {
          if (new URL(v.url).origin === self.location.origin && "focus" in v) {
            return v.navigate ? v.navigate(destino.href).then((c) => c && c.focus()) : v.focus();
          }
        }
        return self.clients.openWindow(destino.href);
      }),
  );
});

/**
 * El navegador puede rotar el endpoint de una suscripción por su cuenta.
 * Cuando pasa, la suscripción guardada en el servidor deja de servir y los
 * avisos se pierden en silencio — el peor modo de falla posible, porque nadie
 * se entera hasta que un estudiante reclama que nunca le avisaron.
 *
 * `applicationServerKey` sale de la suscripción vieja, así que este archivo no
 * necesita conocer la clave VAPID.
 */
self.addEventListener("pushsubscriptionchange", (evento) => {
  const clave = evento.oldSubscription?.options?.applicationServerKey;
  if (!clave) return;

  evento.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: clave })
      .then((sus) => {
        const j = sus.toJSON();
        return fetch("/api/push/suscripcion", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            endpoint: sus.endpoint,
            p256dh: j.keys?.p256dh,
            auth: j.keys?.auth,
          }),
        });
      })
      .catch(() => undefined),
  );
});
