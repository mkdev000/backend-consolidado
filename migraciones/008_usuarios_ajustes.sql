-- 008_usuarios_ajustes.sql
-- Ajustes de cada usuario, tal como aparecen en el Menú (móvil) y en Ajustes (web) del prototipo.
-- Una sola orden ALTER TABLE (atómica en MySQL 8). Los usuarios que ya existen reciben los valores por defecto.
--
--   tema                    'nube' (por defecto), 'malva', 'peonia' o 'cacao'
--   idioma                  'es' (por defecto), 'en' o 'fr'
--   zona_horaria            para calcular "hoy", la racha y el briefing de las 08:00 en SU hora
--   avisos_activos          "Avisos de tareas" (10 min antes)
--   briefing_activo         "Briefing diario" a las 08:00
--   copia_drive_activa      "Copia automática en Google Drive" (apagada hasta que conecte Google)
--   energia_al_reorganizar  Mi ritmo → mapa de energía → "Usar al reorganizar"
--   corregir_tiempos        Mi ritmo → "Corregir mis tiempos"
--   actualizado_en          fecha del último cambio

ALTER TABLE usuarios
    ADD COLUMN tema ENUM('nube', 'malva', 'peonia', 'cacao') NOT NULL DEFAULT 'nube',
    ADD COLUMN idioma ENUM('es', 'en', 'fr') NOT NULL DEFAULT 'es',
    ADD COLUMN zona_horaria VARCHAR(64) NOT NULL DEFAULT 'Europe/Madrid',
    ADD COLUMN avisos_activos BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN briefing_activo BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN copia_drive_activa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN energia_al_reorganizar BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN corregir_tiempos BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
