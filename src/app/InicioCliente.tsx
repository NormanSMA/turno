"use client";

/**
 * Inicio — "¿qué quiero comer?" (Design System §28, §51).
 *
 * Una portada, dos lectores. El visitante ve el mecanismo: el hero con el
 * argumento del producto. El estudiante con sesión NO lo ve — ya lo convenció,
 * y dejárselo encima significaba empujar su pedido en cocina media pantalla
 * hacia abajo para volverle a vender algo que ya compró. La explicación no se
 * pierde: vive completa en `/como-funciona`, a un toque desde cualquiera de los
 * dos estados.
 *
 * Debajo, lo que se hace: el pedido en curso primero (regla de los tres
 * segundos), después buscar, repetir lo de siempre, lo que más piden y dónde se
 * retira. Las secciones que dependen de la sesión aparecen solas cuando hay
 * algo que mostrar; un invitado no ve huecos vacíos con leyendas de "todavía
 * no".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { sesionCliente, siHaySesion } from "@/lib/sesion-cliente";
import { ImagenProducto } from "@/components/ImagenProducto";
import { Icono } from "@/components/iconos";
import { CabeceraTurno } from "@/components/marca";
import { BandaPedidoActivo } from "@/components/BandaPedidoActivo";
import { BannerServicio } from "@/components/BannerServicio";
import { ComparacionReceso } from "@/components/ComparacionReceso";
import { TarjetaComida, type ProductoTarjeta } from "@/components/TarjetaComida";
import { HojaProducto } from "@/components/HojaProducto";
import { api, cordobas, fechaCorta, horaCorta } from "@/lib/cliente";
import { useFavoritos } from "@/lib/favoritos";
import { escalonado } from "@/lib/movimiento";
import { pedidoHabitual, type Habitual } from "@/core/habitual";
import { nombreParaSaludar } from "@/core/saludo";
import { leerVentana } from "@/core/proxima-hora";
import { useAhora } from "@/lib/reloj";

interface ComercioUI {
  nombre: string;
  slug: string;
  ubicacion: string | null;
  abierto: boolean;
  anchoFranjaMin: number;
  /** ISO de la próxima franja que el comercio puede cumplir, o `null`. */
  proximaHoraLibre: string | null;
  /** ISO del fin de esa misma franja. */
  proximaHoraFin: string | null;
  fotos: { id: string; nombre: string; imagenUrl: string | null }[];
}

interface PedidoPrevio {
  id: string;
  estado: string;
  comercio: string;
  comercioSlug: string;
  creadoEn: string;
  total: string;
  items: { productoId: string; nombre: string; cantidad: number }[];
}

const TERMINALES = ["RETIRADO", "NO_SHOW", "CANCELADO"];

