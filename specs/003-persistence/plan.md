# Plan 003 — persistencia

1. Confirmar Docker y runtime; verificar en npm versiones compatibles de `@nestjs/typeorm`, TypeORM y `pg`, fijadas con lockfile.
2. Crear Compose con PostgreSQL 16.15, desarrollo persistente y pruebas en servicio independiente. Configurar credenciales locales de ejemplo y variables explícitas de pruebas.
3. Implementar validación de conexión, entidades `User`, `Product`, `StockMovement`, migración inicial y fábrica común de opciones/DataSource. Cargar entidades y migración por clase, evitando globs dependientes de TS/JS.
4. Conectar Nest mediante `TypeOrmModule.forRootAsync`. Migraciones se ejecutan por comando separado, sin `synchronize`, `dropSchema` ni inicialización de datos en el arranque.
5. Implementar hash scrypt, validación de credenciales de seed y carga transaccional con bloqueo asesor, claves únicas y bloqueo de saldo. Usuarios existentes no se actualizan.
6. Exponer CLI compilada de migración (`run`/`revert`) y seed. Cerrar conexiones en `finally`; errores de CLI no imprimen consultas con parámetros o secretos.
7. Pruebas unitarias para validadores y opciones; integración contra PostgreSQL en esquemas exclusivos y descartables para migraciones, constraints, persistencia, seed idempotente/concurrente y rollback. Adaptar pruebas HTTP existentes para que Nest use la base de pruebas real.
   El límite de Jest se establece en 30 segundos para admitir el primer arranque con dependencias ESM y conexión real, manteniendo un límite de conexión de 5 segundos en el driver. Se prueba la carga de credenciales de seed desde un archivo de entorno temporal.
8. Extender CI con servicio PostgreSQL y variables de prueba. Registrar checks reales, cobertura y comprobación del CLI antes del commit.

## Referencias

- [NestJS: TypeORM](https://docs.nestjs.com/techniques/database).
- [TypeORM: opciones de DataSource](https://typeorm.io/docs/data-source/data-source-options/).
- [TypeORM: migraciones](https://typeorm.io/docs/migrations/why/).
- [PostgreSQL: imagen oficial Docker](https://hub.docker.com/_/postgres).
- [Node: scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
- [OWASP: almacenamiento de contraseñas y parámetros scrypt](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).

No se implementan rutas de catálogo o movimientos en este commit. La integración del seed verifica atomicidad sobre PostgreSQL; las operaciones de negocio HTTP tendrán su propia especificación posterior.
