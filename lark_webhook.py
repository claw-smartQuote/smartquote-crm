"""
Feishu/Lark PDF Bot - Webhook Handler
接收 Lark 發送的消息和文件，自動解析 PDF 並入庫至 CRM
"""
import os
import json
import tempfile
import subprocess
import re
from datetime import datetime
import httpx
import urllib.request
import urllib.parse

# ── Config ────────────────────────────────────────────────────────────────────
LARK_API_BASE = "https://open.larksuite.com/open-apis"
LARK_APP_ID = os.environ.get("LARK_APP_ID", "cli_aaa0809c34389e18")
LARK_APP_SECRET = os.environ.get("LARK_APP_SECRET", "r0az2k1jETYxHF2DxiR0MbcukUkKQZFU")
CRM_URL = os.environ.get("CRM_URL", "https://smartquote-crm.onrender.com")

# ── Lark Token Cache ──────────────────────────────────────────────────────────
_tenant_token = {"token": None, "expires_at": 0}

def get_tenant_token():
    now = datetime.now().timestamp()
    if _tenant_token["token"] and _tenant_token["expires_at"] > now:
        return _tenant_token["token"]

    resp = httpx.post(
        f"{LARK_API_BASE}/auth/v3/tenant_access_token/internal",
        json={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET},
        timeout=30
    )
    data = resp.json()
    if data.get("code") != 0:
        raise Exception(f"Lark auth failed: {data}")

    _tenant_token["token"] = data["tenant_access_token"]
    _tenant_token["expires_at"] = now + data.get("expire", 7200) - 120
    print(f"[LARK] Token refreshed, expires in {data.get('expire', 7200)}s")
    return _tenant_token["token"]

# ── CRM API Helpers ────────────────────────────────────────────────────────────
def crm_api_post(endpoint, fields):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(
        f"{CRM_URL}{endpoint}",
        data=data,
        method="POST"
    )
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"[CRM] POST {endpoint} failed: {e}")
        return {"error": str(e)}

