# ✅ Tachit — Gestor de Tareas (Backend)

Tachit (antes KmTask) es una aplicación web full stack de gestión de tareas personales. Este repositorio es su **servidor (API)**: guarda las cuentas y las tareas de cada persona, protege el acceso y se encarga del inicio de sesión (con contraseña o con Google), de las sesiones y de la recuperación de contraseña. En el mismo servidor vive también la API de **Rutlink**, mi acortador de enlaces.

🔗 Repositorio del frontend: [gestor-tareas-frontend](https://github.com/mkdev000/gestor-tareas-frontend)

> ⚠️ **Aviso de uso:** este código se publica como **portfolio**, para que se pueda revisar. **Todos los derechos reservados**: no se permite copiarlo, reutilizarlo ni distribuirlo, total o parcialmente, sin mi permiso por escrito.

---

## Características principales

- 🔐 **Cuentas seguras**: registro e inicio de sesión con contraseñas cifradas (bcrypt) y los mismos requisitos de seguridad en la web y en el servidor.
- 🟢 **Continuar con Google**: inicio de sesión con Google (OAuth 2.0). El secreto nunca sale del servidor y la cuenta de Google se une a la de Tachit de forma segura.
- 🔄 **Sesión que se renueva sola**: un pase corto de 15 minutos y un pase de renovación de 30 días en una cookie segura (httpOnly). Rota en cada uso, detecta si alguien lo roba y se anula al cerrar sesión.
- 📧 **Recuperar la contraseña**: enlace por email de un solo uso que caduca a los 30 minutos, sin revelar qué emails están registrados.
- ✅ **Tareas completas**: crear, editar y borrar tareas, con subtareas, categorías con color, duración, aviso, repetición, icono e historial de cambios.
- 🛡️ **Protección contra ataques**: límite de intentos, cabeceras de seguridad, acceso solo desde mis webs y validación de todos los datos que llegan.
- 🔒 **Privacidad por usuario**: cada persona solo puede ver y modificar sus propias tareas.
- 🧪 **Más de 130 pruebas automáticas** que comprueban la API, la seguridad y la base de datos.
- 🔗 **Rutlink**: acortador de enlaces que solo acepta direcciones `http://` y `https://`.

---

## 🛠️ Tecnologías utilizadas

**Backend**
- <img src="https://skillicons.dev/icons?i=nodejs" width="20" height="20" alt="Node.js"/> **Node.js** – Entorno donde se ejecuta el servidor.
- <img src="https://skillicons.dev/icons?i=express" width="20" height="20" alt="Express"/> **Express** – Rutas de la API y piezas intermedias (middleware) de seguridad y validación.
- <img src="https://skillicons.dev/icons?i=mysql" width="20" height="20" alt="MySQL"/> **MySQL** – Base de datos en Aiven, con conexión cifrada y migraciones SQL numeradas.
- <img src="https://skillicons.dev/icons?i=gcp" width="20" height="20" alt="Google Cloud"/> **Google Identity** – "Continuar con Google" (OAuth 2.0).
- **Zod** – Validación de todos los datos que llegan a la API.
- **bcrypt + JWT** – Contraseñas cifradas y tokens de sesión.
- **helmet, CORS y express-rate-limit** – Cabeceras de seguridad, solo webs permitidas y límite de intentos.
- **Resend** – Envío de los emails de recuperación de contraseña.
- **node:test + Supertest** – Pruebas automáticas de la API.

---

## Instalación local

```bash
git clone https://github.com/mkdev000/backend-consolidado.git
cd backend-consolidado
npm install
npm run migrar
npm run dev
```

Necesita **Node.js 22 o superior** y un archivo `.env` con las variables de entorno (ese archivo **nunca se sube** al repositorio). `npm run migrar` solo cambia una base de datos de pruebas, cuyo nombre acaba en `_dev`. Para lanzar las pruebas: `npm test`.

| Variable | Para qué |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | Conexión con MySQL |
| `DB_NAME_TAREAS` | Base de datos de Tachit |
| `JWT_SECRET` | Firma de los tokens de sesión |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Continuar con Google |
| `RESEND_API_KEY`, `EMAIL_REMITENTE` | Envío de emails |
| `FRONTEND_URL` | Dirección de la web (para los enlaces de los emails) |
| `PROXIES_DE_CONFIANZA` | Número de proxies delante del servidor (en Render) |

---

## 🚀 Despliegue

- **Backend**: desplegado en [Render](https://render.com)
- **Base de datos**: MySQL en [Aiven](https://aiven.io)
- **Frontend**: desplegado en [Vercel](https://vercel.com)
- **Demo en vivo**: [https://kmtask.vercel.app](https://kmtask.vercel.app)

---

## 📁 Estructura del proyecto

```
backend-consolidado/
├── certs/
│   └── aiven-ca.pem            # Certificado público de Aiven (comprueba que la base de datos es la de verdad)
├── migraciones/
│   ├── 001_esquema_inicial.sql # Cambios de la base de datos, en orden (001 a 015)
│   ├── ...
│   └── 015_sesiones.sql
├── rutlink/
│   ├── rutas.js                # API de Rutlink (acortar y redirigir enlaces)
│   └── validarUrl.js           # Solo acepta enlaces http:// y https://
├── scripts/
│   └── migrar.js               # Aplica las migraciones pendientes
├── tareas/
│   ├── routes/
│   │   ├── auth.js             # Cuentas: registro, login, Google, sesión y recuperar contraseña
│   │   ├── tareas.js           # Tareas
│   │   ├── subtareas.js        # Subtareas
│   │   ├── categorias.js       # Categorías con color
│   │   └── ajustes.js          # Ajustes del usuario (tema, idioma...)
│   ├── middleware/
│   │   ├── verificarToken.js   # Comprueba el token de sesión
│   │   ├── validar.js          # Valida los datos con Zod
│   │   └── limites.js          # Límites de intentos
│   ├── validacion/
│   │   └── esquemas.js         # Normas de los datos de cada ruta
│   ├── sesiones.js             # Pases de sesión y su renovación
│   ├── google.js               # Continuar con Google
│   ├── recuperacion.js         # Enlaces para recuperar la contraseña
│   ├── email.js                # Envío de emails con Resend
│   └── utilidades.js           # Herramientas comunes (transacciones...)
├── tests/                      # Pruebas automáticas (node:test + Supertest)
├── app.js                      # La aplicación: seguridad, CORS y rutas
├── db.js                       # Conexión con MySQL
├── index.js                    # Arranca el servidor
└── package.json
```

---

## Proyectos relacionados

- [Frontend de Tachit](https://github.com/mkdev000/gestor-tareas-frontend)
- [Rutlink (demo en vivo)](https://rutlink.vercel.app)

---

## 📄 Licencia

**Todos los derechos reservados** © Kevin Mecinas Jiménez. El código se puede consultar como portfolio, pero no se permite copiarlo, reutilizarlo ni distribuirlo sin permiso por escrito.

## 👤 Autor

Desarrollado con ❤️ por [Kevin Mecinas](https://github.com/mkdev000)

---

## 📬 Contacto

- <img src="https://skillicons.dev/icons?i=gmail" width="20" height="20" alt="Email"/> [kevin009673@gmail.com](mailto:kevin009673@gmail.com)
- <img src="https://skillicons.dev/icons?i=linkedin" width="20" height="20" alt="LinkedIn"/> [Kevin Mecinas Jiménez](https://www.linkedin.com/in/kevin-mecinas-jim%C3%A9nez-46860a429/)
- <img src="https://skillicons.dev/icons?i=github" width="20" height="20" alt="GitHub"/> [@mkdev000](https://github.com/mkdev000)
