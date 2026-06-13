"""FastAPI main app for Insurance CRM Web."""
import os
import json
import time
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
import httpx

app = FastAPI(title="保險客戶管理系統")

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

STATIC_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
from jinja2 import Environment, FileSystemLoader, select_autoescape
_jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(),
    auto_reload=True,
    cache_size=0,
)
from starlette.templating import Jinja2Templates
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# ── Init ─────────────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "smartquote-crm"}

@app.on_event("startup")
def startup():
    try:
        database.init_db()
    except Exception as e:
        print(f"[startup] init_db error: {e}")
    try:
        database.init_sample_data()
    except Exception as e:
        print(f"[startup] init_sample_data error: {e}")
    if os.environ.get("ICLOUD_BACKUP_ENABLED", "0") == "1":
        icloud_backup.start_auto_backup(6)
    # Start Lark WebSocket long-connection client
    if os.environ.get("LARK_WS_ENABLED", "1") != "0":
        import lark_webhook
        lark_webhook.start_lark_ws_background()

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
        # Use clean Jinja2 env to avoid Python 3.14 cache bug
        tmpl = _jinja_env.get_template("dashboard.html")
        html = tmpl.render(
            stats=stats,
            expiring=expiring,
            recent_customers=recent_customers,
            backup_status=backup_status,
            recent_activity=recent_activity,
        )
        return HTMLResponse(html)
    except Exception as e:
        import traceback
        return HTMLResponse(f"<pre>Template Error:\n{traceback.format_exc()}\n\nContext:\nstats={stats}\nexpiring={expiring}\n</pre>", status_code=500)

# Helper: use clean Jinja2 env to avoid Python 3.14 + Starlette cache bug
def render_page(template_name, **context):
    tmpl = _jinja_env.get_template(template_name)
    return HTMLResponse(tmpl.render(**context))

@app.get("/customers", response_class=HTMLResponse)
def customers_page(request: Request):
    return render_page("customers.html", customers=database.get_all_customers(include_potential=False))

@app.get("/policies", response_class=HTMLResponse)
def policies_page(request: Request):
    return render_page("policies.html",
        policies=database.get_all_policies(include_renewal=False),
        customers=database.get_all_customers(include_potential=False))

@app.get("/lapsed", response_class=HTMLResponse)
def lapsed_policies_page(request: Request):
    return render_page("lapsed_policies.html",
        policies=database.get_lapsed_policies(),
        customers=database.get_all_customers(include_potential=True))

@app.get("/coverages", response_class=HTMLResponse)
def coverages_page(request: Request):
    return render_page("coverages.html",
        policies=database.get_all_policies(include_renewal=False))

@app.get("/reports", response_class=HTMLResponse)
def reports_page(request: Request):
    try:
        monthly = database.get_monthly_stats()
    except Exception:
        monthly = []
    try:
        type_stats = database.get_type_stats()
    except Exception:
        type_stats = []
    try:
        status_stats = database.get_status_stats()
    except Exception:
        status_stats = []
    try:
        pending_stats = database.get_pending_renewal_stats()
    except Exception:
        pending_stats = {"pending": 0}
    return render_page("reports.html",
        monthly=monthly,
        type_stats=type_stats,
        status_stats=status_stats,
        pending_stats=pending_stats)

@app.get("/export", response_class=HTMLResponse)
def export_page(request: Request):
    return render_page("export.html", backup_status=icloud_backup.get_status())

@app.get("/renewals", response_class=HTMLResponse)
def renewals_page(request: Request):
    return render_page("renewals.html",
        renewals=database.get_all_renewals(),
        customers=database.get_all_customers_for_renewals(),
        policies=database.get_all_policies(include_renewal=True))

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

@app.get("/debug-reports")
def debug_reports():
    import traceback
    results = {}
    for name, fn in [
        ("monthly", lambda: database.get_monthly_stats()),
        ("type_stats", lambda: database.get_type_stats()),
        ("status_stats", lambda: database.get_status_stats()),
        ("pending_stats", lambda: database.get_pending_renewal_stats()),
    ]:
        try:
            results[name] = {"ok": True, "data": fn()}
        except Exception as e:
            results[name] = {"ok": False, "error": str(e), "trace": traceback.format_exc()}
    return results

@app.get("/debug-env")
def debug_env():
    import os
    url = os.environ.get("DATABASE_URL", "")
    return {
        "url_repr": repr(url),
        "starts_pg": url.startswith("postgresql"),
        "first_30": url[:30] if url else "EMPTY",
    }

# ── Lark PDF Bot Webhook ───────────────────────────────────────────────────────
import lark_webhook
from fastapi import Query
import tempfile

# Debug: store last 20 webhook requests
_webhook_log = []

@app.get("/debug/webhook-log")
def debug_webhook_log():
    return {"count": len(_webhook_log), "logs": _webhook_log[-20:]}

@app.get("/webhook/lark")
async def lark_webhook_verify(request: Request, challenge: str = Query(None)):
    """Lark Webhook URL 驗證"""
    print(f"[LARK WEBHOOK] GET verification, challenge={challenge}")
    return {"challenge": challenge}

