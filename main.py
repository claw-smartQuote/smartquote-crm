"""FastAPI main app for Insurance CRM Web."""
import os
from pathlib import Path
from datetime import date
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import database
import icloud_backup

app = FastAPI(title="保險客戶管理系統")

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

STATIC_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# ── Init ─────────────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "smartquote-crm"}

@app.on_event("startup")
def startup():
    database.init_db()
    database.init_sample_data()
    if os.environ.get("ICLOUD_BACKUP_ENABLED", "0") == "1":
        icloud_backup.start_auto_backup(6)

# ── Pages ───────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    try:
        stats = database.get_stats()
        expiring = database.get_expiring_policies(30)
        recent_customers = database.get_recent_customers(5)
        backup_status = icloud_backup.get_status()
        recent_activity = database.get_recent_activity(15)
    except Exception as e:
        import traceback, pathlib
        err = traceback.format_exc()
        pathlib.Path('/tmp/dash_error.log').write_text(err)
        return HTMLResponse(f"Dashboard Error (logged):\n{err}", status_code=500)
    try:
        return templates.TemplateResponse("dashboard.html", {
            "request": request,
            "stats": stats,
            "expiring": expiring,
            "recent_customers": recent_customers,
            "backup_status": backup_status,
            "recent_activity": recent_activity,
        })
    except Exception as e:
        import traceback
        return HTMLResponse(f"<pre>Template Error:\n{traceback.format_exc()}\n\nContext:\nstats={stats}\nexpiring={expiring}\n</pre>", status_code=500)

@app.get("/customers", response_class=HTMLResponse)
def customers_page(request: Request):
    return templates.TemplateResponse("customers.html", {
        "request": request,
        "customers": database.get_all_customers(include_potential=False),
    })

@app.get("/policies", response_class=HTMLResponse)
def policies_page(request: Request):
    return templates.TemplateResponse("policies.html", {
        "request": request,
        "policies": database.get_all_policies(include_renewal=False),
        "customers": database.get_all_customers(include_potential=False),
    })

@app.get("/lapsed", response_class=HTMLResponse)
def lapsed_policies_page(request: Request):
    return templates.TemplateResponse("lapsed_policies.html", {
        "request": request,
        "policies": database.get_lapsed_policies(),
        "customers": database.get_all_customers(include_potential=True),
    })

@app.get("/coverages", response_class=HTMLResponse)
def coverages_page(request: Request):
    return templates.TemplateResponse("coverages.html", {
        "request": request,
        "policies": database.get_all_policies(include_renewal=False),
    })

@app.get("/reports", response_class=HTMLResponse)
def reports_page(request: Request):
    return templates.TemplateResponse("reports.html", {
        "request": request,
        "monthly": database.get_monthly_stats(),
        "type_stats": database.get_type_stats(),
        "status_stats": database.get_status_stats(),
        "pending_stats": database.get_pending_renewal_stats(),
    })

@app.get("/api/reports/monthly")
def api_reports_monthly():
    return database.get_monthly_stats()

@app.get("/api/reports/type")
def api_reports_type():
    return database.get_type_stats()

@app.get("/api/reports/status")
def api_reports_status():
    return database.get_status_stats()

@app.get("/api/reports/pending-renewals")
def api_reports_pending_renewals():
    return database.get_pending_renewal_stats()

@app.get("/export", response_class=HTMLResponse)
def export_page(request: Request):
    return templates.TemplateResponse("export.html", {
        "request": request,
        "backup_status": icloud_backup.get_status(),
    })

@app.get("/renewals", response_class=HTMLResponse)
def renewals_page(request: Request):
    return templates.TemplateResponse("renewals.html", {
        "request": request,
        "renewals": database.get_all_renewals(),
        "customers": database.get_all_customers_for_renewals(),
        "policies": database.get_all_policies(include_renewal=True),
    })

# ── API: Customers ──────────────────────────────────────────────────────────
@app.get("/api/customers")
def api_customers(include_potential: bool = False):
    return database.get_all_customers(include_potential=include_potential)

@app.post("/api/customers")
async def api_create_customer(request: Request):
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data = await request.json()
        name = data.get("name")
        phone = data.get("phone", "")
        email = data.get("email", "")
    else:
        form = await request.form()
        name = form.get("name")
        phone = form.get("phone", "")
        email = form.get("email", "")
    if not name:
        return {"error": "name is required"}, 400
    return database.create_customer(name, phone, email)

@app.put("/api/customers/{cid}")
async def api_update_customer(request: Request, cid: int):
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data = await request.json()
        name = data.get("name")
        phone = data.get("phone", "")
        email = data.get("email", "")
    else:
        form = await request.form()
        name = form.get("name")
        phone = form.get("phone", "")
        email = form.get("email", "")
    if not name:
        return {"error": "name is required"}, 400
    return database.update_customer(cid, name, phone, email)

