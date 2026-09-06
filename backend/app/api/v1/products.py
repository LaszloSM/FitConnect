import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from sqlalchemy import desc, or_

from app.api.deps import get_tenant_db_from_token, get_current_staff, require_role
from app.models.tenant.product import Product
from app.models.tenant.inventory import ProductCategory, StockMovement, StockMovementType
from app.models.tenant.payment_item import PaymentItem
from app.models.tenant.user_staff import UserStaff, UserRole
from app.schemas.pos import (
    ProductCreate, ProductUpdate, ProductResponse,
    ProductCategoryIn, ProductCategoryOut, StockMovementIn, StockMovementOut,
)
from app.services.audit import audit
from app.services.inventory import apply_stock_movement

router = APIRouter(prefix="/products", tags=["products"], dependencies=[Depends(get_current_staff)])


def _with_category(product: Product, names: dict) -> ProductResponse:
    data = ProductResponse.model_validate(product)
    data.category_name = names.get(product.category_id) if product.category_id else None
    return data


async def _category_names(db: AsyncSession) -> dict:
    rows = (await db.execute(select(ProductCategory.id, ProductCategory.name))).all()
    return {cid: name for cid, name in rows}


# ─── Categorías ───

@router.get("/categories", response_model=list[ProductCategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    include_inactive: bool = Query(False),
):
    stmt = select(ProductCategory)
    if not include_inactive:
        stmt = stmt.where(ProductCategory.is_active.is_(True))
    return (await db.execute(stmt.order_by(ProductCategory.sort_order, ProductCategory.name))).scalars().all()


@router.post("/categories", response_model=ProductCategoryOut, status_code=201)
async def create_category(
    payload: ProductCategoryIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    exists = (await db.execute(
        select(ProductCategory).where(ProductCategory.name.ilike(payload.name.strip()))
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Ya existe una categoría con ese nombre")
    row = ProductCategory(
        name=payload.name.strip(), sort_order=payload.sort_order, is_active=payload.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.put("/categories/{category_id}", response_model=ProductCategoryOut,
            dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def update_category(
    category_id: uuid.UUID,
    payload: ProductCategoryIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    row = (await db.execute(select(ProductCategory).where(ProductCategory.id == category_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    row.name, row.sort_order, row.is_active = payload.name.strip(), payload.sort_order, payload.is_active
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/categories/{category_id}", dependencies=[Depends(require_role(UserRole.owner, UserRole.admin))])
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
):
    """Los productos que la usaban quedan sin categoría."""
    row = (await db.execute(select(ProductCategory).where(ProductCategory.id == category_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    for p in (await db.execute(select(Product).where(Product.category_id == category_id))).scalars().all():
        p.category_id = None
    await db.delete(row)
    await db.commit()
    return {"deleted": True}


# ─── Productos ───

@router.get("", response_model=list[ProductResponse])
async def list_products(
    db: AsyncSession = Depends(get_tenant_db_from_token),
    q: str = Query(""),
    include_inactive: bool = Query(False),
    low_stock: bool = Query(False),
    category_id: uuid.UUID | None = Query(None),
):
    stmt = select(Product)
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode == q))
    if low_stock:
        stmt = stmt.where(Product.stock <= Product.low_stock_threshold)
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    stmt = stmt.order_by(Product.name)
    products = (await db.execute(stmt)).scalars().all()
    names = await _category_names(db)
    return [_with_category(p, names) for p in products]


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    data = payload.model_dump()
    initial_stock = data.pop("stock", 0)
    product = Product(**data, stock=0)
    db.add(product)
    await db.flush()
    if initial_stock > 0:
        await apply_stock_movement(
            db, product.id, StockMovementType.adjustment, initial_stock,
            unit_cost=product.cost_price, note="Saldo inicial", user_id=current_user.id,
        )
    audit(db, current_user, "product.create", "product", product.id, {
        "name": product.name, "price": str(product.price), "stock": initial_stock,
    })
    await db.commit()
    await db.refresh(product)
    return _with_category(product, await _category_names(db))


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
    new_stock = changes.pop("stock", None)
    for field, value in changes.items():
        setattr(product, field, value)
    if new_stock is not None and new_stock != product.stock:
        if current_user.role == UserRole.receptionist:
            raise HTTPException(status_code=403, detail="Solo owner o admin ajustan el stock")
        # El stock no se edita a mano: la diferencia queda como ajuste auditado
        await apply_stock_movement(
            db, product.id, StockMovementType.adjustment, new_stock - product.stock,
            note="Ajuste desde edición del producto", user_id=current_user.id,
        )
        changes["stock"] = new_stock
    audit(db, current_user, "product.update", "product", product.id, {
        k: str(v) for k, v in changes.items()
    })
    await db.commit()
    await db.refresh(product)
    return _with_category(product, await _category_names(db))


# ─── Movimientos de inventario ───

@router.post("/{product_id}/movements", response_model=StockMovementOut, status_code=201)
async def create_movement(
    product_id: uuid.UUID,
    payload: StockMovementIn,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    current_user: UserStaff = Depends(get_current_staff),
):
    # Recepción registra entradas (recibe pedidos); mermas y ajustes son de owner/admin
    if payload.type != "purchase" and current_user.role == UserRole.receptionist:
        raise HTTPException(status_code=403, detail="Solo owner o admin registran mermas y ajustes")
    movement = await apply_stock_movement(
        db, product_id, StockMovementType(payload.type), payload.quantity,
        unit_cost=payload.unit_cost, note=payload.note, user_id=current_user.id,
    )
    if payload.type == "purchase" and payload.unit_cost is not None:
        # La última compra actualiza el costo de referencia del producto
        product = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one()
        product.cost_price = payload.unit_cost
    audit(db, current_user, "stock.movement", "product", product_id, {
        "type": payload.type, "quantity": movement.quantity, "stock_after": movement.stock_after,
    })
    await db.commit()
    await db.refresh(movement)
    out = StockMovementOut.model_validate(movement)
    out.created_by_name = current_user.full_name
    return out


@router.get("/{product_id}/movements", response_model=list[StockMovementOut])
async def list_movements(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_tenant_db_from_token),
    limit: int = Query(50, ge=1, le=500),
):
    rows = (await db.execute(
        select(StockMovement, UserStaff.full_name)
        .outerjoin(UserStaff, UserStaff.id == StockMovement.created_by)
        .where(StockMovement.product_id == product_id)
        .order_by(desc(StockMovement.created_at))
        .limit(limit)
    )).all()
    out = []
    for m, name in rows:
        data = StockMovementOut.model_validate(m)
        data.created_by_name = name
        out.append(data)
    return out


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
