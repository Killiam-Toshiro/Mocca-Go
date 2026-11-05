# Recorrido manual del catálogo — PowerShell

Guía actualizada a main el 2026-10-13. Prueba las cinco rutas de catálogo de 006 y explica su flujo; main también incluye DELETE /products/:id (011), documentado en README/Postman: 204 sin historial, 409 con movimientos. Usa desarrollo; los productos de prueba permanecen en ella. Pruebas automatizadas usan PostgreSQL independiente. No publiques contraseñas ni JWT.

## 1. Preparar la API

En PowerShell, desde `Taller Backend – NestJS`, con Docker Desktop funcionando:

```powershell
npm run db:up
npm run migration:run
npm run seed
npm run start:dev
```

Conserva el `.env` existente y sus claves. El seed no reinicia contraseñas ni duplica movimientos. No hay migración nueva para catálogo. Deja esta terminal abierta y utiliza una segunda para las peticiones:

```powershell
$base = 'http://localhost:3000/api/v1'
Invoke-RestMethod "$base/health"
```

Resultado: `{status: 'ok'}`. Arranque: `main.ts` → `bootstrap.ts` → `AppModule` carga `ProductsModule`; `configure-app.ts` establece prefijo y validación. Si cambiaste de rama con la API iniciada, reiníciala para cargar el módulo correcto.

## 2. Cambio de autenticación en main

2FA y auth:enroll fueron retirados en 007; las rutas de setup/confirm/verify-2fa ya no existen (404). Usa directamente el login del paso 3. El usuario confirma el 2026-10-13 que 2FA queda fuera del alcance vigente (D-65).

## 3. Obtener una sesión nueva

Ejecuta este bloque como admin. Para operador, repítelo cambiando username y usando su contraseña. Utiliza las contraseñas reales del primer seed; repetir seed no las reinicia.

```powershell
$username = 'admin'
$password = Read-Host "Contraseña de $username" -AsSecureString
$body = @{ username = $username; password = ([System.Net.NetworkCredential]::new('', $password)).Password } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post "$base/auth/login" -ContentType 'application/json' -Body $body
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
Invoke-RestMethod "$base/auth/me" -Headers $headers
```

Debe indicar username/rol. Login comprueba el hash, crea sesión en PostgreSQL y firma JWT de 15 minutos. Si vence durante el recorrido, repite login. No cierres la sesión hasta terminar.

Conserva los headers del admin:

```powershell
$adminHeaders = $headers
```

## 4. Listar y buscar

```powershell
$page = Invoke-RestMethod "$base/products?page=1&limit=20" -Headers $adminHeaders
$page.data | Format-Table sku, name, active, stock
Invoke-RestMethod "$base/products?search=teclado&active=true&limit=2&page=1" -Headers $adminHeaders
```

El seed contiene `INV-001`, `INV-002`, `INV-003`, con saldos 20, 30 y 10. La respuesta incluye `data`, `page`, `limit`, `total`, `totalPages`. `ProductsService.list()` filtra con `ILIKE` sobre SKU/nombre, escapa comodines, ordena por SKU/ID y pagina mediante TypeORM. Sin filtro de estado aparecen activos e inactivos.

## 5. Crear y consultar

```powershell
$sku = 'PRUEBA-' + [Guid]::NewGuid().ToString('N').Substring(0, 12).ToUpperInvariant()
$createBody = @{ sku = $sku; name = 'Cable de prueba'; description = 'Recorrido manual' } | ConvertTo-Json
$product = Invoke-RestMethod -Method Post "$base/products" -Headers $adminHeaders -ContentType 'application/json' -Body $createBody
$product | Format-List
Invoke-RestMethod "$base/products/$($product.id)" -Headers $adminHeaders
```

POST devuelve 201: ocho campos públicos, `active: true` y `stock: 0`. GET devuelve 200. El DTO valida SKU/nombre/descripción y rechaza campos extra. El servicio guarda mediante el repositorio de `Product`; PostgreSQL garantiza SKU único. `productView()` selecciona explícitamente la respuesta.

## 6. Editar y comprobar idempotencia

```powershell
$editBody = @{ name = 'Cable actualizado'; description = $null } | ConvertTo-Json
$edited = Invoke-RestMethod -Method Patch "$base/products/$($product.id)" -Headers $adminHeaders -ContentType 'application/json' -Body $editBody
$repeated = Invoke-RestMethod -Method Patch "$base/products/$($product.id)" -Headers $adminHeaders -ContentType 'application/json' -Body $editBody
$edited
$edited.updatedAt -eq $repeated.updatedAt
```

Nombre actualizado, descripción `null`, SKU y stock iguales. La comparación devuelve `True`: no hubo un UPDATE innecesario. `changeCatalogFields()` abre una transacción, bloquea la fila y escribe solo las columnas de catálogo que cambiaron; preserva el stock frente a concurrencia.

## 7. Desactivar, filtrar y reactivar

