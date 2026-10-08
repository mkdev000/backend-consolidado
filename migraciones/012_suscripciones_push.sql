-- 012_suscripciones_push.sql
-- Dispositivos (móvil, ordenador) que reciben los avisos "Empieza en 10 minutos" y el briefing (Fase 12).
-- Un usuario puede tener varios dispositivos. La misma dirección de envío (endpoint) no se repite.
-- Las claves p256dh y auth son PÚBLICAS del navegador (sirven para cifrar el aviso); no son secretos del servidor.

CREATE TABLE IF NOT EXISTS suscripciones_push (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    endpoint VARCHAR(700) NOT NULL,
    clave_p256dh VARCHAR(255) NOT NULL,
    clave_auth VARCHAR(255) NOT NULL,
    dispositivo VARCHAR(120) NULL,
    creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_envio TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_push_endpoint (endpoint),
    KEY idx_push_usuario (user_id),
    CONSTRAINT fk_push_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT push_chk_https CHECK (endpoint LIKE 'https://%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