export function InicioCliente({
  sesionInicial,
  destacados,
  comercios,
}: {
  /**
   * La sesión ya resuelta en el servidor, o `null` si es un visitante.
   *
   * Es lo que evita el destello: sin esto el primer cuadro se pintaba siempre
   * como visitante y el hero aparecía y desaparecía delante del estudiante.
   */
  sesionInicial: { correo: string; nombre: string | null } | null;
  destacados: ProductoTarjeta[];
  comercios: ComercioUI[];
}) {
  const { marcados, marcar } = useFavoritos();
  const [correo, setCorreo] = useState<string | null>(
    sesionInicial?.correo ?? null,
  );
  const [perfilNombre, setPerfilNombre] = useState<string | null>(
    sesionInicial?.nombre ?? null,
  );
  const [previos, setPrevios] = useState<PedidoPrevio[]>([]);
  const [habitual, setHabitual] = useState<Habitual | null>(null);
  const [abierto, setAbierto] = useState<ProductoTarjeta | null>(null);

  useEffect(() => {
    let vigente = true;

    // Compartida con la barra de navegación: antes cada una pedía la suya y
    // salían dos viajes idénticos en cada carga (punto 25).
    sesionCliente()
      .then((s) => {
        if (!vigente) return;
        setCorreo(s.autenticado ? (s.usuario?.correo ?? null) : null);
        setPerfilNombre(s.autenticado ? (s.usuario?.nombre ?? null) : null);
      })
      .catch(() => undefined);

    // El historial alimenta "Pedir de nuevo". Sin sesión no hay nada que
    // mostrar, así que ya ni se pide: antes salía el viaje y se descartaba el
    // 401, que es latencia gastada y un error rojo en la consola del invitado.
    siHaySesion(() => api<{ pedidos: PedidoPrevio[] }>("/api/pedidos"))
      .then((r) => {
        if (!vigente || !r) return;
        const cerrados = r.pedidos.filter((p) => TERMINALES.includes(p.estado));
        setPrevios(cerrados.slice(0, 4));
        // El habitual sale del historial COMPLETO, no de los cuatro últimos:
        // un hábito se reconoce mirando el semestre, no la semana.
        setHabitual(pedidoHabitual(r.pedidos));
      })
      .catch(() => undefined);

    return () => {
      vigente = false;
    };
  }, []);

  const dentro = correo !== null;
  const nombre = nombreParaSaludar(perfilNombre);

  return (
    <>
      {/* ============================== El mecanismo — solo para visitantes
          Quien ya tiene sesión no necesita que le expliquen el producto: viene
          a ver su pedido o a pedir. La explicación completa quedó en
          /como-funciona, enlazada desde los dos estados. */}
      {!dentro && (
      <CabeceraTurno>
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-5 sm:pb-20 sm:pt-14">
          <div className="gap-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="entra">
              <p className="etiqueta !text-white/60">
                Pedido anticipado con hora comprometida
              </p>
              <h1 className="titulo mt-3 text-5xl text-white sm:text-6xl lg:text-7xl">
                Pedí antes.
                <br />
                Llegá y retirá.
              </h1>
              <p className="mt-5 max-w-md text-cuerpo text-white/80">
                Tu receso dura 30 minutos. La fila y la cocina se llevan 20.
                TURNO te aparta una hora de retiro y cocina mientras estás en
                clase.
              </p>
              <Link
                href="/explorar"
                className="presiona mt-7 inline-flex min-h-13 items-center gap-2 rounded-md bg-marca-fondo px-7 text-cuerpo font-semibold text-white"
              >
                Ver qué hay hoy
                <Icono nombre="atras" size={18} className="rotate-180" />
              </Link>
            </div>

            <div className="entra entra-2">
              <ComparacionReceso />
            </div>
          </div>

          <Link
            href="/como-funciona"
            className="mt-8 inline-flex items-center gap-2 text-chico font-medium text-white/70 underline underline-offset-4"
          >
            Cómo funciona en detalle
          </Link>
        </div>
      </CabeceraTurno>
      )}

      <main
        id="contenido"
        className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-5 sm:pb-16"
      >
        {/* §37: si el servicio tiene un problema, se dice antes que nada.
            Esconderlo solo consigue que alguien camine hasta un mostrador que
            no está recibiendo pedidos. */}
        <BannerServicio />

        {/* Si hay algo en marcha, es lo primero: quien tiene un pedido
            cocinándose no abrió TURNO para mirar el catálogo. */}
        <BandaPedidoActivo />

        {/* ======================================== ESTUDIANTE: saludo y buscar */}
        {dentro && (
          <header className="entra mb-6">
            <p className="text-chico text-texto-2">
              {saludoSegunHora()}
              {nombre ? `, ${nombre}` : ""}
            </p>
            <h1 className="titulo mt-1 text-h1">¿Qué vas a comer hoy?</h1>

            <Link
              href="/explorar"
              className="presiona mt-4 flex min-h-13 items-center gap-3 rounded-md border border-borde bg-superficie px-4 text-cuerpo text-texto-3"
            >
              <Icono nombre="buscar" size={20} />
              Buscar comida o comercio
            </Link>

            {/* Atajos a cada comercio. Scroll horizontal, sin envolver. */}
            <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <div className="flex w-max gap-2">
                <Link
                  href="/explorar"
                  className="shrink-0 rounded-full border border-borde bg-superficie px-4 py-2 text-chico font-semibold text-texto-2"
                >
                  Todo
                </Link>
                {comercios.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/c/${c.slug}`}
                    className="shrink-0 rounded-full border border-borde bg-superficie px-4 py-2 text-chico font-semibold text-texto-2"
                  >
                    {c.nombre}
                  </Link>
                ))}
              </div>
            </div>
          </header>
        )}

        {/*
         * ==================================================== Tu de siempre
         *
         * Va antes que "pedir de nuevo" y es UNA sola tarjeta. La otra lista
         * muestra los últimos pedidos y sirve, pero elegir entre cuatro
         * tarjetas parecidas también cuesta minutos que en un receso no hay.
         *
         * Solo aparece cuando existe un hábito real —la misma combinación al
         * menos dos veces, y solo contando lo que se retiró—. Llamarle "tu de
         * siempre" a algo pedido una vez es el sistema afirmando que te conoce
         * y demostrando que no.
         */}
        {habitual && (
          <section className="entra mb-8">
            <h2 className="etiqueta mb-2">Tu de siempre</h2>
            <Link
              href={`/c/${habitual.comercioSlug}?repetir=${habitual.pedidoId}`}
              className="presiona flex items-center gap-4 rounded-lg border-2 border-marca-texto/25 bg-marca-suave p-4"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-caption text-texto-2">
                  <Icono nombre="local" size={13} />
                  <span className="truncate">{habitual.comercio}</span>
                  <span aria-hidden>·</span>
                  {/* La prueba de que el hábito existe. Sin este número, "tu de
                      siempre" es una afirmación que el usuario no puede
                      verificar. */}
                  <span>lo pediste {habitual.veces} veces</span>
                </span>
                <span className="mt-1 block text-cuerpo font-semibold">
                  {habitual.items
                    .map((i) => `${i.cantidad}× ${i.nombre}`)
                    .join(", ")}
                </span>
                <span className="hora mt-1 block text-chico font-bold">
                  {cordobas(habitual.total)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-marca-fondo px-4 py-3 text-chico font-semibold text-white">
                <Icono nombre="repetir" size={16} />
                Pedirlo
              </span>
            </Link>
          </section>
        )}

        {/* ============================================== Pedir de nuevo */}
        {previos.length > 0 && (
          <section className="mb-8">
            <h2 className="etiqueta mb-2">Pedir de nuevo</h2>
            <p className="mb-3 text-chico text-texto-2">
              En un receso de veinte minutos, volver a armar lo mismo es tiempo
              que no tenés.
            </p>
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {previos
                // El habitual ya está arriba y en grande: repetirlo acá gasta
                // una de las cuatro tarjetas en algo que el usuario ya vio.
                .filter((p) => p.id !== habitual?.pedidoId)
                .map((p) => (
                <li key={p.id} className="w-64 shrink-0">
                  <Link
                    href={`/c/${p.comercioSlug}?repetir=${p.id}`}
                    className="presiona flex h-full flex-col rounded-lg border border-borde bg-superficie p-4"
                  >
                    <span className="flex items-center gap-1.5 text-caption text-texto-2">
                      <Icono nombre="local" size={13} />
                      <span className="truncate">{p.comercio}</span>
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-cuerpo font-semibold">
                      {p.items
                        .map((i) => `${i.cantidad}× ${i.nombre}`)
                        .join(", ")}
                    </span>
                    <span className="mt-auto flex items-center justify-between pt-3">
                      <span className="hora font-bold">
                        {cordobas(p.total)}
                      </span>
                      <span className="flex items-center gap-1 text-chico font-semibold text-marca-texto">
                        <Icono nombre="repetir" size={15} />
                        Repetir
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ============================================== Lo que más piden */}
        {destacados.length > 0 && (
          <section className="mb-10">
            <h2 className="etiqueta mb-2">Lo que más piden</h2>
            <p className="mb-3 text-chico text-texto-2">
              Del historial real del campus, no de una lista elegida a dedo.
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {destacados.map((p, i) => (
                <li key={p.id} className="entra" style={escalonado(i)}>
                  <TarjetaComida
                    p={p}
                    prioridad={i < 3}
                    onAbrir={() => setAbierto(p)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ==================================================== Comercios */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="etiqueta">Dónde retirás</h2>
            <Link
              href="/explorar"
              className="text-chico font-semibold text-marca-texto"
            >
              Ver todo
            </Link>
          </div>

          {comercios.length === 0 ? (
            <p className="rounded-lg border border-dashed border-borde bg-superficie p-6 text-chico text-texto-2">
              Todavía no hay comercios cargados. Corré{" "}
              <code className="hora">npm run db:seed</code> para poblar el
              entorno de desarrollo.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {comercios.map((c, i) => (
                <li key={c.slug} className="entra" style={escalonado(i)}>
                  <Link
                    href={`/c/${c.slug}`}
                    className="presiona block overflow-hidden rounded-lg border border-borde bg-superficie transition-colors hover:border-texto-3"
                  >
                    {/* Tira de platos: le da una cara al comercio sin necesitar
                        una foto del local que nadie va a tomar.

                        Tres y no cuatro, con proporción fija en vez de altura
                        fija: con cuatro huecos, un comercio de tres platos con
                        foto dejaba un hueco que se leía como un error. El
                        respaldo de `ImagenProducto` ya cubre los que faltan. */}
                    {c.fotos.length > 0 && (
                    <div className="flex aspect-[3/1] gap-px bg-borde">
                      {c.fotos.map((p) => (
                        <div
                          key={p.id}
                          className="relative flex-1 bg-superficie-2"
                        >
                          <ImagenProducto
                            nombre={p.nombre}
                            url={p.imagenUrl}
                            sizes="(min-width: 640px) 16vw, 33vw"
                          />
                        </div>
                      ))}
                    </div>
                    )}
                    {/* Tres datos, no ocho (ley L5): estado, ubicación y la
                        próxima hora libre. */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-h3 font-semibold">
                            {c.nombre}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1 text-caption text-texto-2">
                            <Icono nombre="local" size={13} />
                            <span className="truncate">
                              {c.ubicacion ??
                                `franjas de ${c.anchoFranjaMin} min`}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold ${
                            c.abierto
                              ? "bg-exito-suave text-exito"
                              : "bg-atencion-suave text-aviso"
                          }`}
                        >
                          {c.abierto ? "Abierto" : "Pausado"}
                        </span>
                      </div>

                      {/* Solo si existe de verdad. Un comercio pausado o sin
                          horas que pueda cumplir no dibuja esta línea: un
                          guion ocuparía el mismo espacio sin responder nada
                          (L6). `data-volatil` porque la hora se mueve con la
                          carga de cocina y la regresión visual la enmascara. */}
                      {c.abierto && c.proximaHoraLibre && c.proximaHoraFin && (
                        <LineaHoraLibre
                          inicio={c.proximaHoraLibre}
                          fin={c.proximaHoraFin}
                        />
                      )}

                      {/* La tarjeta era un enlace que no decía a dónde iba. */}
                      <span className="mt-3 flex items-center justify-end gap-1.5 text-chico font-semibold text-marca-texto">
                        Ver menú
                        <Icono nombre="atras" size={15} className="rotate-180" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>


        <footer className="mt-16 border-t border-borde pt-6 text-caption text-texto-2">
          <p>
            TURNO reserva capacidad de cocina, no solo un pedido. El pago se hace
            en el mostrador al retirar.
          </p>
          {/* Sin el hero, esta es la puerta del estudiante a la explicación. */}
          <Link
            href="/como-funciona"
            className="mt-2 inline-block font-medium text-texto-2 underline underline-offset-4"
          >
            Cómo funciona
          </Link>
        </footer>
      </main>

      <HojaProducto
        producto={abierto}
        onCerrar={() => setAbierto(null)}
        favorito={abierto ? marcados.has(abierto.id) : false}
        onFavorito={marcar}
        autenticado={dentro}
      />
    </>
  );
}

function saludoSegunHora(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}


/**
 * La próxima hora libre de un comercio, leída contra el reloj de quien mira.
 *
 * Una franja disponible puede haber empezado ya —dura veinte minutos y el
 * cut-off solo mira su fin—, y entonces decir "próxima hora libre 09:00" a las
 * 13:18 manda al estudiante a una hora que pasó. Lo que sigue siendo cierto es
 * hasta cuándo puede pedir.
 *
 * El reloj entra por estado (`useAhora`), no se lee en el render: leer la hora
 * mientras se pinta es impuro, y así todas las tarjetas coinciden en el minuto.
 */
function LineaHoraLibre({ inicio, fin }: { inicio: string; fin: string }) {
  const v = leerVentana(new Date(inicio), new Date(fin), useAhora());

  return (
    <p
      data-volatil
      className="mt-2.5 flex items-center gap-1.5 border-t border-borde pt-2.5 text-chico text-texto-2"
    >
      <span className="shrink-0 text-texto-3">
        <Icono nombre="reloj" size={14} />
      </span>
      {v.tipo === "EN_CURSO" ? (
        <>
          Podés pedir hasta las{" "}
          <span className="hora font-semibold text-texto">{horaCorta(fin)}</span>
        </>
      ) : v.tipo === "HOY" ? (
        <>
          Próxima hora libre{" "}
          <span className="hora font-semibold text-texto">
            {horaCorta(inicio)}
          </span>
        </>
      ) : (
        // Con el día por delante: sin él, un "09:00" del lunes se lee como de
        // hoy y manda a alguien a un mostrador cerrado.
        <>
          Próxima hora libre{" "}
          <span className="hora font-semibold text-texto">
            {fechaCorta(inicio)} · {horaCorta(inicio)}
          </span>
        </>
      )}
    </p>
  );
}
