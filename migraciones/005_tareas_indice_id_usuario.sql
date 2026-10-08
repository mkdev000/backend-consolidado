-- 005_tareas_indice_id_usuario.sql
-- Índice único (id, user_id) en "tareas". No cambia ningún dato.
-- Lo necesita la 006 para comprobar, dentro de la propia base de datos, que una tarea
-- y una categoría unidas son siempre del MISMO usuario.
-- Va sola en su archivo porque ALTER TABLE no se puede repetir: si fallara algo después,
-- esta ya quedaría hecha y apuntada.

ALTER TABLE tareas ADD UNIQUE INDEX uq_tareas_id_usuario (id, user_id);
