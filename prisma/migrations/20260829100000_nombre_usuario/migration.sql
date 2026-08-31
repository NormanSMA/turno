-- Nombre real del usuario.
--
-- Antes el saludo lo DERIVABA del correo: "angarciam@uamv.edu.ni" saludaba
-- "Buenas noches, Angarciam". Con las direcciones de demostración pasaba
-- inadvertido, pero con una persona real es lo primero que ve al entrar y está
-- mal escrito su nombre.
--
-- Opcional a propósito: pedirlo al entrar agregaría fricción al único flujo que
-- el producto promete rápido. Sin nombre se saluda sin nombre, que es honesto.
ALTER TABLE "usuario" ADD COLUMN "nombre" TEXT;
