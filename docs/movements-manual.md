# Recorrido manual — entradas, salidas e historial

Guía actualizada a main el 2026-10-13; movimientos integrados y renumerados como 008. Crea un producto propio y movimientos reales en desarrollo. Conserva claves de .env; la autenticación actual es JWT-only (2FA retirado). Reinicia la API al cambiar de versión y aplica las migraciones pendientes según README; esta auditoría no aplica migraciones a desarrollo.

## 1. Preparar API y sesión

Desde la raíz del proyecto, con Docker Desktop funcionando:

```powershell
npm run db:up
npm run start:dev
```

Movimientos no añade migración, pero main incluye la migración de retiro de 2FA (007). Para instalación/actualización aplica migraciones y seed según README. En otra terminal, usa un login JWT vigente como admin, siguiendo el paso 3 de [la guía de catálogo](catalog-manual.md). Conserva headers del login:

```powershell
$base = 'http://localhost:3000/api/v1'
$adminHeaders = $headers
Invoke-RestMethod "$base/auth/me" -Headers $adminHeaders
```

Debe indicar admin. Si recibes 401, renueva login con usuario/contraseña; las sesiones duran 15 minutos. No compartas JWT o contraseñas.

## 2. Crear un producto independiente

```powershell
$sku = 'MOV-' + [Guid]::NewGuid().ToString('N').Substring(0, 12).ToUpperInvariant()
$body = @{ sku = $sku; name = 'Producto para movimientos' } | ConvertTo-Json
$product = Invoke-RestMethod -Method Post "$base/products" -Headers $adminHeaders -ContentType 'application/json' -Body $body
$product.stock
```

Stock esperado: 0. Conserva `$product.id`. Los productos del seed no se modifican en este recorrido.

## 3. Entrada de 10

```powershell
$body = @{ productId = $product.id; type = 'IN'; quantity = 10; reason = 'Compra de prueba' } | ConvertTo-Json
$incoming = Invoke-RestMethod -Method Post "$base/movements" -Headers $adminHeaders -ContentType 'application/json' -Body $body
$incoming | ConvertTo-Json -Depth 4
```

HTTP 201, `stock: 10` y `movement` con ID, producto, tipo IN, cantidad, motivo, responsable y fecha. El responsable es tu usuario autenticado; no se envía desde el body.

Flujo: `AuthGuard` verifica JWT/sesión → `RolesGuard` admite admin/operador → pipe valida `CreateMovementDto` → controller pasa identidad y datos a `MovementsService.create()` → transacción bloquea producto, revalida sesión, calcula saldo, actualiza stock y guarda historial. `movementView()` expone solo los campos públicos. Si falla el insert, PostgreSQL revierte también el stock.

## 4. Salida de 4 y consulta del saldo

```powershell
$body = @{ productId = $product.id; type = 'OUT'; quantity = 4; reason = 'Entrega de prueba' } | ConvertTo-Json
$outgoing = Invoke-RestMethod -Method Post "$base/movements" -Headers $adminHeaders -ContentType 'application/json' -Body $body
$outgoing.stock
Invoke-RestMethod "$base/products/$($product.id)" -Headers $adminHeaders
```

Saldo esperado: 6 en ambas respuestas. La transacción actualiza únicamente stock; SKU, nombre, descripción y estado se conservan. El saldo en POST corresponde a esa operación confirmada; otra operación posterior podría cambiarlo.

## 5. Historial paginado y filtros

```powershell
$history = Invoke-RestMethod "$base/movements?productId=$($product.id)&limit=20&page=1" -Headers $adminHeaders
$history | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/movements?productId=$($product.id)&type=OUT" -Headers $adminHeaders
Invoke-RestMethod "$base/movements?productId=$($product.id)&limit=1&page=2" -Headers $adminHeaders
```

Total 2, orden del más reciente al más antiguo (OUT primero), filtro OUT con un registro, segunda página de tamaño 1 con el IN. El servicio lee página y conteo bajo REPEATABLE READ; ordena por fecha e ID descendentes. No aparecen claves del seed ni secretos del responsable.

## 6. Rechazos sin modificar datos

Ejecuta las peticiones por separado; PowerShell muestra error HTTP porque verificamos rechazos.

