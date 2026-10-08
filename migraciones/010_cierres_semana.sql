-- 010_cierres_semana.sql
-- "Cierre de semana en 3 pasos" de Mi ritmo:
--   1) lo que has hecho  2) qué pendientes pasas al lunes  3) el foco (una categoría) de la semana que viene.
-- Un cierre por usuario y semana (semana_inicio = el lunes de esa semana).
-- Si se borra la categoría elegida como foco, el cierre se conserva sin foco (SET NULL).

CREATE TABLE IF NOT EXISTS cierres_semana (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    semana_inicio DATE NOT NULL,
    completadas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pasadas_al_lunes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    foco_categoria_id INT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_cierres_usuario_semana (user_id, semana_inicio),
    KEY idx_cierres_foco (foco_categoria_id),
    CONSTRAINT fk_cierres_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_cierres_foco FOREIGN KEY (foco_categoria_id) REFERENCES categorias (id) ON DELETE SET NULL,
    CONSTRAINT cierres_chk_lunes CHECK (DAYOFWEEK(semana_inicio) = 2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
