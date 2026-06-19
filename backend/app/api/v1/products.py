import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_tenant_db_from_token, get_current_staff
from app.models.tenant.product import Product
from app.models.tenant.payment_item import PaymentItem
from app.models.tenant.user_staff import UserStaff
from app.schemas.pos import ProductCreate, ProductUpdate, ProductResponse
from app.services.audit import audit

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductResponse])
async def list_products(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    q: str = Query(""),
    include_inactive: bool = Query(False),
    low_stock: bool = Query(False),
):
    stmt = select(Product)
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q}%"))
    if low_stock:
        stmt = stmt.where(Product.stock <= Product.low_stock_threshold)
    stmt = stmt.order_by(Product.name)
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    product = Product(**payload.model_dump())
    db.add(product)
    await db.flush()
    audit(db, current_user, "product.create", "product", product.id, {
        "name": product.name, "price": str(product.price), "stock": product.stock,
    })
    await db.commit()
    await db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    product = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(product, field, value)
    audit(db, current_user, "product.update", "product", product.id, {
        k: str(v) for k, v in changes.items()
    })
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}")
async def archive_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    """Soft-delete: las ventas históricas referencian el producto, nunca se borra."""
    product = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    has_sales = (await db.execute(
        select(PaymentItem.id).where(PaymentItem.product_id == product_id).limit(1)
    )).scalar_one_or_none()
    if has_sales:
        product.is_active = False
        audit(db, current_user, "product.archive", "product", product.id, {"name": product.name})
        await db.commit()
        return {"archived": True}
    await db.delete(product)
    audit(db, current_user, "product.delete", "product", product_id, {"name": product.name})
    await db.commit()
    return {"deleted": True}
