"""Movimientos de inventario: única forma de cambiar el stock de un producto.

El UPDATE condicional garantiza que nunca se vende más de lo que hay aunque dos
cajas cobren a la vez; el movimiento deja el rastro con el stock resultante.
"""
import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.inventory import StockMovement, StockMovementType
from app.models.tenant.product import Product

_OUTFLOWS = {StockMovementType.sale, StockMovementType.waste}
_INFLOWS = {StockMovementType.purchase, StockMovementType.return_}


async def apply_stock_movement(
    db: AsyncSession,
    product_id: uuid.UUID,
    type: StockMovementType,
    quantity: int,
    *,
    unit_cost: Decimal | None = None,
    note: str | None = None,
    payment_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> StockMovement:
    """`quantity` es la magnitud para compra/venta/merma/devolución (el signo lo
    pone el tipo) y con signo para ajustes. Lanza 409 si el stock no alcanza."""
    if type in _OUTFLOWS:
        delta = -abs(quantity)
    elif type in _INFLOWS:
        delta = abs(quantity)
    else:
        delta = quantity
    if delta == 0:
        raise HTTPException(status_code=400, detail="La cantidad del movimiento no puede ser cero")

    row = (await db.execute(
        update(Product)
        .where(Product.id == product_id, Product.stock + delta >= 0)
        .values(stock=Product.stock + delta)
        .returning(Product.stock, Product.name, Product.cost_price)
    )).first()
    if row is None:
        product = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        raise HTTPException(
            status_code=409,
            detail=f"Stock insuficiente de {product.name}: quedan {product.stock}",
        )
    stock_after, _name, cost_price = row
    movement = StockMovement(
        product_id=product_id,
        type=type.value,
        quantity=delta,
        unit_cost=unit_cost if unit_cost is not None else cost_price,
        stock_after=stock_after,
        note=note,
        payment_id=payment_id,
        created_by=user_id,
    )
    db.add(movement)
    return movement