def crm_api_get(endpoint):
    req = urllib.request.Request(f"{CRM_URL}{endpoint}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"[CRM] GET {endpoint} failed: {e}")
        return []

def crm_find_customer_by_name(name):
    customers = crm_api_get("/api/customers?include_potential=true")
    if isinstance(customers, list):
        for c in customers:
            if name in c.get("name", ""):
                return c
    return None

def crm_create_customer(name, phone="", email=""):
    return crm_api_post("/api/customers", {"name": name, "phone": phone, "email": email})

def crm_create_renewal(
    customer_id, license_plate, insurance_company,
    policy_type, coverage_amount, premium,
    effective_date, expiry_date, notes,
    policy_number, vehicle_model, phone=""
):
    return crm_api_post("/api/renewals", {
        "customer_id": customer_id,
        "license_plate": license_plate,
        "insurance_company": insurance_company,
        "policy_type": policy_type,
        "coverage_amount": coverage_amount,
        "premium": premium,
        "effective_date": effective_date,
        "expiry_date": expiry_date,
        "notes": notes,
        "policy_number": policy_number,
        "vehicle_model": vehicle_model,
        "phone": phone,
        "status": "pending"
    })

# ── PDF Processing ──────────────────────────────────────────────────────────────
def extract_pdf_text(pdf_path):
    """Extract text from PDF using pdftotext"""
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return result.stdout
    except Exception as e:
        print(f"[PDF] pdftotext failed: {e}")
    return ""

def get_pdf_page_count(pdf_path):
    """Get number of pages in PDF"""
    try:
        result = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.split("\n"):
            if "Pages:" in line:
                return int(line.split(":")[-1].strip())
    except:
        pass
    return 1

def parse_date(date_str):
    """Convert date string to YYYY-MM-DD"""
    if not date_str:
        return ""
    date_str = date_str.strip()
    formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
        "%Y/%m/%d", "%Y-%m-%d",
        "%d %B %Y", "%B %d, %Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except:
            pass
    return date_str

def parse_renewal_text(text, page_num=1):
    """Parse renewal notice text to extract policy info"""
    info = {
        "name": "", "phone": "", "license_plate": "",
        "policy_type": "", "premium": 0, "coverage_amount": 0,
        "effective_date": "", "expiry_date": "",
        "policy_number": "", "vehicle_model": "",
        "insurance_company": "永誠保險",
        "notes": ""
    }

    if not text.strip():
        return info

    # Extract name
    name_patterns = [
        r"客戶姓名[：:]\s*([^\n]{2,20})",
        r"投保人[：:]\s*([^\n]{2,20})",
        r"Policy\s*Holder[：:]\s*([^\n]{2,20})",
        r"Name[：:]\s*([^\n]{2,20})",
    ]
    for pat in name_patterns:
        m = re.search(pat, text)
        if m:
            info["name"] = m.group(1).strip()
            break

    # Extract phone
    phone_patterns = [
        r"電話[：:]\s*([0-9\s\-]{8,15})",
        r"Tel[：:]\s*([0-9\s\-]{8,15})",
        r"Phone[：:]\s*([0-9\s\-]{8,15})",
        r"(?:9|8|5|6)\d[\s\-]?\d{4}[\s\-]?\d{4}",
    ]
    for pat in phone_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            info["phone"] = m.group(0).strip()
            break

    # Extract license plate
    plate_patterns = [
        r"[粵粤]?\s*[A-Z]{1,3}[\s\-]?[0-9]{1,4}[\s\-]?[A-Z0-9]*",
        r"車牌[：:]*\s*([A-Z0-9]{2,10})",
        r"Registration[：:]*\s*([A-Z0-9]{2,10})",
        r"\b([A-Z]{2}\s*[0-9]{4})\b",
    ]
    for pat in plate_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            plate = re.sub(r"\s+", "", m.group(0).upper())
            if len(plate) >= 4:
                info["license_plate"] = plate
                break

    # Extract policy number
    policy_patterns = [
        r"保單號碼[：:]\s*([A-Z0-9\-]{4,25})",
        r"Policy\s*No[.:\s]*([A-Z0-9\-]{4,25})",
        r"POLICY\s*NO[.:\s]*([A-Z0-9\-]{4,25})",
        r"\b(POL[A-Z0-9\-]{4,})\b",
        r"\b(RN[-_][A-Z0-9\-]{4,})\b",
    ]
    for pat in policy_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            info["policy_number"] = m.group(1).strip().upper()
            break

    # Extract premium
    premium_patterns = [
        r"(?:保費|Premium)[^\$]*HK\$\s*([0-9,]+\.?\d*)",
        r"(?:Total|總計)[^\$]*HK\$\s*([0-9,]+\.?\d*)",
    ]
    for pat in premium_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                info["premium"] = float(m.group(1).replace(",", ""))
                break
            except:
                pass

    # Extract sum insured
    si_patterns = [
        r"Sum\s*Insured[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
        r"Insured\s*Amount[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
        r"投保金額[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
        r"保額[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
    ]
    for pat in si_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                info["coverage_amount"] = float(m.group(1).replace(",", ""))
                break
            except:
                pass

    # Extract dates
    date_patterns = [
        (r"生效[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
        (r"Effect\s*From[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
        (r"起保[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
        (r"到期[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
        (r"Expiry\s*Date[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
        (r"屆滿[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
    ]
    for pat, field in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            info[field] = parse_date(m.group(1))

    # Extract vehicle model
    vehicle_patterns = [
        r"車型[：:]\s*([^\n]{3,40})",
        r"車款[：:]\s*([^\n]{3,40})",
        r"Vehicle\s*Model[：:]\s*([^\n]{3,40})",
        r"(Tesla\s+Model\s+\w+|BYD[\s\-]\w+|Mercedes[\s\-]?BENZ[^\n]{0,20}|BMW[^\n]{0,15}|Toyota[^\n]{0,15}|Honda[^\n]{0,15})",
    ]
    for pat in vehicle_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            info["vehicle_model"] = m.group(1).strip()
            break

    # Determine policy type
    text_lower = text.lower()
    if "comprehensive" in text_lower or "全保" in text:
        info["policy_type"] = "全保"
    elif "third party" in text_lower or "第三者" in text:
        info["policy_type"] = "第三者責任"
        if info["coverage_amount"] == 0:
            info["coverage_amount"] = 2000000
    elif "港車北上" in text:
        info["policy_type"] = "港車北上"
    elif "兩地牌" in text:
        info["policy_type"] = "兩地牌"
    else:
        info["policy_type"] = "其他"

    # Extract NCB
    ncb_list = []
    for pat in [r"NCB\s*[：:]\s*(\d+)%", r"NCD\s*[：:]\s*(\d+)%", r"無索償折扣[：:]\s*(\d+)%"]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            ncb_list.append(f"NCB: {m.group(1)}%")

    # Extract excesses
    excess_map = [
        ("TPPD", r"TPPD[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
        ("OD", r"(?:OD|Self)[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
        ("THEFT", r"THEFT[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
        ("YIU", r"YIU[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
        ("PARKING", r"PARKING[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
    ]
    excess_list = []
    for key, pat in excess_map:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                val = float(m.group(1).replace(",", ""))
                excess_list.append(f"{key}: HK${val:,.0f}")
            except:
                pass

    # Build notes
    notes_parts = []
    if ncb_list:
        notes_parts.append(" | ".join(ncb_list))
    if excess_list:
        notes_parts.append(" | ".join(excess_list))
    if info["policy_number"]:
        notes_parts.append(f"Policy: {info['policy_number']}")
    if info["vehicle_model"]:
        notes_parts.append(f"Model: {info['vehicle_model']}")
    info["notes"] = " | ".join(notes_parts)

    return info

def process_pdf(pdf_path):
    """Process PDF and return list of parsed records"""
    text = extract_pdf_text(pdf_path)
    page_count = get_pdf_page_count(pdf_path)

    results = []

    if text.strip():
        pages = re.split(r"\f|(?=\w+\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", text)
        for i, page_text in enumerate(pages[:page_count]):
            if page_text.strip():
                info = parse_renewal_text(page_text, i+1)
                if info["name"] or info["license_plate"] or info["policy_number"]:
                    results.append(info)

    if not results:
        results.append(parse_renewal_text("", 1))

    return results

# ── Save to CRM ────────────────────────────────────────────────────────────────
def save_to_crm(info):
    """Save parsed info to CRM, return result dict"""
    if not info.get("name") and not info.get("license_plate") and not info.get("policy_number"):
        return {"error": "無法識別任何資料"}

    name = info.get("name") or "未知客戶"
    customer = crm_find_customer_by_name(name)

    if not customer:
        result = crm_create_customer(name)
        if "error" in result:
            return {"error": f"建立客戶失敗: {result['error']}"}
        customer = crm_find_customer_by_name(name)
        if not customer:
            return {"error": "客戶建立後找不到"}

    cid = customer["id"]

    result = crm_create_renewal(
        customer_id=cid,
        license_plate=info.get("license_plate", ""),
        insurance_company=info.get("insurance_company", "永誠保險"),
        policy_type=info.get("policy_type", "其他"),
        coverage_amount=info.get("coverage_amount", 0),
        premium=info.get("premium", 0),
        effective_date=info.get("effective_date", ""),
        expiry_date=info.get("expiry_date", ""),
        notes=info.get("notes", ""),
        policy_number=info.get("policy_number", ""),
        vehicle_model=info.get("vehicle_model", ""),
        phone=info.get("phone", "")
    )

    if "error" in result:
        return {"error": f"建立續保記錄失敗: {result['error']}"}

    return {
        "ok": True,
        "customer": customer["name"],
        "customer_id": cid,
        "policy_type": info.get("policy_type"),
        "license_plate": info.get("license_plate"),
        "premium": info.get("premium"),
    }

# ── Lark Message Sending ──────────────────────────────────────────────────────
def lark_post(path, json_data=None):
    token = get_tenant_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = httpx.post(
        f"{LARK_API_BASE}{path}",
        headers=headers,
        json=json_data,
        timeout=60
    )
    return resp.json()

def send_lark_text(receive_id, receive_id_type, text):
    """Send text message to Lark user"""
    return lark_post("/im/v1/messages", {
        "receive_id": receive_id,
        "msg_type": "text",
        "content": json.dumps({"text": text})
    })

def send_lark_text_with_receive_id_type(receive_id, receive_id_type, text):
    """Send text message with explicit receive_id_type"""
    token = get_tenant_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = httpx.post(
        f"{LARK_API_BASE}/im/v1/messages?receive_id_type={receive_id_type}",
        headers=headers,
        json={
            "receive_id": receive_id,
            "msg_type": "text",
            "content": json.dumps({"text": text})
        },
        timeout=60
    )
    return resp.json()


# ── Lark WebSocket Long-Connection Client ──────────────────────────────────────
import asyncio, threading, websockets, traceback, requests

_ws_loop = None
_ws_thread = None

# Lark WS endpoint (SDK uses POST /callback/ws/endpoint)
_LARK_WS_ENDPOINT = "/callback/ws/endpoint"
_LARK_WS_DOMAIN = "https://open.larksuite.com"

async def _lark_ws_reader():
    """Connect to Lark WebSocket and process incoming events."""
    import tempfile, os as _os

    while True:
        try:
            # Step 1: Get WebSocket URL from Lark
            resp = requests.post(
                _LARK_WS_DOMAIN + _LARK_WS_ENDPOINT,
                headers={"Locale": "zh", "User-Agent": "lark-oapi-python/2.0"},
                json={"AppID": LARK_APP_ID, "AppSecret": LARK_APP_SECRET},
                timeout=30
            )
            data = resp.json()
            if data.get("code") != 0:
                print(f"[LARK WS] Get URL failed: {data.get('msg')}")
                await asyncio.sleep(30)
                continue

            ws_url = data.get("data", {}).get("URL", "")
            if not ws_url:
                print("[LARK WS] No URL in response")
                await asyncio.sleep(30)
                continue

            print(f"[LARK WS] Got URL: {ws_url[:80]}...")

            # Step 2: Connect WebSocket
            async with websockets.connect(ws_url, ping_interval=20, ping_timeout=15) as ws:
                print("[LARK WS] ✓ Connected to Lark WebSocket")

                # Step 3: Read + handle protobuf messages
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=60)
                        _handle_ws_frame(raw)
                    except asyncio.TimeoutError:
                        try:
                            await ws.ping()
                        except:
                            break
                    except Exception as e:
                        print(f"[LARK WS] Read error: {e}")
                        break

        except Exception as e:
            print(f"[LARK WS] Connection error: {e}, retrying in 15s...")
            traceback.print_exc()
            await asyncio.sleep(15)


def _handle_ws_frame(frame_bytes):
    """Parse a Lark protobuf frame and dispatch to handler."""
    try:
        from lark_oapi.ws.pb.pbbp2_pb2 import Frame
        from lark_oapi.ws.enum import FrameType, MessageType

        frame = Frame()
        frame.ParseFromString(frame_bytes)
        ft = FrameType(frame.method)

        if ft == FrameType.CONTROL:
            # PING/PONG - just log
            return

        if ft == FrameType.DATA:
            headers = frame.headers
            type_key = None
            for h in headers:
                if h.key == "type":
                    type_key = h.value
                    break

            msg_type = MessageType(type_key) if type_key else None
            if msg_type == MessageType.EVENT:
                payload = frame.payload.decode("utf-8") if frame.payload else "{}"
                event = json.loads(payload)
                print(f"[LARK WS] Event: {json.dumps(event, ensure_ascii=False)[:300]}")
                _handle_lark_ws_event(event)
            return

    except Exception as e:
        print(f"[LARK WS] Frame parse error: {e}")
        traceback.print_exc()


def _handle_lark_ws_event(event):
    """Handle a Lark WebSocket event - dispatch to the right handler."""
    try:
        event_type = event.get("event_type", "") or event.get("header", {}).get("event_type", "")
        event_data = event.get("event", {})

        # URL verification challenge
        challenge = event.get("challenge", "")
        if challenge and event.get("type") == "url_verification":
            print(f"[LARK WS] Challenge: {challenge}")
            return

        print(f"[LARK WS] Event: {event_type}")

        if event_type == "im.message.receive_v1":
            _handle_lark_message_ws(event_data)
        else:
            print(f"[LARK WS] Unhandled event type: {event_type}")

    except Exception as e:
        print(f"[LARK WS] Handler error: {e}")
        traceback.print_exc()


def _handle_lark_message_ws(event_data):
    """Handle im.message.receive_v1 from WebSocket."""
    import tempfile, os as _os

    message = event_data.get("message", {})
    msg_type = message.get("msg_type", "")
    msg_id = message.get("message_id", "")
    sender = event_data.get("sender", {})
    sender_id = sender.get("sender_id", {})
    open_id = sender_id.get("open_id", "")

    try:
        content = json.loads(message.get("content", "{}"))
    except:
        content = {}

    print(f"[LARK WS] msg_type={msg_type}, msg_id={msg_id}, open_id={open_id}")

    def reply(text):
        r = send_lark_text_with_receive_id_type(open_id, "open_id", text)
        print(f"[LARK WS] Reply result: {r}")

    # ── File message (PDF) ──
    if msg_type == "file":
        file_key = content.get("file_key", "")
        file_name = content.get("file_name", "")
        print(f"[LARK WS] file_key={file_key}, file_name={file_name}")

        if not file_key:
            reply("❌ 收到文件但无法获取文件标识，请重新发送。")
            return

        # Download file
        try:
            token = get_tenant_token()
            resp = httpx.get(
                f"{LARK_API_BASE}/im/v1/messages/{msg_id}/resources/{file_key}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=60
            )
            print(f"[LARK WS] File download: {resp.status_code}, size={len(resp.content)}")
        except Exception as e:
            print(f"[LARK WS] File download error: {e}")
            reply(f"❌ 下载文件失败: {e}")
            return

        if resp.status_code != 200:
            reply(f"❌ 文件获取失败 ({resp.status_code})。请确认应用有 im:resource 权限。")
            return

        # Save as PDF
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(resp.content)
            pdf_path = f.name

        print(f"[LARK WS] PDF saved: {pdf_path}")
        reply(f"📥 已收到文件「{file_name or 'PDF'}」，正在解析...")

        # Process PDF
        try:
            results = process_pdf(pdf_path)
            print(f"[LARK WS] Parsed {len(results)} records from PDF")

            if not any(r.get("name") or r.get("license_plate") or r.get("policy_number") for r in results):
                reply(
                    "📋 已收到 PDF，但无法自动识别内容。\n\n"
                    "请在 CRM 系统中手动新增记录。\n"
                    f"🔗 {CRM_URL}/renewals"
                )
                _os.unlink(pdf_path)
                return

            saved_count = 0
            for info in results:
                result = save_to_crm(info)
                if result.get("ok"):
                    saved_count += 1
                    print(f"[LARK WS] Saved: {result}")

            if saved_count > 0:
                reply(
                    f"✅ 成功解析並存入 CRM（共 {saved_count} 筆記錄）！\n"
                    f"📊 查看續保列表：{CRM_URL}/renewals"
                )
            else:
                reply("⚠️ 未能自動識別有效資料，請手動新增。")

        except Exception as e:
            print(f"[LARK WS] Process error: {e}")
            traceback.print_exc()
            reply(f"❌ 解析失敗: {e}")
        finally:
            try:
                _os.unlink(pdf_path)
            except:
                pass
        return

    # ── Text message ──
    if msg_type == "text":
        text_content = content.get("text", "").strip()
        print(f"[LARK WS] Text: {text_content}")

        if not text_content:
            return

        # Quick commands
        if text_content in ["/help", "幫助", "help"]:
            reply(
                "📋 PDF BOT 使用說明：\n\n"
                "• 發送 PDF 文件給我 → 自動解析並入庫\n"
                "• 發送任何續保通知書 PDF 即可\n"
                "• 等待解析完成後回覆結果\n\n"
                f"🌐 CRM 系統：{CRM_URL}"
            )
            return

        reply(
            f"收到你的消息：「{text_content[:50]}」\n\n"
            f"📎 請發送續保通知書 PDF 文件給我，我會自動幫你入庫！\n"
            f"🌐 或直接登入：{CRM_URL}/renewals"
        )
        return

    # Other message types
    reply(f"收到「{msg_type}」類型的消息，請發送 PDF 文件。")


def start_lark_ws_background():
    """Start the Lark WebSocket client in a background thread."""
    global _ws_loop, _ws_thread
    if _ws_thread and _ws_thread.is_alive():
        print("[LARK WS] Already running")
        return

    def run_loop():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        _ws_loop = loop
        print("[LARK WS] Starting WebSocket client...")
        loop.run_until_complete(_lark_ws_reader())

    _ws_thread = threading.Thread(target=run_loop, daemon=True, name="LarkWS")
    _ws_thread.start()
    print("[LARK WS] Background thread started")
