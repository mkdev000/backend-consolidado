-- 016_prioridad_sin_urgente_y_sin_proyecto.sql
-- Fase 6, paso 6.3: la tabla "tareas" se queda igual que el prototipo.
--   * Prioridad: solo baja, media y alta. Las tareas "urgente" pasan a "alta" (no se pierde ninguna).
--     Y la prioridad ya no puede quedarse vacía (NULL): si no se elige, es "media".
--   * Proyecto: desaparece la columna. Antes de borrarla, cualquier proyecto que quede
--     (por ejemplo, de tareas creadas después de la 007) se copia a categorías, igual que hizo la 007.
--
-- Por qué este orden: en MySQL, cada ALTER TABLE se guarda en el momento (no se puede deshacer
-- con el resto del archivo). Por eso primero van las órdenes que se pueden repetir sin problema
-- (copiar y cambiar datos) y al final UN solo ALTER TABLE, que se aplica entero o no se aplica nada.
-- Si algo falla a mitad, se puede volver a lanzar "npm run migrar" sin duplicar nada.

-- 1) Proyectos que queden → categorías (misma lógica que la 007; no duplica las que ya existen)
INSERT INTO categorias (user_id, nombre, color)
SELECT
    p.user_id,
    p.nombre,
    ELT(MOD(ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY p.nombre) - 1, 6) + 1,
        '#17699e', '#6d4fc9', '#1b7a50', '#9a5b00', '#b83a70', '#0e6f78')
FROM (
    SELECT user_id, MIN(LEFT(TRIM(proyecto), 40)) AS nombre
    FROM tareas
    WHERE proyecto IS NOT NULL AND TRIM(proyecto) <> ''
    GROUP BY user_id, LEFT(TRIM(proyecto), 40)
) AS p
ON DUPLICATE KEY UPDATE categorias.nombre = categorias.nombre;

-- 2) Cada tarea con proyecto queda unida a su categoría (si ya lo estaba, no pasa nada)
INSERT INTO tarea_categorias (tarea_id, categoria_id, user_id)
SELECT t.id, c.id, t.user_id
FROM tareas t
JOIN categorias c
    ON c.user_id = t.user_id
   AND c.nombre = LEFT(TRIM(t.proyecto), 40)
WHERE t.proyecto IS NOT NULL AND TRIM(t.proyecto) <> ''
ON DUPLICATE KEY UPDATE tarea_categorias.user_id = tarea_categorias.user_id;

-- 3) Las prioridades que van a dejar de existir se cambian ANTES de cambiar la columna
--    (si no, MySQL daría error: "urgente" no cabría en la lista nueva).
--    actualizada_en = actualizada_en: así la fecha de "último cambio" de la tarea no se toca,
--    porque el usuario no ha cambiado nada (la barra lateral usa esa fecha).
UPDATE tareas SET prioridad = 'alta', actualizada_en = actualizada_en WHERE prioridad = 'urgente';
UPDATE tareas SET prioridad = 'media', actualizada_en = actualizada_en WHERE prioridad IS NULL;

-- 4) Un solo ALTER TABLE: nueva lista de prioridades (obligatoria) y adiós a "proyecto"
ALTER TABLE tareas
    MODIFY COLUMN prioridad ENUM('baja', 'media', 'alta') NOT NULL DEFAULT 'media',
    DROP COLUMN proyecto;
