-- =====================================================================
-- Esquema de la base de datos de tareas (KmTask / Tachit)
-- ---------------------------------------------------------------------
-- Solo ESTRUCTURA: aquí no hay ningún dato de usuarios ni de tareas.
-- Sirve para crear las tablas desde cero en una base de datos vacía.
--
-- Cómo usarlo:
--   1. Crea o elige una base de datos vacía (por ejemplo: USE mi_bd;)
--   2. Ejecuta este archivo entero.
--
-- Usa "CREATE TABLE IF NOT EXISTS": si las tablas ya existen,
-- no las toca ni borra nada.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Tabla: usuarios
-- Una fila por cada persona registrada en la app.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `contrasena` varchar(255) NOT NULL,           -- se guarda cifrada (hash), nunca en texto plano
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)                   -- no puede haber dos cuentas con el mismo email
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Tabla: tareas
-- Cada tarea pertenece a un usuario (user_id -> usuarios.id).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tareas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `descripcion` text,
  `estado` enum('pendiente','en_progreso','en_pausa','completada') DEFAULT 'pendiente',
  `prioridad` enum('baja','media','alta','urgente') DEFAULT 'media',
  `proyecto` varchar(100) DEFAULT NULL,
  `fecha_limite` date DEFAULT NULL,
  `hora_limite` time DEFAULT NULL,
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `tareas_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
