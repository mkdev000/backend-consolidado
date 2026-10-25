-- 015_sesiones.sql
-- Renovación de sesión (Fase 3, paso 10.3): los "pases de renovación" de 30 días.
-- Cada vez que se usa un pase, se cambia por uno nuevo (rotación): cada fila es un pase.
--
-- SEGURIDAD: como en los enlaces de recuperar la contraseña, el pase NUNCA se guarda: solo su huella (SHA-256).
--
--   familia      todos los pases que salen de UN mismo inicio de sesión comparten familia.
--                Si alguien usa un pase que ya se había cambiado (señal de que lo han robado),
--                se anula la familia entera: el ladrón y el dueño tienen que volver a entrar.
--   caduca_en    30 días después de crearlo (se renueva cada vez que usas la app)
--   usado_en     cuándo se cambió por uno nuevo (NULL = es el pase actual)
--   revocada_en  cuándo se anuló (cerrar sesión, contraseña nueva o pase robado). NULL = válida.

CREATE TABLE IF NOT EXISTS sesiones (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    familia CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    caduca_en TIMESTAMP NOT NULL,
    usado_en TIMESTAMP NULL DEFAULT NULL,
    revocada_en TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sesiones_token (token_hash),
    KEY idx_sesiones_usuario (user_id),
    KEY idx_sesiones_familia (familia),
    CONSTRAINT fk_sesiones_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT sesiones_chk_hash CHECK (token_hash REGEXP '^[0-9a-f]{64}$'),
    CONSTRAINT sesiones_chk_familia CHECK (familia REGEXP '^[0-9a-f]{32}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
