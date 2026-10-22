-- 014_restablecer_contrasena.sql
-- "¿Olvidaste tu contraseña?" (Fase 3, paso 9): cada fila es un enlace de recuperación enviado por email.
--
-- SEGURIDAD: el código secreto del enlace NUNCA se guarda. Solo su huella (hash SHA-256, 64 letras hex).
-- Aunque alguien robara esta tabla, no podría usar los enlaces: de la huella no se puede sacar el código.
--
--   token_hash   huella del código del enlace (única)
--   caduca_en    30 minutos después de crearlo
--   usado_en     cuándo se usó (NULL = todavía sin usar). Un enlace usado ya no vale nunca más.
--   ON DELETE CASCADE: si se borra el usuario, se borran también sus enlaces.

CREATE TABLE IF NOT EXISTS restablecimientos_contrasena (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    caduca_en TIMESTAMP NOT NULL,
    usado_en TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_restablecimientos_token (token_hash),
    KEY idx_restablecimientos_usuario (user_id),
    CONSTRAINT fk_restablecimientos_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT restablecimientos_chk_hash CHECK (token_hash REGEXP '^[0-9a-f]{64}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