```powershell
# 409: salida de 7 con saldo 6.
$body = @{ productId = $product.id; type = 'OUT'; quantity = 7; reason = 'Saldo insuficiente' } | ConvertTo-Json
Invoke-RestMethod -Method Post "$base/movements" -Headers $adminHeaders -ContentType 'application/json' -Body $body
# 400: cantidad cero.
$body = @{ productId = $product.id; type = 'IN'; quantity = 0; reason = 'Cantidad inválida' } | ConvertTo-Json
Invoke-RestMethod -Method Post "$base/movements" -Headers $adminHeaders -ContentType 'application/json' -Body $body
# 400: responsable enviado por el cliente.
$body = @{ productId = $product.id; type = 'IN'; quantity = 1; reason = 'Campo extra'; userId = 'injected' } | ConvertTo-Json
Invoke-RestMethod -Method Post "$base/movements" -Headers $adminHeaders -ContentType 'application/json' -Body $body
# 404: producto inexistente.
$body = @{ productId = [Guid]::NewGuid().ToString(); type = 'IN'; quantity = 1; reason = 'No existe' } | ConvertTo-Json
Invoke-RestMethod -Method Post "$base/movements" -Headers $adminHeaders -ContentType 'application/json' -Body $body
# 401: no hay sesión.
Invoke-RestMethod "$base/movements"
```

Vuelve a consultar producto/historial: saldo 6 y total 2. Las cantidades deben ser números JSON enteros positivos; strings, decimales y campos adicionales se rechazan. No hay PATCH/DELETE de movimientos.

## 7. Inactivar y conservar historial

```powershell
Invoke-RestMethod -Method Patch "$base/products/$($product.id)/status" -Headers $adminHeaders -ContentType 'application/json' -Body '{"active":false}'
$body = @{ productId = $product.id; type = 'IN'; quantity = 1; reason = 'Producto inactivo' } | ConvertTo-Json
# 409: conserva stock e historial.
Invoke-RestMethod -Method Post "$base/movements" -Headers $adminHeaders -ContentType 'application/json' -Body $body
Invoke-RestMethod "$base/movements?productId=$($product.id)" -Headers $adminHeaders
Invoke-RestMethod -Method Patch "$base/products/$($product.id)/status" -Headers $adminHeaders -ContentType 'application/json' -Body '{"active":true}'
```

Catálogo y movimientos comparten el bloqueo de la misma fila. Si la desactivación se confirma mientras un movimiento espera, este comprueba el estado actualizado y se rechaza.

## 8. Probar operador y pruebas automatizadas

Inicia sesión como operador, según la guía de catálogo, y asigna `$operatorHeaders = $headers`. Puede registrar IN/OUT y consultar historial, pero sigue sin poder editar catálogo o administrar usuarios. Una entrada suya debe devolver `movement.user.username: operador`. Esa entrada adicional altera el stock y el total de tu producto de prueba.

```powershell
$body = @{ productId = $product.id; type = 'IN'; quantity = 1; reason = 'Entrada del operador' } | ConvertTo-Json
Invoke-RestMethod -Method Post "$base/movements" -Headers $operatorHeaders -ContentType 'application/json' -Body $body
Invoke-RestMethod "$base/movements?productId=$($product.id)" -Headers $operatorHeaders

npm test -- --runTestsByPath test/unit/movements-contract.spec.ts
npm run db:test:up
npm run test:e2e -- --runTestsByPath test/database/movements.e2e-spec.ts
npm run test:cov
```

Integración prepara esquemas exclusivos de inventory_test. Verifica rollback real mediante trigger, dos salidas simultáneas de 4 con saldo 6 (una 201, otra 409), entradas concurrentes, catálogo/saldo preservados y sesión/estado cambiados durante esperas observadas en PostgreSQL. Desarrollo conserva tu producto y movimientos; el test no modifica esa base.

POST no es idempotente: repetir una petición válida registra otro movimiento. Consulta historial antes de reintentar una respuesta incierta.

## Código y SDD

- [Controller](../src/movements/movements.controller.ts), [DTOs](../src/movements/movements.dto.ts), [servicio](../src/movements/movements.service.ts), [proyección](../src/movements/movement.view.ts).
- [Entidad](../src/movements/entities/stock-movement.entity.ts), [unidades](../test/unit/movements-contract.spec.ts), [integración](../test/database/movements.e2e-spec.ts).
- [Especificación](../specs/008-movements/spec.md), [plan](../specs/008-movements/plan.md), [tareas](../specs/008-movements/tasks.md) y [overview](commits/008.md).
