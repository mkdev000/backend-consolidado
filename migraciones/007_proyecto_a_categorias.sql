-- 007_proyecto_a_categorias.sql
-- Convierte el texto "proyecto" de las tareas que ya existen en categorías de verdad.
--   1) Crea una categoría por cada proyecto distinto de cada usuario (máximo 40 letras),
--      con los colores del prototipo, por turnos: azul, morado, verde, ámbar, rosa, turquesa.
--   2) Une cada tarea con su categoría.
-- La columna "proyecto" NO se borra todavía: el frontend actual la sigue usando.
-- Se puede ejecutar más de una vez sin duplicar nada (gracias a ON DUPLICATE KEY).

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

INSERT INTO tarea_categorias (tarea_id, categoria_id, user_id)
SELECT t.id, c.id, t.user_id
FROM tareas t
JOIN categorias c
    ON c.user_id = t.user_id
   AND c.nombre = LEFT(TRIM(t.proyecto), 40)
WHERE t.proyecto IS NOT NULL AND TRIM(t.proyecto) <> ''
ON DUPLICATE KEY UPDATE tarea_categorias.user_id = tarea_categorias.user_id;
