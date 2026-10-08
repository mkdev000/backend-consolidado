-- 004_subtareas.sql
-- Subtareas: los pasos de cada tarea (en el prototipo, el hilo punteado con rombos).
-- Cada subtarea pertenece a UNA tarea. Si se borra la tarea, sus subtareas se borran solas (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS subtareas (
    id INT NOT NULL AUTO_INCREMENT,
    uuid CHAR(36) NOT NULL DEFAULT (UUID()),
    tarea_id INT NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    hecha BOOLEAN NOT NULL DEFAULT FALSE,
    orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_subtareas_uuid (uuid),
    KEY idx_subtareas_tarea_orden (tarea_id, orden),
    CONSTRAINT fk_subtareas_tarea FOREIGN KEY (tarea_id) REFERENCES tareas (id) ON DELETE CASCADE,
    CONSTRAINT subtareas_chk_titulo CHECK (CHAR_LENGTH(TRIM(titulo)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