@app.delete("/api/customers/{cid}")
def api_delete_customer(cid: int):
    database.delete_customer(cid)
    return {"ok": True}

@app.get("/api/customers/{cid}/policies")
def api_customer_policies(cid: int):
    return database.get_policies_by_customer(cid)

# ── API: Policies ───────────────────────────────────────────────────────────
@app.get("/api/policies")
def api_policies(include_renewal: bool = False):
    return database.get_all_policies(include_renewal=include_renewal)

@app.get("/api/policies/{pid}")
def api_get_policy(pid: int):
    p = database.get_policy(pid)
    if not p:
        raise HTTPException(404, "Policy not found")
    return p

@app.post("/api/policies")
def api_create_policy(
    customer_id: int = Form(...),
    license_plate: str = Form(""),
    policy_type: str = Form(""),
    coverage_amount: float = Form(0),
    premium: float = Form(0),
    start_date: str = Form(""),
    expiry_date: str = Form(""),
    status: str = Form("active"),
    notes: str = Form(""),
    insurance_company: str = Form(""),
    policy_number: str = Form(""),
    agency_company: str = Form(""),
    vehicle_model: str = Form(""),
    vehicle_year: str = Form(""),
    excess_info: str = Form(""),
    ncb_ncd: str = Form(""),
    excess_young: str = Form(""),
    excess_inexperienced: str = Form(""),
    excess_unnamed: str = Form(""),
    excess_tppd: str = Form(""),
    excess_parking: str = Form(""),
    excess_theft: str = Form(""),
    excess_windscreen: str = Form(""),
    excess_authorised_repair: str = Form(""),
):
    return database.create_policy(
        customer_id, license_plate, policy_type, coverage_amount,
        premium, start_date, expiry_date, status, notes,
        insurance_company, policy_number, agency_company,
        vehicle_model, vehicle_year, excess_info,
        ncb_ncd, excess_young, excess_inexperienced,
        excess_unnamed, excess_tppd,
        excess_parking, excess_theft, excess_windscreen, excess_authorised_repair
    )

@app.put("/api/policies/{pid}")
def api_update_policy(
    pid: int,
    customer_id: int = Form(...),
    license_plate: str = Form(""),
    policy_type: str = Form(""),
    coverage_amount: float = Form(0),
    premium: float = Form(0),
    start_date: str = Form(""),
    expiry_date: str = Form(""),
    status: str = Form("active"),
    notes: str = Form(""),
    insurance_company: str = Form(""),
    policy_number: str = Form(""),
    agency_company: str = Form(""),
    vehicle_model: str = Form(""),
    vehicle_year: str = Form(""),
    excess_info: str = Form(""),
    ncb_ncd: str = Form(""),
    excess_young: str = Form(""),
    excess_inexperienced: str = Form(""),
    excess_unnamed: str = Form(""),
    excess_tppd: str = Form(""),
    excess_parking: str = Form(""),
    excess_theft: str = Form(""),
    excess_windscreen: str = Form(""),
    excess_authorised_repair: str = Form(""),
    customer_phone: str = Form(""),
    customer_email: str = Form(""),
    customer_address: str = Form(""),
):
    # Update customer info
    database.update_customer(customer_id, phone=customer_phone, email=customer_email, address=customer_address)
    return database.update_policy(
        pid, customer_id, license_plate, policy_type, coverage_amount,
        premium, start_date, expiry_date, status, notes,
        insurance_company, policy_number, agency_company,
        vehicle_model, vehicle_year, excess_info,
        ncb_ncd, excess_young, excess_inexperienced,
        excess_unnamed, excess_tppd,
        excess_parking, excess_theft, excess_windscreen, excess_authorised_repair
    )

@app.delete("/api/policies/{pid}")
def api_delete_policy(pid: int):
    database.delete_policy(pid)
    return {"ok": True}

@app.get("/api/policies/expiring/{days}")
def api_expiring(days: int = 30):
    return database.get_expiring_policies(days)

# ── API: Coverages ──────────────────────────────────────────────────────────
@app.get("/api/coverages/{pid}")
def api_coverages(pid: int):
    return database.get_coverages_by_policy(pid)

@app.post("/api/coverages")
def api_create_coverage(
    policy_id: int = Form(...),
    coverage_name: str = Form(""),
    coverage_amount: float = Form(0),
    premium: float = Form(0),
    notes: str = Form(""),
):
    cid = database.create_coverage(policy_id, coverage_name, coverage_amount, premium, notes)
    return {"id": cid}

@app.delete("/api/coverages/{cid}")
def api_delete_coverage(cid: int):
    database.delete_coverage(cid)
    return {"ok": True}

