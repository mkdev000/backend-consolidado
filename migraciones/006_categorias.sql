-- 006_categorias.sql
-- Categorías (en el prototipo: iLerna, Portfolio, Personal, Casa...), con su color.
-- Cada usuario tiene las suyas. Una tarea puede tener varias categorías.
--
-- Seguridad dentro de la propia base de datos:
--  * No puede haber dos categorías con el mismo nombre para el mismo usuario. La comparación
--    ignora mayúsculas y tildes (gracias a utf8mb4_0900_ai_ci): "ilerna" = "iLerna" = "íLerna".
--  * Una tarea SOLO se puede unir a una categoría DEL MISMO usuario: la tabla de unión guarda
--    user_id y lo comprueba contra la tarea y contra la categoría (claves foráneas dobles).
--    Para eso, la 005 añadió a "tareas" el índice único (id, user_id).

CREATE TABLE IF NOT EXISTS categorias (
    id INT NOT NULL AUTO_INCREMENT,
    uuid CHAR(36) NOT NULL DEFAULT (UUID()),
    user_id INT NOT NULL,
    nombre VARCHAR(40) NOT NULL,
    color CHAR(7) NOT NULL DEFAULT '#17699e',
    creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categorias_uuid (uuid),
    UNIQUE KEY uq_categorias_usuario_nombre (user_id, nombre),
    UNIQUE KEY uq_categorias_id_usuario (id, user_id),
    CONSTRAINT fk_categorias_usuario FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT categorias_chk_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
    CONSTRAINT categorias_chk_color CHECK (REGEXP_LIKE(color, '^#[0-9a-fA-F]{6}$'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tarea_categorias (
    tarea_id INT NOT NULL,
    categoria_id INT NOT NULL,
    user_id INT NOT NULL,
    PRIMARY KEY (tarea_id, categoria_id),
    KEY idx_tarea_categorias_categoria (categoria_id),
    CONSTRAINT fk_tc_tarea FOREIGN KEY (tarea_id, user_id) REFERENCES tareas (id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_tc_categoria FOREIGN KEY (categoria_id, user_id) REFERENCES categorias (id, user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
