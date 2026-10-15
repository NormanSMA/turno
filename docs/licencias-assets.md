# Licencias de los assets

Cada archivo gráfico de TURNO tiene origen y licencia registrados. Regla: no se integra un asset sin licencia revisada por archivo.

| Asset | Origen | Licencia | Atribución |
|---|---|---|---|
| `public/personajes/estudiante.svg` | Open Peeps, `peep-82` (Pablo Stanley), [openpeeps.com](https://www.openpeeps.com) | CC0 (dominio público) | No exigida |
| `public/personajes/cocinero.svg` | Open Peeps, `peep-91` | CC0 | No exigida |
| Mochila, delantal y gorro de cocina (dentro de esos SVG) | Dibujo propio de TURNO | Propia | - |
| `src/components/marca.tsx`, `src/components/mascota/Turno.tsx` | Dibujo propio de TURNO (logo y mascota) | Propia | - |
| `src/components/animaciones/vacio.json` | Animación Lottie escrita a mano para TURNO | Propia | - |
| `src/app/icon.png`, `src/app/apple-icon.png` | Generados desde el logo propio | Propia | - |
| `docs/assets/*.svg` | Dibujo propio de TURNO | Propia | - |

## Notas
- Open Peeps se descargó el 2026-10-15 con confirmación de Norman. Los dos SVG de TURNO son derivados: se quitaron metadatos de Sketch, los colores pasaron a variables CSS y se agregaron accesorios.
- Si en adelante se usa Storyset o Lordicon en su plan gratuito, exigen atribución: crear entonces una página de créditos y registrar aquí cada archivo.
- Un asset descargado nunca se ejecuta: los SVG se revisaron sin `<script>`, `onload` ni imágenes incrustadas.
