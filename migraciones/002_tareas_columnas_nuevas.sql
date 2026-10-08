-- 002_tareas_columnas_nuevas.sql
-- Añade a "tareas" los datos nuevos que usa Tachit (el prototipo).
-- Todo va en UNA sola orden ALTER TABLE: en MySQL 8 es atómica, o se aplica entera o no se aplica nada.
-- Las tareas que ya existen NO se borran: reciben el valor por defecto de cada columna.
--
--   duracion_min    cuánto dura la tarea, en minutos (por defecto 30, entre 5 min y 24 h)
--   aviso_min       cuántos minutos antes avisar (NULL = sin aviso; 0 = a la hora; hasta 7 días)
--   repeticion      NULL = una vez; 'diaria', 'semanal' o 'mensual'
--   dias_semana     para 'semanal': qué días (0 = domingo ... 6 = sábado), por ejemplo '1,3'
--   icono           nombre del icono (tarta, regalo, médico...), o NULL
--   veces_aplazada  cuántas veces se ha movido a otro día (para "lo que se te atasca")
--   minutos_reales  cuánto tardaste de verdad (para "corregir mis tiempos")
--   uuid            identificador que puede crear el móvil sin internet (se rellena en la 003)
--   actualizada_en  fecha del último cambio (para sincronizar el modo sin conexión)

ALTER TABLE tareas
    ADD COLUMN duracion_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    ADD COLUMN aviso_min SMALLINT UNSIGNED NULL DEFAULT NULL,
    ADD COLUMN repeticion ENUM('diaria', 'semanal', 'mensual') NULL DEFAULT NULL,
    ADD COLUMN dias_semana SET('0', '1', '2', '3', '4', '5', '6') NULL DEFAULT NULL,
    ADD COLUMN icono VARCHAR(20) NULL DEFAULT NULL,
    ADD COLUMN veces_aplazada SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN minutos_reales SMALLINT UNSIGNED NULL DEFAULT NULL,
    ADD COLUMN uuid CHAR(36) NULL DEFAULT NULL,
    ADD COLUMN actualizada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ADD CONSTRAINT tareas_chk_duracion CHECK (duracion_min BETWEEN 5 AND 1440),
    ADD CONSTRAINT tareas_chk_aviso CHECK (aviso_min IS NULL OR aviso_min <= 10080),
    ADD CONSTRAINT tareas_chk_minutos_reales CHECK (minutos_reales IS NULL OR minutos_reales <= 1440),
    ADD INDEX idx_tareas_usuario_actualizada (user_id, actualizada_en);
