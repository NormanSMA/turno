"use client";

/**
 * Pantalla de pedido del estudiante.
 *
 * Orden del flujo, deliberado: menú → hora → confirmar. La identidad se pide
 * recién al confirmar (§11.3), así que un estudiante que nunca usó TURNO puede
 * ver el menú y armar el pedido sin fricción.
 *
 * Layout: una columna en móvil con barra de acción fija abajo; en escritorio,
 * dos columnas con el pedido y las horas en una columna adherida. No es solo
 * "que quepa": en escritorio el resumen deja de ser una interrupción y pasa a
 * ser contexto permanente, que es lo que hace falta para comparar horas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { ImagenProducto } from "@/components/ImagenProducto";
import { Navegacion } from "@/components/Navegacion";
import { ReglaFranjas } from "@/components/ReglaFranjas";
import { Esqueleto, ErrorVista, Vacio } from "@/components/estados-ui";
import { RevisarPedido } from "@/components/RevisarPedido";
import { Icono } from "@/components/iconos";
import { ComprobanteImpreso } from "@/components/ComprobanteImpreso";
import {
  HojaFranjaAgotada,
  type AlternativaFranja,
} from "@/components/HojaFranjaAgotada";
import { HojaCambios } from "@/components/HojaCambios";
import { HojaSesion } from "@/components/HojaSesion";
import {
  AvisoSinConexion,
  useHayRed,
} from "@/components/AvisoSinConexion";
import { pulso, volarAlCarrito, conTransicionDeVista } from "@/lib/movimiento";
import { useAhora } from "@/lib/reloj";
import {
  textoAccion,
  veredictoDeTurno,
  type EstadoAccion,
} from "@/core/cabe";
import { rearmarCarrito } from "@/core/repetir";
import {
  guardarCarrito,
  leerCarritoGuardado,
  olvidarCarrito,
} from "@/lib/carrito";
import { revalidarCarrito, type Cambio } from "@/core/revalidar";
import {
  api,
  confirmarPedido,
  cordobas,
  ErrorApi,
  horaCorta,
  type RespuestaFranjas,
  type RespuestaPedido,
} from "@/lib/cliente";

export interface ProductoUI {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precio: string;
  tiempoPreparacionMin: number;
  anticipable: boolean;
  disponible: boolean;
  elegible: boolean;
}

export interface ComercioUI {
  id: string;
  nombre: string;
  slug: string;
  /// Dónde queda. Va en el comprobante: el estudiante lo lee al llegar.
  ubicacion: string | null;
  estadoOperacion: "ABIERTO" | "PAUSADO" | "CERRADO";
  anchoFranjaMin: number;
  tiempoMinAnticipable: number;
}

/**
 * Traduce `?agregar=<id>&cant=<n>` a un carrito inicial.
 *
 * Valida contra el menú actual igual que `?repetir=`: el id viene de la URL,
 * así que puede apuntar a un producto de otro comercio, archivado, agotado o no
 * anticipable. Sembrar el carrito con algo que el motor de admisión va a
 * rechazar produce un error incomprensible recién al confirmar.
 */
function sembrarDesdeUrl(
  parametros: URLSearchParams | ReadonlyURLSearchParams,
  productos: ProductoUI[],
): Record<string, number> {
  const id = parametros.get("agregar");
  if (!id) return {};

  const producto = productos.find((p) => p.id === id);
  if (!producto || !producto.anticipable || !producto.disponible) return {};

  const pedidas = Number(parametros.get("cant") ?? 1);
  const cantidad = Number.isFinite(pedidas)
    ? Math.min(20, Math.max(1, Math.trunc(pedidas)))
    : 1;

  return { [id]: cantidad };
}

/**
 * Con qué carrito abre el menú.
 *
 * Una sola función y una sola pasada, porque hay dos fuentes posibles y el
 * orden entre ellas no es arbitrario:
 *
 *   1. **La URL** (`?agregar=`, o lo que sembró `?repetir=`). Es una intención
 *      de AHORA: alguien acaba de tocar algo para llegar acá.
 *   2. **Lo guardado.** Es una intención de antes.
 *
 * La de ahora gana siempre. Pisar un toque recién dado con un carrito de hace
 * media hora sería exactamente al revés de lo que la persona pidió.
 *
 * Se resuelve en la inicialización y no en un efecto: así el carrito llega
 * poblado en el primer render, sin el parpadeo de "vacío y de golpe con algo",
 * y sin encadenar un `setState` dentro de un efecto.
 */
function carritoInicial(
  parametros: URLSearchParams | ReadonlyURLSearchParams,
  productos: ProductoUI[],
  slug: string,
): { carrito: Record<string, number>; restauradoHaceMin: number | null } {
  const sembrado = sembrarDesdeUrl(parametros, productos);
  if (Object.keys(sembrado).length > 0) {
    return { carrito: sembrado, restauradoHaceMin: null };
  }

  const d = leerCarritoGuardado(slug);
  if (d.tipo !== "RESTAURAR") return { carrito: {}, restauradoHaceMin: null };

  // Solo lo vigente: un agotado devuelto en silencio produce un rechazo
  // incomprensible recién al confirmar, después de elegir hora.
  const vigente: Record<string, number> = {};
  for (const [id, n] of Object.entries(d.carrito)) {
    const prod = productos.find((x) => x.id === id);
    if (prod && prod.disponible && prod.anticipable) vigente[id] = Number(n);
  }

  if (Object.keys(vigente).length === 0) {
    olvidarCarrito();
    return { carrito: {}, restauradoHaceMin: null };
  }

  return { carrito: vigente, restauradoHaceMin: d.minutos };
}

/**
 * Los 409 que la hoja de recuperación puede resolver.
 *
 * Todos comparten una forma: la hora elegida no sirve, pero el pedido sí — y
 * el servidor manda alternativas. Cualquier otro 409 (el comercio cerró, un
 * producto dejó de ser anticipable, ya hay demasiados pedidos activos) no se
 * arregla eligiendo otra hora, así que ofrecer una lista de horas ahí
 * confunde en vez de ayudar.
 */