@app.post("/webhook/lark")
async def lark_webhook_event(request: Request):
    """Lark 消息 Webhook 端點（支持 v1 和 v2 格式）"""
    from fastapi.responses import JSONResponse
    try:
        body = await request.json()
    except:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Support both v1 and v2 event formats
    event_type = body.get("event_type", "") or body.get("header", {}).get("event_type", "")
    event_data = body.get("event", {})

    # Handle Lark v2 challenge verification
    challenge = body.get("challenge", "")
    if challenge and body.get("type") == "url_verification":
        return JSONResponse({"challenge": challenge})

    print(f"[LARK WEBHOOK] Event: {event_type}")
    print(f"[LARK WEBHOOK] Body: {json.dumps(body, ensure_ascii=False)[:500]}")

    # Debug log
    _webhook_log.append({
        "ts": time.strftime("%H:%M:%S"),
        "event_type": event_type,
        "schema": body.get("schema", ""),
        "has_event": bool(event_data),
        "body_preview": json.dumps(body, ensure_ascii=False)[:500],
    })
    if len(_webhook_log) > 50:
        _webhook_log.pop(0)

    if event_type == "im.message.receive_v1":
        return await lark_handle_message(event_data)

    return JSONResponse({"code": 0, "msg": "ok"})

async def lark_handle_message(event):
    """處理收到的 Lark 消息"""
    from fastapi.responses import JSONResponse
    import tempfile, os

    message = event.get("message", {})
    msg_type = message.get("msg_type", "")
    msg_id = message.get("message_id", "")

    sender = event.get("sender", {})
    sender_id = sender.get("sender_id", {})
    open_id = sender_id.get("open_id", "")

    try:
        content = json.loads(message.get("content", "{}"))
    except:
        content = {}

    print(f"[LARK] msg_type={msg_type}, msg_id={msg_id}, open_id={open_id}")
    print(f"[LARK] content={json.dumps(content, ensure_ascii=False)[:300]}")

    def reply(text):
        lark_webhook.send_lark_text_with_receive_id_type(open_id, "open_id", text)

    # ── File message (PDF) ──
    if msg_type == "file":
        file_key = content.get("file_key", "")
        file_name = content.get("file_name", "")
        print(f"[LARK] file_key={file_key}, file_name={file_name}")

        if not file_key:
            reply("❌ 收到文件但无法获取文件标识，请重新发送。")
            return JSONResponse({"code": 0, "msg": "no file_key"})

        # Download file from Lark
        try:
            token = lark_webhook.get_tenant_token()
            resp = httpx.get(
                f"{lark_webhook.LARK_API_BASE}/im/v1/messages/{msg_id}/resources/{file_key}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=60
            )
            print(f"[LARK] File download status: {resp.status_code}, size={len(resp.content)}")
        except Exception as e:
            print(f"[LARK] File download error: {e}")
            reply(f"❌ 下载文件失败: {e}")
            return JSONResponse({"code": 1, "msg": str(e)})

        if resp.status_code != 200:
            err_detail = resp.text[:200] if resp.text else f"HTTP {resp.status_code}"
            print(f"[LARK] File download failed: {err_detail}")
            reply(f"❌ 文件获取失败 ({resp.status_code})。请确认应用有 im:resource 权限。")
            return JSONResponse({"code": 1, "msg": err_detail})

        # Save as PDF
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(resp.content)
            pdf_path = f.name

        print(f"[LARK] PDF saved: {pdf_path}, size={len(resp.content)}")
        reply(f"📥 已收到文件「{file_name or 'PDF'}」，正在解析...")

        # Process PDF
        try:
            results = lark_webhook.process_pdf(pdf_path)
            print(f"[LARK] Parsed {len(results)} records from PDF")

            if not any(r.get("name") or r.get("license_plate") or r.get("policy_number") for r in results):
                reply(
                    "📋 已收到 PDF，但无法自动识别内容。\n\n"
                    "请在 CRM 系统中手动新增记录。\n"
                    f"🔗 https://smartquote-crm.onrender.com/renewals"
                )
                return JSONResponse({"code": 0, "msg": "No identifiable data"})

            saved_records = []
            for info in results:
                result = lark_webhook.save_to_crm(info)
                if result.get("ok"):
                    saved_records.append(
                        f"✅ {result['customer']} | {result.get('license_plate','N/A')} | "
                        f"{result.get('policy_type','N/A')} | HKD {result.get('premium',0):,.0f}"
                    )
                else:
                    saved_records.append(f"❌ {info.get('name','未知')}: {result.get('error','失敗')}")

            reply_text = "📋 **PDF 自动入库结果**\n\n" + "\n".join(saved_records)
            reply_text += "\n\n请在 CRM 系统中确认资料是否正确。"
            reply_text += f"\n\n🔗 https://smartquote-crm.onrender.com/renewals"

            reply(reply_text)

        except Exception as e:
            import traceback
            print(f"[LARK] PDF processing error: {e}\n{traceback.format_exc()}")
            reply(f"❌ 处理 PDF 时发生错误: {e}")
        finally:
            os.unlink(pdf_path)

    # ── Text message ──
    elif msg_type == "text":
        text = content.get("text", "").strip().lower()

        if text in ["help", "幫助", "帮助", "/help", "?"]:
            help_text = (
                "📋 **PDF保单Bot 使用说明**\n\n"
                "直接发送 PDF 文件给我，我会自动：\n"
                "1️⃣ 解析 PDF 内容\n"
                "2️⃣ 识别客户姓名、车牌、保费等\n"
                "3️⃣ 自动存入 CRM 系统\n\n"
                "支持：续保通知书、保单文件、港车北上文件"
            )
            reply(help_text)
        else:
            reply(
                "😊 请直接发送 PDF 文件给我处理\n"
                "输入「帮助」查看使用说明"
            )

    # ── Unhandled message type ──
    else:
        print(f"[LARK] Unhandled msg_type: {msg_type}")
        reply(f"收到消息类型: {msg_type}，请直接发送 PDF 文件。")

    return JSONResponse({"code": 0, "msg": "ok"})
