-- 009_tarea_eventos.sql
-- Historial de lo que pasa con cada tarea: creada, completada, reabierta, movida de día, borrada.
-- De aquí salen, en Mi ritmo: el mapa de energía (a qué día y hora completas), la racha amable,
-- "lo que se te atasca" (tareas movidas muchas veces) y el resumen semanal.
--
--  * Si se borra la tarea, su historial se CONSERVA (tarea_id pasa a NULL) para que las
--    estadísticas no cambien hacia atrás.
--  * Si se borra el usuario, se borra todo su historial (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS tarea_eventos (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    tarea_id INT NULL,
    tipo ENUM('creada', 'completada', 'reabierta', 'movida', 'borrada') NOT NULL,
    ocurrido_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_anterior DATE NULL,
    fecha_nueva DATE NULL,
    PRIMARY KEY (id),
    KEY idx_eventos_usuario_tipo_fecha (user_id, tipo, ocurrido_en),
    KEY idx_eventos_tarea (tarea_id),
    CONSTRAINT fk_eventos_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_eventos_tarea FOREIGN KEY (tarea_id) REFERENCES tareas (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
