"""Database operations for Insurance CRM — PostgreSQL + SQLite fallback."""
import os
import json
from datetime import datetime, date
from contextlib import contextmanager

from sqlalchemy import create_engine, text, Column, Integer, String, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://smartquote_crm_db_user:***@dpg-d8l5gkv7f7vs73flll2g-a/smartquote_crm_db"
)

# NullPool required for Render managed Postgres (no SSL toggle)
_known_postgres_urls = (
    "postgresql://smartquote_crm_db_user:***@dpg-d8l5gkv7f7vs73flll2g-a/smartquote_crm_db",
)
if any(DATABASE_URL.startswith(u) for u in _known_postgres_urls) or "postgresql://" in DATABASE_URL or "postgres://" in DATABASE_URL:
    engine = create_engine(DATABASE_URL, poolclass=NullPool)
else:
    # Local SQLite fallback — use SQLAlchemy so text() works uniformly
    import sqlite3
    from pathlib import Path
    DB_PATH = Path(__file__).parent / "insurance.db"
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine)

Base = declarative_base()


# ── SQLite helpers (local fallback) ─────────────────────────────────────────
def _get_sqlite_conn():
    import sqlite3
    from pathlib import Path
    conn = sqlite3.connect(str(Path(__file__).parent / "insurance.db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def row_to_dict(row):
    if row is None:
        return None
    if hasattr(row, '_asdict'):
        return row._asdict()
    return dict(row)


# ── SQLAlchemy session (Postgres) ────────────────────────────────────────────
@contextmanager
def get_session():
    if engine is None:
        # SQLite path — open connection directly
        conn = _get_sqlite_conn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        session = SessionLocal(bind=engine)
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()


# ── Init DB ─────────────────────────────────────────────────────────────────
def init_db():
    import os
    if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
        return  # PostgreSQL tables already exist
    conn = _get_sqlite_conn()
    cur = conn.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL, phone TEXT, email TEXT,
                is_potential INTEGER DEFAULT 0, address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL, license_plate TEXT, policy_type TEXT,
                coverage_amount REAL, premium REAL, start_date DATE, expiry_date DATE,
                status TEXT DEFAULT 'active', notes TEXT, from_renewal INTEGER DEFAULT 0,
                insurance_company TEXT DEFAULT '', policy_number TEXT DEFAULT '',
                agency_company TEXT DEFAULT '', vehicle_model TEXT DEFAULT '',
                vehicle_year TEXT DEFAULT '', excess_info TEXT DEFAULT '',
                ncb_ncd TEXT DEFAULT '', excess_young TEXT DEFAULT '',
                excess_inexperienced TEXT DEFAULT '', excess_unnamed TEXT DEFAULT '',
                excess_tppd TEXT DEFAULT '', excess_parking TEXT DEFAULT '',
                excess_theft TEXT DEFAULT '', excess_windscreen TEXT DEFAULT '',
                excess_authorised_repair TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS coverages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_id INTEGER NOT NULL, coverage_name TEXT,
                coverage_amount REAL, premium REAL, notes TEXT,
                FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS renewals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_policy_id INTEGER, new_policy_id INTEGER,
                customer_id INTEGER NOT NULL, license_plate TEXT,
                insurance_company TEXT, policy_type TEXT,
                coverage_amount REAL, premium REAL,
                effective_date DATE, expiry_date DATE,
                renewal_date DATE DEFAULT (date('now')),
                status TEXT DEFAULT 'pending', notes TEXT,
                agent_person TEXT DEFAULT '', policy_number TEXT DEFAULT '',
                vehicle_model TEXT DEFAULT '', phone TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (original_policy_id) REFERENCES policies(id) ON DELETE SET NULL,
                FOREIGN KEY (new_policy_id) REFERENCES policies(id) ON DELETE SET NULL,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL, entity_type TEXT NOT NULL,
                entity_id INTEGER, description TEXT, details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        """)
    conn.commit()
    conn.close()


# ── Stats / Dashboard helpers ─────────────────────────────────────────────────
def get_stats():
    with get_session() as conn:
        total_policies = conn.execute(text(
            "SELECT COUNT(*) FROM policies WHERE COALESCE(from_renewal,0)=0 AND status NOT IN ('expired','cancelled','discontinued','lapsed','not_renewing')"
        )).fetchone()[0]
        total_customers = conn.execute(text(
            "SELECT COUNT(*) FROM customers WHERE COALESCE(is_potential,0)=0"
        )).fetchone()[0]
        pending_renewals = conn.execute(text(
            "SELECT COUNT(*) FROM renewals WHERE status='pending'"
        )).fetchone()[0]
        total_premium = conn.execute(text(
            "SELECT COALESCE(SUM(premium),0) FROM policies WHERE COALESCE(from_renewal,0)=0 AND status NOT IN ('expired','cancelled','discontinued','lapsed','not_renewing')"
        )).fetchone()[0]
        potential_count = conn.execute(text(
            "SELECT COUNT(*) FROM customers WHERE is_potential=1"
        )).fetchone()[0]
        return {
            "total_policies": total_policies or 0,
            "total_customers": total_customers or 0,
            "pending_renewals": pending_renewals or 0,
            "total_premium": float(total_premium or 0),
            "potential_count": potential_count or 0,
        }

def get_recent_customers(limit=5):
    with get_session() as conn:
        rows = conn.execute(text(
            "SELECT * FROM customers ORDER BY created_at DESC LIMIT :lim"
        ), {"lim": limit}).fetchall()
        return [row_to_dict(r) for r in rows]

def get_policies_by_customer(cid):
    with get_session() as conn:
        rows = conn.execute(text(
            "SELECT * FROM policies WHERE customer_id=:cid ORDER BY created_at DESC"
        ), {"cid": cid}).fetchall()
        return [row_to_dict(r) for r in rows]

def get_monthly_stats():
    with get_session() as conn:
        # Use strftime for cross-database compatibility (works for both SQLite TEXT and PostgreSQL DATE)
        rows = conn.execute(text(
            "SELECT strftime('%Y-%m', start_date) as month, COUNT(*) as count, SUM(premium) as total "
            "FROM policies WHERE start_date IS NOT NULL AND start_date != '' AND start_date IS NOT NULL "
            "GROUP BY month ORDER BY month DESC LIMIT 12"
        )).fetchall()
        return [{"month": r[0], "count": r[1], "total": float(r[2] or 0)} for r in rows]

def get_type_stats():
    with get_session() as conn:
        rows = conn.execute(text(
            "SELECT policy_type, COUNT(*) as count FROM policies GROUP BY policy_type"
        )).fetchall()
        return [{"type": r[0] or "未分類", "count": r[1]} for r in rows]

def get_status_stats():
    with get_session() as conn:
        rows = conn.execute(text(
            "SELECT status, COUNT(*) as count FROM policies GROUP BY status"
        )).fetchall()
        return [{"status": r[0] or "未設定", "count": r[1]} for r in rows]

def get_pending_renewal_stats():
    with get_session() as conn:
        row = conn.execute(text(
            "SELECT COUNT(*) FROM renewals WHERE status='pending'"
        )).fetchone()
        return {"pending": row[0] if row else 0}

def init_sample_data():
    """Only insert sample data if tables are empty."""
    with get_session() as conn:
        row = conn.execute(text("SELECT COUNT(*) FROM customers")).fetchone()
        if row[0] > 0:
            return  # Already has data


# ── Activity Log ──────────────────────────────────────────────────────────────
def _log_activity(conn, action, entity_type, entity_id, description, details=None):
    conn.execute(text(
        "INSERT INTO activity_log (action, entity_type, entity_id, description, details) VALUES (:a,:et,:eid,:desc,:det)"
    ), {"a": action, "et": entity_type, "eid": entity_id, "desc": description, "det": details})

def _init_activity_log(conn):
    pass  # created in init_db

def get_recent_activity(limit=20):
    with get_session() as conn:
        rows = conn.execute(text(
            "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT :lim"
        ), {"lim": limit}).fetchall()
        return [row_to_dict(r) for r in rows]


# ── Customers ────────────────────────────────────────────────────────────────
def get_all_customers(include_potential=False):
    with get_session() as conn:
        if include_potential:
            rows = conn.execute(text("SELECT * FROM customers ORDER BY created_at DESC")).fetchall()
        else:
            rows = conn.execute(text(
                "SELECT * FROM customers WHERE COALESCE(is_potential,0)=0 ORDER BY created_at DESC"
            )).fetchall()
        return [row_to_dict(r) for r in rows]

def get_all_customers_for_renewals():
    with get_session() as conn:
        rows = conn.execute(text("SELECT * FROM customers ORDER BY created_at DESC")).fetchall()
        return [row_to_dict(r) for r in rows]

def get_customer(cid):
    with get_session() as conn:
        row = conn.execute(text("SELECT * FROM customers WHERE id=:id"), {"id": cid}).fetchone()
        return row_to_dict(row)

def create_customer(name, phone, email):
    with get_session() as conn:
        result = conn.execute(text(
            "INSERT INTO customers (name,phone,email) VALUES (:n,:p,:e) RETURNING id"
        ), {"n": name, "p": phone, "e": email})
        cid = result.fetchone()[0]
        _log_activity(conn, 'create', 'customer', cid, f'新增客戶: {name}', f'電話: {phone}')
        conn.commit()
    return get_customer(cid)

def update_customer(cid, name=None, phone=None, email=None, address=None):
    fields, vals = [], {}
    if name is not None:
        fields.append("name=:n"); vals["n"] = name
    if phone is not None:
        fields.append("phone=:ph"); vals["ph"] = phone
    if email is not None:
        fields.append("email=:em"); vals["em"] = email
    if address is not None:
        fields.append("address=:ad"); vals["ad"] = address
    if not fields:
        return get_customer(cid)
    fields.append("updated_at=CURRENT_TIMESTAMP")
    vals["cid"] = cid
    with get_session() as conn:
        conn.execute(text(f"UPDATE customers SET {','.join(fields)} WHERE id=:cid"), vals)
        _log_activity(conn, 'update', 'customer', cid, f'更新客戶 ID:{cid}')
        conn.commit()
    return get_customer(cid)

def delete_customer(cid):
    with get_session() as conn:
        row = conn.execute(text("SELECT name FROM customers WHERE id=:id"), {"id": cid}).fetchone()
        name = row[0] if row else 'Unknown'
        conn.execute(text("DELETE FROM customers WHERE id=:id"), {"id": cid})
        _log_activity(conn, 'delete', 'customer', cid, f'刪除客戶: {name}')
        conn.commit()


# ── Policies ────────────────────────────────────────────────────────────────
def get_all_policies(include_renewal=False):
    with get_session() as conn:
        if include_renewal:
            rows = conn.execute(text("""
                SELECT p.*, c.name as customer_name, c.phone as customer_phone,
                       c.email as customer_email, c.address as customer_address
                FROM policies p LEFT JOIN customers c ON p.customer_id=c.id
                WHERE p.status NOT IN ('expired','cancelled','discontinued','lapsed','not_renewing')
                  AND (p.expiry_date >= CURRENT_DATE OR p.expiry_date IS NULL OR p.expiry_date='')
                ORDER BY p.created_at DESC
            """)).fetchall()
        else:
            rows = conn.execute(text("""
                SELECT p.*, c.name as customer_name, c.phone as customer_phone,
                       c.email as customer_email, c.address as customer_address
                FROM policies p LEFT JOIN customers c ON p.customer_id=c.id
                WHERE COALESCE(p.from_renewal,0)=0
                  AND p.status NOT IN ('expired','cancelled','discontinued','lapsed','not_renewing')
                  AND (p.expiry_date >= CURRENT_DATE OR p.expiry_date IS NULL OR p.expiry_date='')
                ORDER BY p.created_at DESC
            """)).fetchall()
        return [row_to_dict(r) for r in rows]

def get_lapsed_policies():
    with get_session() as conn:
        rows = conn.execute(text("""
            SELECT p.*, c.name as customer_name, c.phone as customer_phone,
                   c.email as customer_email, c.address as customer_address
            FROM policies p LEFT JOIN customers c ON p.customer_id=c.id
            WHERE p.status IN ('expired','cancelled','discontinued','lapsed','not_renewing')
               OR (p.expiry_date < CURRENT_DATE AND p.expiry_date IS NOT NULL AND p.expiry_date!='')
            ORDER BY p.expiry_date DESC
        """)).fetchall()
        return [row_to_dict(r) for r in rows]

def get_policy(pid):
    with get_session() as conn:
        row = conn.execute(text("""
            SELECT p.*, c.name as customer_name, c.phone as customer_phone,
                   c.email as customer_email, c.address as customer_address
            FROM policies p LEFT JOIN customers c ON p.customer_id=c.id WHERE p.id=:pid
        """), {"pid": pid}).fetchone()
        return row_to_dict(row)

def create_policy(customer_id, license_plate, policy_type, coverage_amount,
                  premium, start_date, expiry_date, status, notes,
                  insurance_company="", policy_number="", agency_company="",
                  vehicle_model="", vehicle_year="", excess_info="",
                  ncb_ncd="", excess_young="", excess_inexperienced="",
                  excess_unnamed="", excess_tppd="",
                  excess_parking="", excess_theft="",
                  excess_windscreen="", excess_authorised_repair=""):
    with get_session() as conn:
        result = conn.execute(text("""
            INSERT INTO policies
            (customer_id, license_plate, policy_type, coverage_amount, premium,
             start_date, expiry_date, status, notes, insurance_company, policy_number,
             agency_company, vehicle_model, vehicle_year, excess_info,
             ncb_ncd, excess_young, excess_inexperienced, excess_unnamed, excess_tppd,
             excess_parking, excess_theft, excess_windscreen, excess_authorised_repair)
            VALUES (:cid,:lp,:pt,:ca,:pr,:sd,:ed,:st,:nt,:ic,:pn,:ac,:vm,:vy,:ei,
                    :ncb,:ey,:exi,:eu,:etppd,:ep,:eth,:ew,:ear) RETURNING id
        """), {
            "cid": customer_id, "lp": license_plate, "pt": policy_type,
            "ca": coverage_amount, "pr": premium, "sd": start_date, "ed": expiry_date,
            "st": status, "nt": notes, "ic": insurance_company, "pn": policy_number,
            "ac": agency_company, "vm": vehicle_model, "vy": vehicle_year, "ei": excess_info,
            "ncb": ncb_ncd, "ey": excess_young, "exi": excess_inexperienced,
            "eu": excess_unnamed, "etppd": excess_tppd, "ep": excess_parking,
            "eth": excess_theft, "ew": excess_windscreen, "ear": excess_authorised_repair
        })
        pid = result.fetchone()[0]
        _log_activity(conn, 'create', 'policy', pid, f'新增保單: {license_plate}', f'保費: {premium}')
        conn.commit()
    return get_policy(pid)

def update_policy(pid, customer_id, license_plate, policy_type, coverage_amount,
                  premium, start_date, expiry_date, status, notes,
                  insurance_company="", policy_number="", agency_company="",
                  vehicle_model="", vehicle_year="", excess_info="",
                  ncb_ncd="", excess_young="", excess_inexperienced="",
                  excess_unnamed="", excess_tppd="",
                  excess_parking="", excess_theft="",
                  excess_windscreen="", excess_authorised_repair=""):
    with get_session() as conn:
        conn.execute(text("""
            UPDATE policies SET
                customer_id=:cid, license_plate=:lp, policy_type=:pt,
                coverage_amount=:ca, premium=:pr, start_date=:sd, expiry_date=:ed,
                status=:st, notes=:nt, updated_at=CURRENT_TIMESTAMP,
                insurance_company=:ic, policy_number=:pn, agency_company=:ac,
                vehicle_model=:vm, vehicle_year=:vy, excess_info=:ei,
                ncb_ncd=:ncb, excess_young=:ey, excess_inexperienced=:exi,
                excess_unnamed=:eu, excess_tppd=:etppd,
                excess_parking=:ep, excess_theft=:eth, excess_windscreen=:ew, excess_authorised_repair=:ear
            WHERE id=:pid
        """), {
            "cid": customer_id, "lp": license_plate, "pt": policy_type,
            "ca": coverage_amount, "pr": premium, "sd": start_date, "ed": expiry_date,
            "st": status, "nt": notes, "ic": insurance_company, "pn": policy_number,
            "ac": agency_company, "vm": vehicle_model, "vy": vehicle_year, "ei": excess_info,
            "ncb": ncb_ncd, "ey": excess_young, "exi": excess_inexperienced,
            "eu": excess_unnamed, "etppd": excess_tppd, "ep": excess_parking,
            "eth": excess_theft, "ew": excess_windscreen, "ear": excess_authorised_repair,
            "pid": pid
        })
        _log_activity(conn, 'update', 'policy', pid, f'更新保單: {license_plate}', f'狀態: {status}')
        conn.commit()
    return get_policy(pid)

def delete_policy(pid):
    with get_session() as conn:
        row = conn.execute(text("SELECT license_plate FROM policies WHERE id=:id"), {"id": pid}).fetchone()
        plate = row[0] if row else 'Unknown'
        conn.execute(text("DELETE FROM policies WHERE id=:id"), {"id": pid})
        _log_activity(conn, 'delete', 'policy', pid, f'刪除保單: {plate}')
        conn.commit()

def get_expiring_policies(days=30):
    from datetime import date, timedelta
    today = date.today()
    future = today + timedelta(days=days)
    with get_session() as conn:
        rows = conn.execute(text("""
            SELECT p.*, c.name as customer_name
            FROM policies p LEFT JOIN customers c ON p.customer_id=c.id
            WHERE p.expiry_date BETWEEN :today AND :future
              AND p.status='active'
            ORDER BY p.expiry_date ASC
        """), {"today": today.isoformat(), "future": future.isoformat()}).fetchall()
        return [row_to_dict(r) for r in rows]


# ── Coverages ───────────────────────────────────────────────────────────────
def get_coverages_by_policy(pid):
    with get_session() as conn:
        rows = conn.execute(text("SELECT * FROM coverages WHERE policy_id=:pid"), {"pid": pid}).fetchall()
        return [row_to_dict(r) for r in rows]

def create_coverage(policy_id, coverage_name, coverage_amount, premium, notes):
    with get_session() as conn:
        result = conn.execute(text("""
            INSERT INTO coverages (policy_id,coverage_name,coverage_amount,premium,notes)
            VALUES (:pid,:cn,:ca,:pr,:nt) RETURNING id
        """), {"pid": policy_id, "cn": coverage_name, "ca": coverage_amount, "pr": premium, "nt": notes})
        cid = result.fetchone()[0]
        conn.commit()
        return cid

def delete_coverage(cid):
    with get_session() as conn:
        conn.execute(text("DELETE FROM coverages WHERE id=:id"), {"id": cid})
        conn.commit()


# ── Renewals ───────────────────────────────────────────────────────────────
def get_all_renewals():
    with get_session() as conn:
        rows = conn.execute(text("""
            SELECT r.*, c.name as customer_name, c.phone as customer_phone,
                   op.license_plate as original_plate
            FROM renewals r
            LEFT JOIN customers c ON r.customer_id=c.id
            LEFT JOIN policies op ON r.original_policy_id=op.id
            ORDER BY r.renewal_date DESC
        """)).fetchall()
        return [row_to_dict(r) for r in rows]

def get_renewal(rid):
    with get_session() as conn:
        row = conn.execute(text("""
            SELECT r.*, c.name as customer_name, c.phone as customer_phone
            FROM renewals r LEFT JOIN customers c ON r.customer_id=c.id WHERE r.id=:rid
        """), {"rid": rid}).fetchone()
        return row_to_dict(row)

def create_renewal(original_policy_id, customer_id, license_plate,
                   insurance_company, policy_type, coverage_amount,
                   premium, effective_date, expiry_date, notes,
                   agent_person="", policy_number="", vehicle_model="", phone=""):
    with get_session() as conn:
        if original_policy_id:
            conn.execute(text(
                "UPDATE policies SET status='renewed',updated_at=CURRENT_TIMESTAMP WHERE id=:id"
            ), {"id": original_policy_id})
        result = conn.execute(text("""
            INSERT INTO policies (customer_id,license_plate,policy_type,coverage_amount,
             premium,start_date,expiry_date,status,notes)
            VALUES (:cid,:lp,:pt,:ca,:pr,:sd,:ed,'active',:nt) RETURNING id
        """), {
            "cid": customer_id, "lp": license_plate, "pt": policy_type, "ca": coverage_amount,
            "pr": premium, "sd": effective_date, "ed": expiry_date,
            "nt": f"[續保] {notes}" if notes else "[續保]"
        })
        new_policy_id = result.fetchone()[0]
        result2 = conn.execute(text("""
            INSERT INTO renewals
            (original_policy_id,new_policy_id,customer_id,license_plate,insurance_company,
             policy_type,coverage_amount,premium,effective_date,expiry_date,status,notes,
             agent_person,policy_number,vehicle_model,phone)
            VALUES (:opid,:npid,:cid,:lp,:ic,:pt,:ca,:pr,:sd,:ed,'pending',:nt,
                    :ap,:pn,:vm,:ph) RETURNING id
        """), {
            "opid": original_policy_id, "npid": new_policy_id, "cid": customer_id,
            "lp": license_plate, "ic": insurance_company, "pt": policy_type,
            "ca": coverage_amount, "pr": premium, "sd": effective_date, "ed": expiry_date,
            "nt": notes, "ap": agent_person, "pn": policy_number,
            "vm": vehicle_model, "ph": phone
        })
        rid = result2.fetchone()[0]
        conn.commit()
    return get_renewal(rid)

def update_renewal(rid, original_policy_id=0, customer_id=0, license_plate="", insurance_company="",
                   policy_type="", coverage_amount=0, premium=0, effective_date="", expiry_date="",
                   notes="", agent_person="", policy_number="", vehicle_model="", phone="", status="pending"):
    with get_session() as conn:
        conn.execute(text("""
            UPDATE renewals SET
                original_policy_id=:opid, customer_id=:cid, license_plate=:lp,
                insurance_company=:ic, policy_type=:pt, coverage_amount=:ca, premium=:pr,
                effective_date=:sd, expiry_date=:ed, notes=:nt,
                agent_person=:ap, policy_number=:pn, vehicle_model=:vm, phone=:ph, status=:st
            WHERE id=:rid
        """), {
            "opid": original_policy_id, "cid": customer_id, "lp": license_plate,
            "ic": insurance_company, "pt": policy_type, "ca": coverage_amount, "pr": premium,
            "sd": effective_date, "ed": expiry_date, "nt": notes,
            "ap": agent_person, "pn": policy_number, "vm": vehicle_model, "ph": phone, "st": status,
            "rid": rid
        })
        conn.commit()
    return get_renewal(rid)

def delete_renewal(rid):
    with get_session() as conn:
        conn.execute(text("DELETE FROM renewals WHERE id=:id"), {"id": rid})
        conn.commit()

def get_pending_renewals():
    with get_session() as conn:
        rows = conn.execute(text("""
            SELECT r.*, c.name as customer_name, c.phone as customer_phone
            FROM renewals r LEFT JOIN customers c ON r.customer_id=c.id
            WHERE r.status='pending' ORDER BY r.renewal_date DESC
        """)).fetchall()
        return [row_to_dict(r) for r in rows]
