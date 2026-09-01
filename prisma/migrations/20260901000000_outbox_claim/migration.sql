-- Bandeja de salida: reclamo atómico de filas.
--
-- Sin un estado intermedio, dos ejecuciones de `vaciarBandeja` leen las mismas
-- filas PENDIENTE y envían el mismo aviso dos veces. El UNIQUE de la tabla
-- impide crear notificaciones duplicadas, pero no enviarlas dos veces: son
-- cosas distintas.
--
-- ENVIANDO marca "esta fila ya la tomó alguien". `reclamadaEn` dice cuándo, y
-- es lo que permite recuperarla: si el proceso que la reclamó muere antes de
-- marcarla, la fila volvería a quedar atascada para siempre. Con la marca de
-- tiempo, otra ejecución la retoma pasado un umbral.
ALTER TYPE "EstadoNotificacion" ADD VALUE 'ENVIANDO';

ALTER TABLE "notificacion" ADD COLUMN "reclamadaEn" TIMESTAMPTZ(3);