# ── API: Stats ───────────────────────────────────────────────────────────────
@app.get("/api/stats")
def api_stats():
    return database.get_stats()

# ── API: Export ──────────────────────────────────────────────────────────────
def make_excel(policies):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "保單列表"

    headers = ["客戶", "車牌", "險種", "保額", "保費", "起始日", "到期日", "狀態", "備註"]
    ws.append(headers)

    for p in policies:
        ws.append([
            p.get("customer_name", ""),
            p.get("license_plate", ""),
            p.get("policy_type", ""),
            p.get("coverage_amount", 0),
            p.get("premium", 0),
            p.get("start_date", ""),
            p.get("expiry_date", ""),
            p.get("status", ""),
            p.get("notes", ""),
        ])

    for col in ws.columns:
        for cell in col:
            cell.alignment = Alignment(horizontal="center", vertical="center")

    return wb

@app.post("/api/export/excel")
def api_export_excel():
    policies = database.get_all_policies()
    wb = make_excel(policies)
    path = BASE_DIR / "export.xlsx"
    wb.save(path)
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                       filename="保單列表.xlsx")

@app.post("/api/export/csv")
def api_export_csv():
    import csv, io
    policies = database.get_all_policies()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["客戶", "車牌", "險種", "保額", "保費", "起始日", "到期日", "狀態", "備註"])
    for p in policies:
        writer.writerow([
            p.get("customer_name", ""),
            p.get("license_plate", ""),
            p.get("policy_type", ""),
            p.get("coverage_amount", 0),
            p.get("premium", 0),
            p.get("start_date", ""),
            p.get("expiry_date", ""),
            p.get("status", ""),
            p.get("notes", ""),
        ])
    path = BASE_DIR / "export.csv"
    path.write_text(output.getvalue(), encoding="utf-8-sig")
    return FileResponse(path, media_type="text/csv", filename="保單列表.csv")

# ── API: Backup ──────────────────────────────────────────────────────────────
@app.get("/api/renewals")
def api_renewals():
    return database.get_all_renewals()

@app.post("/api/renewals")
def api_create_renewal(
    original_policy_id: int = Form(0),
    customer_id: int = Form(...),
    license_plate: str = Form(""),
    insurance_company: str = Form(""),
    policy_type: str = Form(""),
    coverage_amount: float = Form(0),
    premium: float = Form(0),
    effective_date: str = Form(""),
    expiry_date: str = Form(""),
    notes: str = Form(""),
    agent_person: str = Form(""),
    policy_number: str = Form(""),
    vehicle_model: str = Form(""),
    phone: str = Form(""),
):
    orig_pid = original_policy_id if original_policy_id > 0 else None
    return database.create_renewal(
        orig_pid, customer_id, license_plate,
        insurance_company, policy_type, coverage_amount,
        premium, effective_date, expiry_date, notes,
        agent_person, policy_number, vehicle_model, phone
    )

@app.put("/api/renewals/{rid}")
def api_update_renewal(
    rid: int,
    original_policy_id: int = Form(0),
    customer_id: int = Form(...),
    license_plate: str = Form(""),
    insurance_company: str = Form(""),
    policy_type: str = Form(""),
    coverage_amount: float = Form(0),
    premium: float = Form(0),
    effective_date: str = Form(""),
    expiry_date: str = Form(""),
    notes: str = Form(""),
    agent_person: str = Form(""),
    policy_number: str = Form(""),
    vehicle_model: str = Form(""),
    phone: str = Form(""),
    status: str = Form(...),
):
    return database.update_renewal(
        rid, original_policy_id, customer_id, license_plate, insurance_company,
        policy_type, coverage_amount, premium, effective_date, expiry_date,
        notes, agent_person, policy_number, vehicle_model, phone, status
    )

@app.delete("/api/renewals/{rid}")
def api_delete_renewal(rid: int):
    database.delete_renewal(rid)
    return {"ok": True}

@app.get("/debug-all")
def debug_all():
    import traceback
    results = {}
    for name, fn in [
        ("stats", lambda: database.get_stats()),
        ("expiring", lambda: database.get_expiring_policies(30)),
        ("recent_customers", lambda: database.get_recent_customers(5)),
        ("activity", lambda: database.get_recent_activity(15)),
    ]:
        try:
            results[name] = {"ok": True, "data": fn()}
        except Exception as e:
            results[name] = {"ok": False, "error": str(e), "trace": traceback.format_exc()}
    return results

@app.get("/api/backup/status")
def api_backup_status():
    return icloud_backup.get_status()

@app.post("/api/backup/now")
def api_backup_now():
    ok, result = icloud_backup.backup_now()
    return {"ok": ok, "result": result}
