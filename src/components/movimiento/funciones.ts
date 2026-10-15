// Se carga bajo demanda desde MovimientoProveedor: el JS de las funciones de
// Motion no entra en la carga inicial de ninguna ruta (ADR-23).
import { domAnimation } from "motion/react";

export default domAnimation;
