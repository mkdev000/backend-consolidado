-- 013_usuarios_acceso_google.sql
-- "Continuar con Google" (Fase 3, paso 8): una cuenta puede entrar con contraseña, con Google o con las dos.
-- Una sola orden ALTER TABLE (atómica en MySQL 8): o se aplica entera o no se aplica nada.
--
--   contrasena   pasa a poder estar vacía (NULL): las cuentas creadas con Google no tienen contraseña.
--   google_sub   el número de cuenta de Google ("sub"). NO cambia nunca, aunque la persona cambie su email
--                en Google, por eso identificamos a la persona por él y no por el email.
--                ascii_bin: solo letras y números normales y comparación EXACTA (sin mayúsculas = minúsculas).
--                UNIQUE: una cuenta de Google solo puede estar unida a UN usuario de Tachit.
--   CHECK        red de seguridad: ninguna cuenta puede quedarse sin ninguna forma de entrar.

ALTER TABLE usuarios
    MODIFY contrasena VARCHAR(255) NULL,
    ADD COLUMN google_sub VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER contrasena,
    ADD UNIQUE KEY uq_usuarios_google_sub (google_sub),
    ADD CONSTRAINT usuarios_chk_forma_de_entrar CHECK (contrasena IS NOT NULL OR google_sub IS NOT NULL);
