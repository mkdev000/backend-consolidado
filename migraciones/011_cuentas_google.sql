-- 011_cuentas_google.sql
-- Conexión con Google (Fase 11): Calendar (enviar tareas y traer eventos) y copia diaria en Drive.
-- Una fila por usuario como máximo.
--
-- SEGURIDAD: el permiso de Google (refresh token) NUNCA se guarda en texto normal.
-- La app lo cifrará antes de guardarlo (AES-256-GCM, con una clave que solo está en las
-- variables de entorno). Aquí solo llega el resultado cifrado, ilegible sin esa clave.

CREATE TABLE IF NOT EXISTS cuentas_google (
    user_id INT NOT NULL,
    google_sub VARCHAR(255) NOT NULL,
    email_google VARCHAR(255) NOT NULL,
    refresh_token_cifrado VARBINARY(1024) NULL,
    permisos VARCHAR(500) NULL,
    exportar_calendario BOOLEAN NOT NULL DEFAULT TRUE,
    importar_calendario BOOLEAN NOT NULL DEFAULT TRUE,
    ultima_sincronizacion TIMESTAMP NULL DEFAULT NULL,
    ultima_copia_drive TIMESTAMP NULL DEFAULT NULL,
    creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_cuentas_google_sub (google_sub),
    CONSTRAINT fk_cuentas_google_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
