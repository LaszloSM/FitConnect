# Matriz RBAC — FitConnect

Roles (en `UserStaff.role`): `owner`, `admin`, `receptionist`.

Toda ruta autenticada exige **staff activo** (`get_current_staff`): un token cuyo
`staff_id` ya no corresponde a un `UserStaff` con `is_active=True` es rechazado con
401. Antes muchas rutas usaban solo `get_tenant_db_from_token` (cualquier token
válido del tenant), sin verificar identidad ni rol.

Convención de aplicación: el guard va en `dependencies=[...]` del decorador de la
ruta. Como `get_current_staff` / `require_role` dependen de
`get_tenant_db_from_token`, FastAPI reusa la misma sesión (dependency caching), sin
abrir una segunda conexión.

## Niveles

- **owner**: configuración fiscal, integraciones, usuarios/invitaciones, auditoría,
  billing (PATCH).
- **owner + admin**: visibilidad financiera (ingresos, caja, cuentas por cobrar,
  dashboard financiero), edición/borrado de pagos, borrado de miembros, gestión de
  dispositivos kiosko, listar staff.
- **cualquier staff activo (incl. receptionist)**: check-ins, registrar pagos
  operativos / POS, lectura y alta/edición de miembros, generar links de pago.

## Matriz por endpoint

| Módulo | Endpoint | Rol mínimo |
|--------|----------|-----------|
| dashboard | GET /dashboard/kpis | owner+admin |
| dashboard | GET /dashboard/insights | owner+admin |
| dashboard | GET /dashboard/operations | owner+admin |
| payments | GET /payments | owner+admin |
| payments | GET /payments/cash | owner+admin |
| payments | GET /payments/receivables | owner+admin |
| payments | PUT /payments/{id} | owner+admin |
| payments | DELETE /payments/{id} | owner+admin |
| payments | POST /payments | staff activo |
| payments | GET /payments/{id} | staff activo |
| payments | GET /payments/{id}/receipt | staff activo |
| payments | POST /payments/{id}/payment-link | staff activo |
| payments | POST /payments/{id}/void | staff activo |
| payments | PATCH /payments/{id}/mark-paid | staff activo |
| checkins | GET /checkins, GET /checkins/today | staff activo |
| checkins | POST /checkins, POST /checkins/qr/{qr} | staff activo |
| checkins | POST /checkins/override | staff activo |
| members | GET /members y subrecursos de lectura | staff activo |
| members | POST /members, PUT /members/{id} | staff activo |
| members | DELETE /members/{id} | owner+admin |
| reports | TODO el módulo /reports (ingresos, P&L, exportaciones) | owner+admin |
| cash | GET /cash/shifts, GET /cash/expenses | owner+admin |
| cash | GET /cash/shifts/current, abrir/cerrar turno, registrar gasto | staff activo |
| settings | GET/PATCH /settings/billing | owner+admin (GET), owner (PATCH) |
| settings | /settings/integrations, /settings/operations (PATCH), notifications | ver settings.py |
| users | invitaciones, roles, desactivar | owner |
| audit | GET /audit | owner |
| kiosk | gestión de dispositivos | owner+admin |
| kiosk | checkin/ping | token de kiosko (scope=kiosk) |

Los tests negativos por rol viven en `backend/tests/test_rbac.py`.
