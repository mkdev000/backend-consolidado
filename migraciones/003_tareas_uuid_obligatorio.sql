-- 003_tareas_uuid_obligatorio.sql
-- 1) Da un uuid distinto a cada tarea que ya existía (las nuevas lo recibirán solas).
-- 2) Hace el uuid obligatorio, con valor automático y sin repetidos.
-- Va separada de la 002 para que, si algo fallara aquí, la 002 siga aplicada y apuntada.

UPDATE tareas SET uuid = UUID() WHERE uuid IS NULL;

ALTER TABLE tareas
    MODIFY COLUMN uuid CHAR(36) NOT NULL DEFAULT (UUID()),
    ADD UNIQUE INDEX uq_tareas_uuid (uuid);