const MOTIVOS_DE_FRANJA = new Set([
  "SIN_FRANJA_DISPONIBLE",
  "FUERA_DE_CUTOFF",
  "FRANJA_INEXISTENTE",
  "CARGA_EXCEDE_CAPACIDAD_TOTAL",
]);

export function ClienteComercio({
  comercio,
  productos,
}: {
  comercio: ComercioUI;
  productos: ProductoUI[];
}) {
  const parametros = useSearchParams();
  /*
   * "Pedir esto": `?agregar=<productoId>&cant=<n>` siembra el carrito.
   *
   * Lo usa la hoja de detalle de Explorar. Sin esto, tocar un producto allá te
   * dejaba en el menú teniendo que buscarlo otra vez — la tarjeta prometía una
   * acción y entregaba una lista.
   *
   * Va en el inicializador y NO en un efecto: así el carrito llega poblado en
   * el primer render, sin el parpadeo de "vacío y de golpe con algo", y sin el
   * render extra que encadena un `setState` dentro de un efecto.
   */
  // Una sola pasada para las dos cosas: qué hay en el carrito y si vino de algo
  // guardado. Calcularlo dos veces podría dar resultados distintos.
  const [inicial] = useState(() =>
    carritoInicial(parametros, productos, comercio.slug),
  );
  const [carrito, setCarrito] = useState<Record<string, number>>(
    inicial.carrito,
  );
  // El reloj entra por estado: el veredicto depende de si la hora todavía se
  // puede reservar, y leerlo durante el render sería impuro. Va con el resto de
  // los hooks, antes de cualquier salida temprana.
  const ahoraVeredicto = useAhora(20_000);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"TODO" | "RAPIDO" | "COMPLETO">("TODO");
  const [franjas, setFranjas] = useState<RespuestaFranjas | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<RespuestaPedido | null>(null);
  /*
   * El rechazo por capacidad, con SUS alternativas.
   *
   * El servidor las manda en `detalle.alternativas` desde siempre; el cliente
   * las descartaba y solo pintaba el mensaje. Guardarlas es lo que convierte un
   * error en una recuperación.
   */
  const [rechazo, setRechazo] = useState<{
    motivo: string;
    alternativas: AlternativaFranja[];
  } | null>(null);

  /*
   * El menú VIGENTE, separado del que llegó del servidor al cargar la página.
   *
   * Entre que el estudiante arma el pedido y lo confirma pasan minutos, y el
   * comercio puede agotar algo o cambiar un precio en ese rato. El `prop` es
   * una foto del momento de cargar; esto es lo que hay ahora.
   */
  const [menu, setMenu] = useState<ProductoUI[]>(productos);

  /*
   * Precio y nombre al momento de AGREGAR cada producto.
   *
   * Sin esta foto no se puede detectar un cambio de precio: el carrito solo
   * guarda cantidades, y comparar el menú contra sí mismo no dice nada.
   */
  const [foto, setFoto] = useState<
    Record<string, { precio: string; nombre: string }>
  >(() => {
    /*
     * Poblada con lo que YA venga en el carrito.
     *
     * Antes solo se llenaba al tocar "agregar", así que un carrito sembrado por
     * URL o restaurado comparaba contra el "0" del respaldo y anunciaba
     * "Cambió de precio: C$ 0.00 → C$ 150.00". Gasta la confianza del aviso
     * justo donde el aviso tiene que creerse.
     */
    const inicio: Record<string, { precio: string; nombre: string }> = {};
    for (const id of Object.keys(inicial.carrito)) {
      const p = productos.find((x) => x.id === id);
      if (p) inicio[id] = { precio: p.precio, nombre: p.nombre };
    }
    return inicio;
  });

  const [cambios, setCambios] = useState<Cambio[]>([]);

  /*
   * Sin red no se confirma, y punto.
   *
   * Es el único de los tres estados de desconexión que BLOQUEA. Navegar sin red
   * muestra datos viejos y molesta; confirmar sin red podría reservar una hora
   * que ya no existe y —peor— hacerle creer al estudiante que tiene un pedido
   * que nunca se creó. Eso se descubre en el mostrador, que es el peor lugar.
   */
  const hayRed = useHayRed();
  const [revisando, setRevisando] = useState(false);

  // La clave de idempotencia identifica un INTENTO DE COMPRA, no un clic ni un
  // montaje del componente: si el usuario toca "confirmar" tres veces, las tres
  // llevan la misma clave y el servidor crea un solo pedido.
  //
  // Se mantiene igual también cuando la reserva se rechaza por capacidad: ese
  // rechazo no creó nada, así que reintentar con otra franja sigue siendo el
  // mismo intento. Solo se renueva al empezar un pedido NUEVO — si no, el
  // segundo pedido de la sesión reusaría la clave del primero y el servidor
  // devolvería aquel pedido en vez de crear este.
  //
  // Va en estado con inicializador perezoso, no en una ref. `useRef(uuid())`
  // evaluaría el argumento en cada render y descartaría todos menos el primero;
  // y la variante `if (ref.current === null) ref.current = …` muta durante el
  // render, que se rompe con el doble render de Strict Mode y con render
  // concurrente. El estado no tiene ninguno de los dos problemas y además hace
  // explícito que renovar la clave ES un cambio de estado del pedido.
  const [clave, setClave] = useState(() => crypto.randomUUID());

  // "Pedir lo mismo": `?repetir=<id>` rearma el carrito con un pedido pasado.
  //
  // Se filtra contra el menú ACTUAL a propósito. Un producto puede haberse
  // archivado, agotado o dejado de ser anticipable desde la última vez; meterlo
  // al carrito produciría un rechazo incomprensible recién al confirmar. Lo que
  // no está se dice acá, por su nombre, antes de que el estudiante elija hora.
  const [sesionVencida, setSesionVencida] = useState(false);
  const [restauradoHaceMin, setRestauradoHaceMin] = useState<number | null>(
    inicial.restauradoHaceMin,
  );
  const [omitidos, setOmitidos] = useState<string[]>([]);
  useEffect(() => {
    const repetir = parametros.get("repetir");
    if (!repetir) return;
    let cancelado = false;

    api<{ items: { productoId: string; nombre: string; cantidad: number }[] }>(
      `/api/pedidos/${repetir}`,
    )
      .then((anterior) => {
        if (cancelado) return;
        const { carrito: nuevo, omitidos: fuera } = rearmarCarrito(
          anterior.items,
          productos,
        );
        setCarrito(nuevo);
        setOmitidos(fuera);
      })
      .catch(() => {
        // Un pedido ajeno o borrado devuelve 403/404. No es un error que
        // valga interrumpir: el menú está y se puede pedir normalmente.
      });

    return () => {
      cancelado = true;
    };
  }, [parametros, productos]);


  const items = useMemo(
    () =>
      Object.entries(carrito)
        .filter(([, c]) => c > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad })),
    [carrito],
  );

  /*
   * Las líneas del pedido, ya resueltas contra el menú.
   *
   * El `find(...)!` que había antes tumbaba la pantalla entera —error de
   * interfaz, pantalla en blanco— si el carrito tenía un id que el menú ya no
   * trae. No es hipotético: pasa cuando el comercio archiva un producto
   * mientras alguien lo tiene en el carrito, y también con un `?agregar=` de
   * un enlace viejo.
   *
   * `flatMap` con array vacío descarta la línea imposible en vez de reventar.
   * El pedido se envía igual con lo que sí existe, y el servidor vuelve a
   * validar todo dentro de la transacción (RNF-05), así que descartar acá no
   * abre ningún hueco.
   */
  const lineas = useMemo(
    () =>
      items.flatMap((i) => {
        const p = menu.find((x) => x.id === i.productoId);
        return p ? [{ producto: p, cantidad: i.cantidad }] : [];
      }),
    [items, menu],
  );

  /**
   * Trae el menú de nuevo y compara contra lo que el usuario tiene armado.
   *
   * Devuelve los cambios además de guardarlos, para que quien confirma pueda
   * frenar antes de mandar un pedido que ya sabemos que va a fallar.
   */
  const revalidar = useCallback(async (): Promise<Cambio[]> => {
    try {
      const r = await api<{ productos: ProductoUI[] }>(
        `/api/comercios/${comercio.slug}/menu`,
      );
      setMenu(r.productos);

      const actuales = Object.entries(carrito)
        .filter(([, c]) => c > 0)
        .map(([productoId, cantidad]) => {
          const vigente = r.productos.find((x) => x.id === productoId);
          // Sin foto, el precio VIGENTE: un precio que nunca se vio no puede
          // haber cambiado. Segunda barrera, la foto ya se inicializa arriba.
          return {
            productoId,
            cantidad,
            precio: foto[productoId]?.precio ?? vigente?.precio ?? "0",
            nombre: foto[productoId]?.nombre ?? vigente?.nombre ?? "",
          };
        });
      if (actuales.length === 0) return [];

      const rev = revalidarCarrito(actuales, r.productos);
      if (!rev.sinNovedades) {
        // El carrito depurado ANTES de mostrar el aviso: si el usuario cierra
        // la hoja sin leerla, igual queda con un pedido que se puede confirmar.
        setCarrito(rev.carrito);
        setCambios(rev.cambios);
      }
      return rev.cambios;
    } catch {
      // Sin red no se puede revalidar. No es motivo para bloquear: el servidor
      // vuelve a validar todo dentro de la transacción (RNF-05).
      return [];
    }
  }, [comercio.slug, carrito, foto]);

  /*
   * Revalidar al volver a la pestaña.
   *
   * Es el momento exacto en que el carrito puede estar viejo: el estudiante lo
   * armó, se fue a clase, y vuelve veinte minutos después. Va atado a la
   * visibilidad y no a un intervalo, por lo mismo que el ADR-14: sondear en
   * segundo plano gasta el presupuesto de cómputo en nada.
   */
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void revalidar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [revalidar]);


  // Recalcular las franjas cada vez que cambia el carrito: qué horas caben
  // depende de w(i), así que la lista no es estática.
  useEffect(() => {
    let cancelado = false;
    if (items.length === 0) {
      // Diferido a un microtask: limpiar el estado en el cuerpo del efecto
      // encadena un render extra por cada cambio del carrito.
      queueMicrotask(() => {
        if (cancelado) return;
        setFranjas(null);
        setElegida(null);
      });
      return () => {
        cancelado = true;
      };
    }
    api<RespuestaFranjas>(`/api/comercios/${comercio.slug}/franjas`, {
      method: "POST",
      body: JSON.stringify({ items }),
    })
      .then((r) => {
        if (cancelado) return;
        setFranjas(r);
        setElegida((prev) => {
          const sigue = prev && r.opciones.some((o) => o.franjaId === prev);
          if (sigue) return prev;
          // En condición B se preselecciona la sugerida: esa preselección ES la
          // intervención. En A no se preselecciona nada.
          return r.condicion === "B" ? r.sugeridaId : null;
        });
      })
      .catch(() => !cancelado && setFranjas(null));
    return () => {
      cancelado = true;
    };
  }, [items, comercio.slug]);

  const cambiar = useCallback(
    (id: string, delta: number) => {
      setCarrito((c) => ({
        ...c,
        [id]: Math.max(0, Math.min(10, (c[id] ?? 0) + delta)),
      }));

      // Foto del precio y el nombre al AGREGAR. Es contra esto que se compara
      // después: sin ella no hay forma de saber que algo cambió.
      if (delta > 0) {
        const p = menu.find((x) => x.id === id);
        if (p) {
          setFoto((f) =>
            f[id] ? f : { ...f, [id]: { precio: p.precio, nombre: p.nombre } },
          );
        }
      }
      setError(null);
    },
    [menu],
  );

  /**
   * Reintenta con la hora que el estudiante eligió en la hoja de recuperación.
   *
   * Va derecho a confirmar en vez de solo seleccionar la franja: el usuario ya
   * tomó la decisión al tocar "Reservar 10:40", y devolverlo a la lista para
   * que confirme otra vez sería cobrarle dos toques por un problema que no
   * causó.
   */
  function reintentarCon(franjaId: string) {
    setRechazo(null);
    setElegida(franjaId);
    // Un cuadro para que el estado quede aplicado antes de leerlo en confirmar.
    requestAnimationFrame(() => confirmar(franjaId));
  }

  async function confirmar(franjaForzada?: string) {
    // Se valida el tipo además de envolver la llamada: si mañana alguien vuelve
    // a pasar `confirmar` directo a un `onClick`, esto degrada a la franja
    // elegida en vez de mandar basura al servidor.
    const franja =
      typeof franjaForzada === "string" ? franjaForzada : elegida;
    if (!franjas || !franja) return;
    setEnviando(true);
    setError(null);

    /*
     * Última revalidación antes de comprometer.
     *
     * Si algo cambió, se frena acá y se muestra qué: mandar el pedido igual
     * produciría un rechazo del servidor con un mensaje que no dice cuál de los
     * productos era el problema. El usuario decide con los cambios a la vista.
     */
    const novedades = await revalidar();
    if (novedades.length > 0) {
      setRevisando(false);
      setEnviando(false);
      return;
    }
    try {
      const r = await confirmarPedido(clave, {
        comercioId: comercio.id,
        franjaId: franja,
        items,
        canalCaptacion: new URLSearchParams(location.search).get("canal"),
      });
      setRevisando(false);
      // El pedido ya existe en el servidor: conservar el carrito haría que
      // la próxima visita ofrezca rearmar algo que ya se pidió.
      olvidarCarrito();
      setConfirmado(r);
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 401) {
        // §40: venció al confirmar. Se guarda (cinturón: ya se persiste solo)
        // y se explica, en vez de empujar al login en silencio.
        guardarCarrito(comercio.slug, carrito);
        setRevisando(false);
        setSesionVencida(true);
        return;
      }
      /*
       * Un 409 de FRANJA no es un error: es una negociación. El servidor
       * rechazó la hora y propuso otras, así que se abre la hoja de
       * recuperación en vez de un cartel rojo.
       *
       * Pero solo esos. Antes cualquier 409 abría esa hoja, y con la lista de
       * alternativas vacía caía al texto genérico "la hora que elegiste ya no
       * tiene capacidad" — que es MENTIRA cuando el motivo real era otro. El
       * caso que lo destapó: con dos pedidos activos, el servidor responde
       * `LIMITE_PEDIDOS_ACTIVOS` y la pantalla decía "no hay hora" mientras la
       * regla mostraba 36 minutos libres. Un mensaje que contradice lo que se
       * ve en la misma pantalla es peor que no dar ninguno.
       */
      if (e instanceof ErrorApi && e.status === 409) {
        const detalle = e.detalle as
          | { alternativas?: AlternativaFranja[] }
          | undefined;
        setRevisando(false);

        if (MOTIVOS_DE_FRANJA.has(e.codigo)) {
          // `setElegida(null)` tiene sentido acá y solo acá: esa franja dejó de
          // ser una opción. Lo que NO se toca nunca es el carrito.
          setElegida(null);
          setRechazo({
            motivo: e.codigo,
            alternativas: detalle?.alternativas ?? [],
          });
          // Releer las horas por debajo: cuando cierre la hoja, la lista ya
          // está al día en vez de mostrar la foto vieja.
          setCarrito((c) => ({ ...c }));
          return;
        }

        // El resto son problemas reales del pedido, no de la hora. Se muestra
        // el motivo del servidor tal cual, que es el que sabe qué pasó.
        setError(e.message);
        return;
      }

      setError(
        e instanceof ErrorApi
          ? e.message
          : "No pudimos confirmar el pedido. Revisá tu conexión y probá de nuevo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  /** Vuelve al menú para armar otro pedido, desde cero. */
  const nuevoPedido = useCallback(() => {
    setClave(crypto.randomUUID());
    setConfirmado(null);
    setCarrito({});
    setFranjas(null);
    setElegida(null);
    setError(null);
    setRevisando(false);
    setBusqueda("");
    setFiltro("TODO");
    window.scrollTo({ top: 0 });
  }, []);

  // Cada cambio del carrito se persiste. Es barato y evita tener que acordarse
  // de guardarlo en los seis lugares que lo modifican.
  useEffect(() => {
    guardarCarrito(comercio.slug, carrito);
  }, [comercio.slug, carrito]);

  if (confirmado) {
    return (
      <Confirmacion
        pedido={confirmado}
        comercio={comercio}
        lineas={lineas}
        onNuevoPedido={nuevoPedido}
      />
    );
  }

  /*
   * PAUSADO y CERRADO no son lo mismo, y el estudiante los vive distinto.
   *
   * Pausado es temporal: la cocina está terminando lo que tiene y en un rato
   * vuelve a recibir. Cerrado es que hoy ya no. Darles el mismo cartel —"no
   * está recibiendo pedidos"— hace que quien podría esperar cinco minutos se
   * vaya a otro comercio.
   */
  const pausado = comercio.estadoOperacion === "PAUSADO";
  const cerrado = comercio.estadoOperacion !== "ABIERTO";
  const texto = busqueda.trim().toLowerCase();
  const coincide = (p: ProductoUI) =>
    !texto ||
    p.nombre.toLowerCase().includes(texto) ||
    (p.descripcion ?? "").toLowerCase().includes(texto);
  const pasaFiltro = (p: ProductoUI) =>
    filtro === "TODO" ||
    (filtro === "RAPIDO" ? p.tiempoPreparacionMin <= 10 : p.tiempoPreparacionMin > 10);

  const anticipables = productos.filter(
    (p) => p.elegible && coincide(p) && pasaFiltro(p),
  );
  const enMostrador = productos.filter((p) => !p.elegible && coincide(p));
  const hayPedido = items.length > 0 && !cerrado;
  // Unidades, no líneas: el contador del carrito cuenta cosas, y tres cafés
  // son tres cosas aunque sean una sola línea del pedido.
  const unidades = items.reduce((n, i) => n + i.cantidad, 0);
  const franjaElegida =
    franjas?.opciones.find((o) => o.franjaId === elegida) ?? null;

  /*
   * El veredicto y, con él, lo que dice el botón.
   *
   * Se mide contra la carga que el servidor ya calculó para este carrito
   * (`cargaEstimadaMin`), no contra una suma hecha acá: es el mismo número que
   * va a usar el motor de admisión, y dos formas de calcularlo son dos formas
   * de que no coincidan.
   */
  const veredicto = veredictoDeTurno(
    franjaElegida,
    franjas?.opciones ?? [],
    franjas?.cargaEstimadaMin ?? 0,
    ahoraVeredicto,
  );

  const estadoAccion: EstadoAccion = cerrado
    ? "CERRADO"
    : unidades === 0
      ? "VACIO"
      : !elegida
        ? "SIN_HORA"
        : veredicto?.tipo === "NO_CABE"
          ? "NO_CABE"
          : "LISTO";

  return (
    <>
      <Navegacion comercioSlug={comercio.slug} />

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-5 sm:pb-12">
        {/* ============================================== Volver
            En móvil, la flecha; en escritorio, las migas. Nunca las dos: dos
            formas de volver en la misma pantalla es una de más.

            No se confía en el gesto del navegador — en una PWA instalada no
            siempre existe— ni en `history.back()`, que en una llegada directa
            desde un enlace saca al estudiante de la aplicación. El destino es
            explícito. */}
        <div className="mb-4">
          <Link
            href="/explorar"
            aria-label="Volver a explorar"
            className="toque presiona -ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-borde bg-superficie sm:hidden"
          >
            <Icono nombre="atras" size={18} />
          </Link>
          <nav
            aria-label="Migas"
            className="hidden items-center gap-1.5 text-caption text-texto-2 sm:flex"
          >
            <Link href="/" className="hover:text-texto">
              Inicio
            </Link>
            <span aria-hidden className="text-texto-3">
              /
            </span>
            <Link href="/explorar" className="hover:text-texto">
              Explorar
            </Link>
            <span aria-hidden className="text-texto-3">
              /
            </span>
            <span className="truncate font-medium text-texto">
              {comercio.nombre}
            </span>
          </nav>
        </div>

        <header className="mb-5">
          {/* Cabecera de contexto: en una app de delivery diría "entregar en";
              acá el dato equivalente es DÓNDE se retira, porque no hay entrega.
              Cambiarlo por una dirección sería copiar la forma sin el fondo. */}
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-turno-claro text-marca-texto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5" aria-hidden>
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="etiqueta block">Retirás en</span>
              <span className="block truncate text-sm font-semibold">
                {comercio.nombre}
              </span>
            </span>
            <span
              className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                cerrado ? "bg-brasa-claro" : "bg-turno-claro"
              }`}
            >
              {pausado ? "Pausado" : cerrado ? "Cerrado" : "Abierto"}
            </span>
          </div>

          <h1 className="titulo text-4xl sm:text-5xl">
            ¿Qué vas a retirar hoy?
          </h1>

          {/* §41: se le devolvió el carrito. Decirlo importa — un carrito que
              aparece poblado sin explicación se lee como un error de la
              aplicación, no como una cortesía. Se puede descartar. */}
          {restauradoHaceMin !== null && unidades > 0 && (
            <div
              role="status"
              className="mt-4 flex items-start gap-3 rounded-md border border-borde bg-superficie px-4 py-3"
            >
              <span className="mt-0.5 shrink-0 text-marca-texto">
                <Icono nombre="repetir" size={16} />
              </span>
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">Seguimos donde quedaste.</span>{" "}
                Recuperamos el pedido que estabas armando
                {restauradoHaceMin >= 1
                  ? ` hace ${restauradoHaceMin} ${restauradoHaceMin === 1 ? "minuto" : "minutos"}`
                  : ""}
                . Los precios y la disponibilidad son los de ahora.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCarrito({});
                  olvidarCarrito();
                  setRestauradoHaceMin(null);
                }}
                className="toque shrink-0 text-caption font-semibold text-texto-2 underline"
              >
                Empezar de cero
              </button>
            </div>
          )}

          {omitidos.length > 0 && (
            <p
              role="status"
              className="mt-4 rounded-md border border-maiz bg-brasa-claro px-4 py-2.5 text-sm"
            >
              Rearmamos tu pedido anterior.{" "}
              {omitidos.length === 1
                ? `${omitidos[0]} ya no está disponible`
                : `${omitidos.join(", ")} ya no están disponibles`}
              , así que quedó fuera.
            </p>
          )}

        </header>

        {/* ================================ Buscar y filtrar — se quedan arriba
            Al bajar, la identidad del comercio se va y esto se queda: después
            de tres pantallazos de menú, cambiar de filtro no puede exigir
            volver hasta arriba.

            El fondo es sólido, no translúcido: las tarjetas pasan por debajo y
            un fondo con transparencia las deja leerse a través del filtro. En
            escritorio se descuelga los 72px de la barra superior, que también
            es pegajosa; en móvil esa barra no existe y va contra el borde. */}
        <div className="sticky top-0 z-10 -mx-4 mb-5 bg-fondo px-4 pb-3 pt-2 sm:-mx-5 sm:top-18 sm:px-5">
          <label className="flex items-center gap-2 rounded-full border border-borde bg-papel-alto px-4 py-2.5 focus-within:border-marca-texto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="h-4 w-4 shrink-0 text-tinta-suave" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="sr-only">Buscar en el menú</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el menú"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>

          {/* Los chips filtran por TIEMPO DE COCINA, no por tipo de comida: en
              un menú de siete platos categorizar por tipo no ayuda a nadie, y
              el tiempo es la variable que decide si el pedido entra en la
              franja que el estudiante tiene libre. */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                { id: "TODO", texto: "Todo" },
                { id: "RAPIDO", texto: "Hasta 10 min" },
                { id: "COMPLETO", texto: "Plato completo" },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filtro === c.id}
                // Con transición de vista: sin ella el menú se reemplaza de
                // golpe y el cambio se lee como una recarga. La API nativa —no
                // hay librería— y se degrada sola donde no existe o donde el
                // sistema pide menos movimiento.
                onClick={() => conTransicionDeVista(() => setFiltro(c.id))}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  filtro === c.id
                    ? "bg-tinta text-papel"
                    : "border border-borde bg-papel-alto text-tinta-suave"
                }`}
              >
                {c.texto}
              </button>
            ))}
          </div>
        </div>

        {/* Sin red mientras arma el pedido: se puede seguir mirando, pero el
            botón de confirmar se apaga y acá se explica por qué (§38). */}
        <AvisoSinConexion contexto="confirmando" className="mb-6" />

        {cerrado && (
          <div
            role="status"
            className={`mb-6 rounded-md border px-4 py-3.5 ${
              pausado
                ? "border-aviso/40 bg-atencion-suave"
                : "border-borde bg-superficie-2"
            }`}
          >
            <p className="flex items-center gap-2 text-cuerpo font-semibold">
              <Icono nombre={pausado ? "reloj" : "local"} size={18} />
              {pausado
                ? "Pedidos pausados por un rato"
                : `${comercio.nombre} está cerrado`}
            </p>
            <p className="mt-1 text-chico text-texto-2">
              {pausado
                ? "La cocina está terminando los pedidos que ya tiene. Probá de nuevo en unos minutos — podés dejar armado el tuyo mientras tanto."
                : "Hoy ya no recibe pedidos. Podés ver el menú y volver mañana."}
            </p>

            {/* Lo que más tranquiliza y nadie dice: una pausa NO cancela lo que
                ya reservaste. Sin esta línea, quien tiene un pedido en curso
                asume lo peor. */}
            <p className="mt-2 flex items-center gap-1.5 text-caption text-exito">
              <Icono nombre="palomita" size={14} />
              Si ya tenés un pedido confirmado, sigue en pie.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/explorar"
                className="presiona min-h-11 rounded-md border border-borde bg-superficie px-4 py-2.5 text-chico font-semibold"
              >
                Ver otros comercios
              </Link>
              <Link
                href="/mis-pedidos"
                className="presiona min-h-11 rounded-md px-4 py-2.5 text-chico font-semibold text-texto-2"
              >
                Mis pedidos
              </Link>
            </div>
          </div>
        )}

        <div className="gap-8 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start">
          <div>
            <section aria-labelledby="anticipables">
              <h2 id="anticipables" className="etiqueta mb-3">
                Se puede pedir por anticipado
              </h2>
              {anticipables.length === 0 && (
                <Vacio
                  titulo="Nada coincide"
                  texto="Proba con otra palabra o quita el filtro de tiempo."
                />
              )}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {anticipables.map((p, i) => (
                  <TarjetaProducto
                    key={p.id}
                    producto={p}
                    cantidad={carrito[p.id] ?? 0}
                    onCambiar={cambiar}
                    prioridad={i < 3}
                  />
                ))}
              </ul>
            </section>

            {enMostrador.length > 0 && (
              <section aria-labelledby="mostrador" className="mt-10">
                <h2 id="mostrador" className="etiqueta mb-1">
                  Solo en el mostrador
                </h2>
                {/* No es un castigo: pedir por anticipado algo que se prepara en
                    cero minutos ocupa una hora de retiro sin ahorrar nada. */}
                <p className="mb-3 max-w-md text-xs text-tinta-suave">
                  Se preparan en menos de {comercio.tiempoMinAnticipable}{" "}
                  minutos. Anticiparlos no te ahorra tiempo, así que se compran
                  al llegar.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {enMostrador.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-full border border-borde bg-papel-alto py-1 pl-1 pr-3 text-sm"
                    >
                      <span className="relative h-7 w-7 overflow-hidden rounded-full">
                        <ImagenProducto
                          nombre={p.nombre}
                          url={p.imagenUrl}
                          sizes="28px"
                        />
                      </span>
                      {p.nombre}
                      <span className="hora text-xs text-tinta-suave">
                        {cordobas(p.precio)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Columna de pedido: adherida en escritorio, hoja fija en móvil. */}
          <aside
            className={`mt-10 lg:sticky lg:top-20 lg:mt-0 ${
              hayPedido ? "" : "hidden lg:block"
            }`}
          >
            <div className="tarjeta p-4">
              <h2 className="etiqueta mb-3">Tu pedido</h2>

              {!hayPedido ? (
                <p className="text-sm text-tinta-suave">
                  Todavía no elegiste nada. Tocá el + de un producto para
                  empezar.
                </p>
              ) : (
                <>
                  <ul className="mb-4 space-y-1.5 text-sm">
                    {lineas.map(({ producto: p, cantidad }) => {
                      const i = { productoId: p.id, cantidad };
                      return (
                        <li key={i.productoId} className="flex justify-between gap-2">
                          <span>
                            <span className="hora font-semibold">
                              {i.cantidad}×
                            </span>{" "}
                            {p.nombre}
                          </span>
                          <span className="hora shrink-0 text-tinta-suave">
                            {cordobas(Number(p.precio) * i.cantidad)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <h3 className="etiqueta mb-2">Hora de retiro</h3>
                  {franjas ? (
                    <ReglaFranjas
                      opciones={franjas.opciones}
                      elegidaId={elegida}
                      cargaPedidoMin={franjas.cargaEstimadaMin}
                      mostrarSugerencia={franjas.condicion === "B"}
                      onElegir={setElegida}
                    />
                  ) : (
                    <div className="flex gap-1.5" aria-label="Buscando horas">
                      <Esqueleto className="h-[7.5rem] flex-1" />
                      <Esqueleto className="h-[7.5rem] flex-1" />
                      <Esqueleto className="h-[7.5rem] flex-1" />
                      <Esqueleto className="h-[7.5rem] flex-1" />
                    </div>
                  )}

                  {error && (
                    <div className="mt-3">
                      <ErrorVista titulo="No se pudo confirmar" texto={error} />
                    </div>
                  )}

                  <div className="mt-4 hidden items-center justify-between gap-3 lg:flex">
                    <span className="hora text-lg font-semibold">
                      {cordobas(franjas?.total ?? 0)}
                    </span>
                    <BotonConfirmar
                      estado={estadoAccion}
                      total={cordobas(franjas?.total ?? 0)}
                      enviando={enviando}
                      hayRed={hayRed}
                      onClick={() => {
                        if (
                          estadoAccion === "NO_CABE" &&
                          veredicto?.tipo === "NO_CABE"
                        ) {
                          if (veredicto.alternativa)
                            setElegida(veredicto.alternativa.franjaId);
                          return;
                        }
                        setRevisando(true);
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* `franjaElegida` en vez de `find(...)!`: si por una carrera entre el
          recálculo de franjas y la selección la hora ya no estuviera en la
          lista, la aserción de no-nulo reventaba con pantalla en blanco — y
          justo en el momento de confirmar, que es el peor. Sin hora válida
          simplemente no se abre la revisión. */}
      {/* Recuperación ante un rechazo por capacidad. Ver `HojaFranjaAgotada`:
          esto reemplaza al cartel rojo que descartaba las alternativas que el
          servidor ya venía calculando. */}
      {/* Lo que cambió mientras armaba. Ver `HojaCambios`: el servidor gana,
          pero nunca en silencio. */}
      <HojaCambios
        cambios={cambios}
        onContinuar={() => setCambios([])}
        onCerrar={() => setCambios([])}
      />

      {/* §40: la sesión venció al confirmar. Qué pasó, qué se conservó, qué
          podés hacer — en ese orden, antes de mandarte a ningún lado. */}
      <HojaSesion
        abierta={sesionVencida}
        volverA={`/c/${comercio.slug}`}
        unidades={unidades}
      />

      <HojaFranjaAgotada
        motivo={rechazo?.motivo ?? null}
        alternativas={rechazo?.alternativas ?? []}
        onElegir={reintentarCon}
        onCerrar={() => setRechazo(null)}
      />

      {revisando && franjas && franjaElegida && (
        <RevisarPedido
          comercio={comercio.nombre}
          lineas={lineas.map(({ producto: p, cantidad }) => ({
            nombre: p.nombre,
            cantidad,
            subtotal: String(Number(p.precio) * cantidad),
          }))}
          total={franjas.total}
          cargaMin={franjas.cargaEstimadaMin}
          franjaInicio={franjaElegida.inicio}
          franjaFin={franjaElegida.fin}
          enviando={enviando}
          /* Envuelto y no `onConfirmar={confirmar}`: el `onClick` del diálogo
             pasa el evento como primer argumento, y `confirmar` ahora recibe
             una franja opcional ahí. Sin la envoltura reservaba contra un
             `[object MouseEvent]` y el servidor devolvía un 409 que no era el
             real. */
          onConfirmar={() => confirmar()}
          onVolver={() => setRevisando(false)}
        />
      )}

      {/* Carrito persistente (Design System §23). Acompaña sin molestar: entra
          cuando hay algo, se va cuando no queda nada, y siempre dice las dos
          cosas que importan — cuánto llevo y para cuándo estará. */}
      {hayPedido && (
        <div className="barra-carrito fixed inset-x-0 bottom-[4.75rem] z-10 border-t border-borde bg-superficie/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
            {/* Punto de aterrizaje del vuelo de producto. */}
            <span
              id="carrito-destino"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-texto"
            >
              <Icono nombre="carrito" size={20} />
              <ContadorCarrito n={unidades} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="hora text-h3 font-bold leading-none">
                {cordobas(franjas?.total ?? 0)}
              </p>
              {/* ======================================= ¿Cabe en tu turno?
                  El diferenciador: ninguna aplicación de entrega puede decir
                  esto, porque para decirlo hay que haber reservado capacidad de
                  cocina. Y se dice ANTES de confirmar — enterarse en el
                  mostrador es la forma cara. */}
              <p className="mt-1 truncate text-caption text-texto-2">
                {!franjaElegida ? (
                  "Elegí una hora arriba"
                ) : veredicto?.tipo === "NO_CABE" ? (
                  <span className="font-semibold text-aviso">
                    {veredicto.alternativa
                      ? `No llega — con lugar a las ${horaCorta(veredicto.alternativa.inicio)}`
                      : "No llega, y hoy no queda otra hora"}
                  </span>
                ) : (
                  `Listo a las ${horaCorta(franjaElegida.fin)}`
                )}
              </p>
            </div>

            <BotonConfirmar
              estado={estadoAccion}
              total={cordobas(franjas?.total ?? 0)}
              enviando={enviando}
              hayRed={hayRed}
              onClick={() => {
                // Cuando no cabe, el botón NO confirma: elige por el estudiante
                // la primera hora que sí puede. El sistema ya hizo ese trabajo;
                // mandarlo a repetirlo en la regla es quedarse el resultado.
                if (estadoAccion === "NO_CABE" && veredicto?.tipo === "NO_CABE") {
                  if (veredicto.alternativa) setElegida(veredicto.alternativa.franjaId);
                  return;
                }
                setRevisando(true);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * El contador que late al recibir algo.
 *
 * El pulso es de 260 ms — menos de lo que tarda en leerse el número nuevo—, así
 * que se percibe como respuesta inmediata y no como una animación que hay que
 * esperar. Es el acuse de recibo del vuelo que acaba de aterrizar.
 */
function ContadorCarrito({ n }: { n: number }) {
  const caja = useRef<HTMLSpanElement>(null);
  const previo = useRef(n);

  useEffect(() => {
    if (n > previo.current) pulso(caja.current);
    previo.current = n;
  }, [n]);

  if (n <= 0) return null;
  return (
    <span
      ref={caja}
      aria-live="polite"
      aria-label={`${n} en el carrito`}
      className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-marca-fondo px-1 text-caption font-bold leading-none text-white"
    >
      {n}
    </span>
  );
}

/**
 * El botón que dice qué falta.
 *
 * Regla general del sistema: **un botón apagado siempre dice por qué lo está.**
 * "Confirmar pedido" en gris obliga a adivinar; decir "Elegí una hora de
 * retiro" convierte el mismo pixel en la instrucción siguiente.
 *
 * Con "no cabe" el botón queda ENCENDIDO y cambia de trabajo: en vez de
 * confirmar, elige la primera hora con lugar. Apagarlo dejaría al estudiante
 * frente a un callejón cuando el sistema ya sabe la salida.
 */
function BotonConfirmar({
  estado,
  total,
  enviando,
  hayRed,
  onClick,
}: {
  estado: EstadoAccion;
  total: string;
  enviando: boolean;
  hayRed: boolean;
  onClick: () => void;
}) {
  // Sin red se apaga: confirmar contra datos viejos puede reservar una hora que
  // ya no existe, y hacerle creer al estudiante que tiene un pedido que nunca
  // se creó (§38).
  const apagado =
    !hayRed || enviando || estado === "CERRADO" || estado === "VACIO" || estado === "SIN_HORA";

  return (
    <button
      type="button"
      disabled={apagado}
      onClick={onClick}
      className="presiona shrink-0 rounded-md bg-marca-fondo px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
    >
      {!hayRed
        ? "Sin conexión"
        : enviando
          ? "Confirmando…"
          : textoAccion(estado, total)}
    </button>
  );
}

function TarjetaProducto({
  producto,
  cantidad,
  onCambiar,
  prioridad,
}: {
  producto: ProductoUI;
  cantidad: number;
  onCambiar: (id: string, delta: number) => void;
  prioridad: boolean;
}) {
  const elegido = cantidad > 0;
  const foto = useRef<HTMLDivElement>(null);

  /*
   * Al agregar, la foto VIAJA hasta el carrito.
   *
   * No es adorno: cuando alguien toca "+", el carrito está al pie de la
   * pantalla y fuera de su foco. Sin el vuelo, la única evidencia de que pasó
   * algo es un número que cambia en un rincón que nadie está mirando. El vuelo
   * señala el destino, y por eso informa (ADR-11).
   *
   * El destino se busca por id en vez de pasar una ref por tres niveles de
   * props: la barra puede no existir todavía —aparece recién con el primer
   * producto— y una ref nula no se puede propagar hacia arriba.
   */
  function agregar() {
    onCambiar(producto.id, 1);

    /*
     * El destino se busca DESPUÉS de que React pinte, no en la misma vuelta.
     *
     * Con el carrito vacío la barra todavía no existe —aparece recién con el
     * primer producto—, así que buscarla de inmediato devolvía null y el
     * primer agregado, que es el más importante, se quedaba sin vuelo. Dos
     * cuadros: uno para que React confirme y otro para que el navegador
     * disponga la barra y su rectángulo sea real.
     */
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        volarAlCarrito(foto.current, document.getElementById("carrito-destino")),
      ),
    );
  }

  return (
    <li
      className={`entra tarjeta presiona flex flex-col overflow-hidden transition-colors ${
        elegido ? "!border-marca-texto" : ""
      }`}
    >
      <div
        ref={foto}
        className="relative aspect-[4/3] w-full overflow-hidden bg-papel"
      >
        <ImagenProducto
          nombre={producto.nombre}
          url={producto.imagenUrl}
          prioridad={prioridad}
          sizes="(min-width: 1280px) 15vw, (min-width: 640px) 30vw, 45vw"
        />
        <span className="hora absolute right-2 top-2 rounded-full bg-papel-alto/90 px-2 py-0.5 text-[0.625rem] font-semibold backdrop-blur">
          {producto.tiempoPreparacionMin} min
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="text-sm font-semibold leading-tight">{producto.nombre}</p>
        {producto.descripcion && (
          <p className="mt-0.5 line-clamp-2 text-xs text-tinta-suave">
            {producto.descripcion}
          </p>
        )}
        <p className="hora mt-1 text-sm">{cordobas(producto.precio)}</p>

        <div className="mt-auto flex items-center justify-end gap-1 pt-3">
          {elegido && (
            <>
              <button
                type="button"
                aria-label={`Quitar un ${producto.nombre}`}
                onClick={() => onCambiar(producto.id, -1)}
                className="toque h-9 w-9 rounded-full border border-borde text-lg leading-none"
              >
                −
              </button>
              <span
                className="hora w-6 text-center text-sm font-semibold"
                aria-live="polite"
              >
                {cantidad}
              </span>
            </>
          )}
          <button
            type="button"
            aria-label={`Agregar un ${producto.nombre}`}
            onClick={agregar}
            className="toque h-9 w-9 rounded-full bg-marca-fondo text-lg leading-none text-white"
          >
            +
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Confirmación: el comprobante que se imprime.
 *
 * Reemplaza a la caja con el código que había antes. La diferencia no es
 * estética: confirmar acá no es "agregar al carrito", es que la cocina te
 * reservó minutos que ya no tiene para nadie más. Un cambio de pantalla no
 * comunica un umbral irreversible; un comprobante saliendo de una impresora,
 * sí. El razonamiento completo está en el ADR-19.
 */
function Confirmacion({
  pedido,
  comercio,
  lineas,
  onNuevoPedido,
}: {
  pedido: RespuestaPedido;
  comercio: ComercioUI;
  lineas: { producto: ProductoUI; cantidad: number }[];
  onNuevoPedido: () => void;
}) {
  return (
    <>
      <Navegacion comercioSlug={comercio.slug} />
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 text-center sm:pb-12">
        <ComprobanteImpreso
          codigo={pedido.codigo}
          comercio={comercio.nombre}
          ubicacion={comercio.ubicacion}
          franjaInicio={pedido.franjaInicio}
          franjaFin={pedido.franjaFin}
          total={pedido.total}
          cargaMin={pedido.cargaEstimadaMin}
          lineas={lineas.map((l) => ({
            nombre: l.producto.nombre,
            cantidad: l.cantidad,
            subtotal: (Number(l.producto.precio) * l.cantidad).toFixed(2),
            minutos: l.producto.tiempoPreparacionMin * l.cantidad,
          }))}
        />

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href={`/pedido/${pedido.pedidoId}`}
            className="presiona flex min-h-12 items-center justify-center rounded-md bg-marca-fondo px-6 font-semibold text-white"
          >
            Seguir mi pedido
          </Link>
          {/* Un enlace a esta misma ruta no hacía nada: Next no vuelve a montar
              el componente, así que la pantalla de confirmación seguía puesta.
              Y aunque navegara, el pedido siguiente habría reusado la clave de
              idempotencia de este y el servidor habría devuelto este mismo
              pedido. Reiniciar el estado a mano resuelve las dos cosas. */}
          <button
            type="button"
            onClick={onNuevoPedido}
            className="presiona min-h-12 rounded-md border border-borde px-6 font-medium"
          >
            Pedir otra cosa
          </button>
        </div>
      </main>
    </>
  );
}
