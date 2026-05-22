import asyncio
import sys
sys.path.insert(0, "backend")

from app.services.tenant_service import create_tenant


async def main():
    if len(sys.argv) < 5:
        print("Usage: python scripts/create_tenant_db.py <owner_email> <gym_name> <city> <owner_full_name> [password]")
        sys.exit(1)
    
    owner_email = sys.argv[1]
    gym_name = sys.argv[2]
    city = sys.argv[3]
    owner_full_name = sys.argv[4]
    password = sys.argv[5] if len(sys.argv) > 5 else "TempPass123!"
    
    tenant = await create_tenant(owner_email, gym_name, city, owner_full_name, password)
    print(f"Tenant created: {tenant.name}")
    print(f"  DB: {tenant.db_name}")
    print(f"  Slug: {tenant.slug}")
    print(f"  Connection: {tenant.db_connection_string}")


if __name__ == "__main__":
    asyncio.run(main())
