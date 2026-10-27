# Us Love In Pics — Backend

API REST para **Us Love In Pics**, una aplicación web colaborativa que permite a las parejas construir una historia visual de sus experiencias mediante fotografías, notas y GIFs.

El backend administra la autenticación, las pizarras compartidas, las invitaciones, los recuerdos, los permisos de acceso y la capacidad de los álbumes.

## Objetivos del proyecto

- Desarrollar una API REST modular y escalable.
- Garantizar la privacidad de los recuerdos compartidos.
- Gestionar la colaboración entre dos usuarios.
- Aplicar reglas de negocio en el servidor.
- Implementar persistencia relacional con PostgreSQL.
- Incorporar pruebas automatizadas y documentación técnica.
- Preparar la arquitectura para futuras expansiones del álbum.

## Tecnologías

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod
- Argon2
- Express Session
- connect-pg-simple
- Vitest
- Supertest

## Arquitectura

El proyecto utiliza una arquitectura modular organizada por funcionalidades.

Cada módulo contiene las responsabilidades necesarias para gestionar una parte específica del sistema.

Módulos principales:

- `auth`: registro, inicio y cierre de sesión.
- `users`: información y gestión de usuarios.
- `boards`: creación y administración de pizarras.
- `invitations`: invitaciones y vinculación de integrantes.
- `memories`: creación, consulta, edición y eliminación de recuerdos.
- `media`: gestión de archivos multimedia.
- `album`: capacidad disponible y reglas de almacenamiento.

La API estará versionada bajo el prefijo `/api/v1`.

## Reglas de negocio

1. Los usuarios deben estar autenticados para utilizar las funcionalidades privadas.
2. Cada pizarra activa pertenece a exactamente dos usuarios.
3. Un usuario no puede pertenecer a más de una pizarra activa.
4. La pizarra se activa cuando ambos integrantes completan el proceso de vinculación.
5. Los recuerdos solo pueden ser consultados y modificados por integrantes autorizados.
6. Cada álbum comienza con una capacidad de 15 fotografías.
7. Cada expansión habilitada agrega 25 espacios adicionales.
8. La capacidad se valida en el backend antes de aceptar una nueva fotografía.
9. Los archivos multimedia se almacenan fuera de PostgreSQL.
10. Las operaciones sensibles deben validar permisos y mantener la integridad de los datos.

## Requisitos previos

- Node.js en una versión LTS compatible.
- npm.
- PostgreSQL.
- Git.

## Instalación

Clonar el repositorio:

```bash
git clone <REPOSITORY_URL>
cd us-love-in-pics-backend
```

Instalar las dependencias:

```bash
npm install
```

Crear el archivo de variables de entorno:

```bash
cp .env.example .env
```

Configurar las variables de entorno y verificar que PostgreSQL esté disponible.

Generar el cliente de Prisma y aplicar las migraciones según los scripts configurados en el proyecto.

## Variables de entorno

El archivo `.env.example` documentará las variables necesarias para ejecutar el backend.

Entre ellas:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `SESSION_SECRET`
- `FRONTEND_URL`
- `LOG_LEVEL`

Los valores reales de configuración no deben subirse al repositorio.

## API

La API utiliza el prefijo:

`/api/v1`

Endpoints previstos:

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/v1/auth/register` | Registrar usuario |
| POST | `/api/v1/auth/login` | Iniciar sesión |
| POST | `/api/v1/auth/logout` | Cerrar sesión |
| GET | `/api/v1/auth/me` | Consultar sesión actual |
| POST | `/api/v1/boards` | Iniciar creación de pizarra |
| GET | `/api/v1/boards/me` | Obtener pizarra del usuario |
| POST | `/api/v1/boards/:boardId/invitations` | Crear invitación |
| POST | `/api/v1/invitations/:token/accept` | Aceptar invitación |
| GET | `/api/v1/boards/:boardId/memories` | Consultar recuerdos |
| POST | `/api/v1/boards/:boardId/memories` | Crear recuerdo |
| PATCH | `/api/v1/memories/:memoryId` | Editar recuerdo |
| DELETE | `/api/v1/memories/:memoryId` | Eliminar recuerdo |
| GET | `/api/v1/boards/:boardId/capacity` | Consultar capacidad |

Los endpoints se implementarán y documentarán progresivamente.

## Seguridad

El backend incorporará:

- Hash de contraseñas con Argon2.
- Sesiones persistentes almacenadas en PostgreSQL.
- Cookies `HttpOnly` y configuración segura para producción.
- Validación de entradas con Zod.
- Encabezados HTTP de seguridad con Helmet.
- Limitación de solicitudes en endpoints sensibles.
- Control de acceso a pizarras y recuerdos.
- Validación de archivos multimedia.
- Manejo centralizado de errores.
- Protección contra solicitudes no autorizadas y ataques CSRF.

La configuración de cookies, CORS y sesiones deberá adaptarse al entorno de despliegue.

## Pruebas

Se utilizará Vitest para las pruebas automatizadas y Supertest para probar los endpoints HTTP.

Las pruebas cubrirán progresivamente:

- Registro y autenticación.
- Validación de datos.
- Creación y aceptación de invitaciones.
- Restricciones de usuarios y pizarras.
- Permisos de acceso.
- Gestión de recuerdos.
- Límites de capacidad del álbum.
- Manejo de errores.

## Estado del proyecto

**Fase actual:** preparación de la arquitectura y configuración inicial del backend.

El desarrollo se realizará por etapas, comenzando por la infraestructura, la base de datos y la autenticación.

## Licencia

Pendiente de definición.