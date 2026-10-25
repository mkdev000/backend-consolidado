# backend-consolidado

Servidor (API) de **Tachit**, mi gestor de tareas, y de **Rutlink**, mi acortador de enlaces. Los dos proyectos comparten un único servidor Node.js + Express desplegado en Render, con la base de datos MySQL en Aiven.

> **Aviso de uso.** Este código se publica como **portfolio** para que se pueda revisar.
> **Todos los derechos reservados** © Kevin Mecinas Jiménez. No se permite copiarlo, reutilizarlo ni distribuirlo, total o parcialmente, sin mi permiso por escrito.

## Tecnologías

- **Node.js + Express 5**: la API.
- **MySQL (Aiven)** con `mysql2`, conexión cifrada y certificado del servidor verificado.
- **Zod**: validación de todos los datos que llegan.
- **bcrypt + JWT**: contraseñas cifradas y sesiones.
- **Google Identity (OAuth 2.0)**: "Continuar con Google".
- **Resend**: emails de recuperación de contraseña.
- **helmet, CORS y express-rate-limit**: cabeceras de seguridad, solo webs permitidas y límite de intentos.
- **node:test + Supertest**: pruebas automáticas de la API.
- **Migraciones SQL** numeradas con un script propio (`scripts/migrar.js`).

## Seguridad

- Contraseñas con **bcrypt** y requisitos de seguridad (los mismos en el navegador y en el servidor).
- **Sesión con dos pases:** un token de acceso de 15 minutos, que la app guarda solo en memoria, y un token de renovación de 30 días en una **cookie httpOnly, Secure y SameSite=Strict**. El de renovación **rota en cada uso**, se guarda **hasheado** y se anula al cerrar sesión o cambiar la contraseña. Si se reutiliza uno ya rotado, se anula toda la sesión (detección de robo).
- **"Continuar con Google"** con el flujo de código: el secreto nunca sale del servidor y se verifica el `id_token`. Hay protección contra el robo de cuenta por adelantado (*account pre-hijacking*).
- **Recuperar la contraseña** con enlaces de un solo uso que caducan a los 30 minutos (solo se guarda su huella SHA-256). La respuesta es siempre la misma, para no revelar qué emails están registrados.
- **Límites de intentos** en el login, el registro, la recuperación y la renovación de sesión.
- **Cabeceras de seguridad** (helmet) y **CORS** limitado a mis webs.
- Los errores se registran **sin datos personales ni secretos**.
- Ninguna clave está en el código: todo va en variables de entorno.

## API

### Cuentas — `/api/auth`

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/register` | Crear cuenta |
| POST | `/login` | Entrar con email y contraseña |
| POST | `/google` | Entrar con Google |
| POST | `/renovar` | Renovar la sesión (cookie de renovación) |
| POST | `/cerrar-sesion` | Cerrar la sesión de este dispositivo |
| POST | `/olvide-contrasena` | Pedir el enlace para recuperar la contraseña |
| POST | `/restablecer-contrasena` | Poner una contraseña nueva con el enlace |

### Tachit (requieren `Authorization: Bearer <token>`)

| Método | Ruta | Qué hace |
|---|---|---|
| GET / POST | `/api/tareas` | Listar y crear tareas |
| PUT / DELETE | `/api/tareas/:id` | Editar y borrar una tarea |
| PUT | `/api/tareas/:id/categorias` | Cambiar las categorías de una tarea |
| POST | `/api/subtareas` | Crear una subtarea |
| PATCH / DELETE | `/api/subtareas/:id` | Cambiar y borrar una subtarea |
| GET / POST | `/api/categorias` | Listar y crear categorías |
| PATCH / DELETE | `/api/categorias/:id` | Cambiar y borrar una categoría |
| GET / PATCH | `/api/ajustes` | Ver y cambiar los ajustes del usuario |

### Rutlink

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/enlaces` | Acortar un enlace (solo `http://` y `https://`) |
| GET | `/api/enlaces` | Últimos enlaces creados |
| GET | `/:codigo` | Redirigir al enlace original |

## Ponerlo en marcha en local

Hace falta **Node.js 22 o superior**.

```bash
npm install
npm run migrar   # aplica las migraciones (solo en una base de datos de pruebas acabada en _dev)
npm run dev      # arranca el servidor en http://localhost:3000
npm test         # lanza las pruebas
```

Las variables de entorno van en un archivo `.env` que **nunca se sube** al repositorio:

| Variable | Para qué |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | Conexión con MySQL |
| `DB_NAME_TAREAS` | Base de datos de Tachit (la de pruebas acaba en `_dev`) |
| `JWT_SECRET` | Firma de los tokens de sesión |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continuar con Google" |
| `RESEND_API_KEY`, `EMAIL_REMITENTE` | Envío de emails |
| `FRONTEND_URL` | Dirección de la web (para los enlaces de los emails) |
| `PROXIES_DE_CONFIANZA` | Número de proxies delante del servidor (en Render) |

## Autor

**Kevin Mecinas Jiménez** — estudiante de Desarrollo de Aplicaciones Web.
[Portfolio](https://kevinmecinas.vercel.app) · [GitHub](https://github.com/mkdev000) · [LinkedIn](https://www.linkedin.com/in/kevin-mecinas-jim%C3%A9nez)

© Kevin Mecinas Jiménez. Todos los derechos reservados.