```powershell
$off = Invoke-RestMethod -Method Patch "$base/products/$($product.id)/status" -Headers $adminHeaders -ContentType 'application/json' -Body '{"active":false}'
$offAgain = Invoke-RestMethod -Method Patch "$base/products/$($product.id)/status" -Headers $adminHeaders -ContentType 'application/json' -Body '{"active":false}'
$off.updatedAt -eq $offAgain.updatedAt
Invoke-RestMethod "$base/products?active=false&search=$sku" -Headers $adminHeaders
Invoke-RestMethod -Method Patch "$base/products/$($product.id)/status" -Headers $adminHeaders -ContentType 'application/json' -Body '{"active":true}'
```

Respuestas 200, comparación `True`, producto presente entre inactivos antes de reactivarlo. Se conserva stock e historial. No hay eliminación física ni edición del SKU; los movimientos se prueban en [la guía del incremento 007](movements-manual.md).

## 8. Errores esperados

Ejecuta cada petición por separado. PowerShell muestra un error HTTP porque estamos comprobando rechazos; busca el `statusCode` del JSON.

```powershell
# 409: mismo SKU; conserva el producto original.
Invoke-RestMethod -Method Post "$base/products" -Headers $adminHeaders -ContentType 'application/json' -Body $createBody
# 400: editar stock está prohibido.
Invoke-RestMethod -Method Patch "$base/products/$($product.id)" -Headers $adminHeaders -ContentType 'application/json' -Body '{"stock":100}'
# 400: UUID inválido.
Invoke-RestMethod "$base/products/no-es-uuid" -Headers $adminHeaders
# 400: paginación no canónica.
Invoke-RestMethod "$base/products?page=01" -Headers $adminHeaders
# 404: UUID válido que no existe.
$missingId = [Guid]::NewGuid().ToString()
Invoke-RestMethod "$base/products/$missingId" -Headers $adminHeaders
# 401: sin sesión.
Invoke-RestMethod "$base/products"
```

Los guards se ejecutan antes del pipe: un operador que envía incluso un body inválido a una ruta de escritura recibe 403.

## 9. Probar permisos del operador

Repite el login del paso 3 con username operador. Conserva adminHeaders y ahora asigna:

```powershell
$operatorHeaders = $headers
Invoke-RestMethod "$base/auth/me" -Headers $operatorHeaders
# 200: puede listar y consultar.
Invoke-RestMethod "$base/products" -Headers $operatorHeaders
Invoke-RestMethod "$base/products/$($product.id)" -Headers $operatorHeaders
# 403: no puede crear, editar ni cambiar estado.
Invoke-RestMethod -Method Post "$base/products" -Headers $operatorHeaders -ContentType 'application/json' -Body $createBody
Invoke-RestMethod -Method Patch "$base/products/$($product.id)" -Headers $operatorHeaders -ContentType 'application/json' -Body '{"name":"No permitido"}'
Invoke-RestMethod -Method Patch "$base/products/$($product.id)/status" -Headers $operatorHeaders -ContentType 'application/json' -Body '{"active":false}'
```

`AuthGuard` valida JWT/sesión y obtiene el rol vigente de PostgreSQL. `RolesGuard` comprueba `@Roles('admin')` en las tres rutas de escritura. Las rutas de lectura solo exigen autenticación.

## 10. Cerrar sesión y ejecutar pruebas automatizadas

```powershell
Invoke-RestMethod -Method Post "$base/auth/logout" -Headers $operatorHeaders
# 401: el JWT de la sesión cerrada deja de funcionar.
Invoke-RestMethod "$base/products" -Headers $operatorHeaders

npm test -- --runTestsByPath test/unit/products-contract.spec.ts
npm run db:test:up
npm run test:e2e -- --runTestsByPath test/database/products.e2e-spec.ts
npm run test:cov
```

Logout devuelve 204 y revoca solo esa sesión. Unidades prueban DTOs, proyección, paginación y manejo de errores. Integración levanta Nest en un puerto efímero y usa Supertest con PostgreSQL real; prepara esquemas propios, aplica migraciones y los elimina al terminar. Incluye permisos, filtros, persistencia, idempotencia y creaciones/ediciones concurrentes. La cobertura exige al menos 80% en líneas, sentencias, funciones y ramas para todo `src`.

Los tests no necesitan una API manual en puerto 3000 ni cambian los productos de desarrollo. El reporte HTML está en `coverage/lcov-report/index.html`. Los resultados medidos de esta corrección se registran en [el overview](commits/006.md).

## Archivos para seguir el flujo

- [AppModule](../src/app.module.ts) registra el módulo.
- [ProductsModule](../src/products/module/products.module.ts) conecta controlador/servicio con autenticación.
- [ProductsController](../src/products/controller/products.controller.ts) declara rutas y permisos.
- [DTOs](../src/products/DTOs/products.dto.ts) y [paginación](../src/common/pagination.ts) validan entradas.
- [ProductsService](../src/products/services/products.services.ts) aplica reglas y consultas.
- [Product](../src/products/entities/products.entity.ts) representa la tabla existente.
- [productView](../src/products/products.view.ts) construye la respuesta.
- [Unidades](../test/unit/products-contract.spec.ts) e [integración](../test/database/products.e2e-spec.ts) comprueban los contratos definidos en [la especificación](../specs/006-catalog/spec.md).
