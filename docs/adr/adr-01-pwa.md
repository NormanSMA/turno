# ADR-01 — Aplicación web progresiva

**Estado:** aceptada · **Fecha:** 2026-08-24

## Alternativas

Nativa iOS/Android · híbrida (React Native, Flutter) · **PWA**.

## Criterios

Costo de distribución · tiempo de despliegue · **barrera de adopción en el
piloto** · contexto de uso por rol.

## Decisión

PWA servida desde una URL, accesible por QR.

## Razones

El criterio decisivo es la barrera de adopción, no el costo. El piloto necesita
que un estudiante con hambre y ocho minutos escanee un QR y **pida en esa misma
sesión**. Instalar una app desde una tienda mete un paso de minutos entre el
interés y el primer pedido, y ese paso ocurre justo en el momento de menor
paciencia. La tasa de adopción espontánea es un resultado del estudio; una
barrera de instalación la contaminaría.

Además hay dos contextos de uso muy distintos —estudiante en el teléfono al sol,
operador en una pantalla fija dentro de una cocina— y la web permite tratarlos
distinto sin dos aplicaciones: interfaz clara y compacta para uno, oscura y
legible a distancia para el otro.

## Consecuencias

- Sin notificaciones push nativas: el cambio de estado se ve al abrir la app y
  se refuerza por correo
- El rendimiento percibido depende de la red del campus, lo que refuerza el
  requisito de P95 ≤ 2 s (indicador 8)
