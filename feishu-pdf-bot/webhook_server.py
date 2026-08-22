1|"""
2|Feishu PDF Bot - Webhook Server
3|接收 Lark 發送的消息和文件，自動解析 PDF 並入庫至 CRM
4|"""
5|import os
6|import sys
7|import json
8|import asyncio
9|import tempfile
10|import subprocess
11|import re
12|import shutil
13|from pathlib import Path
14|from datetime import datetime
15|from fastapi import FastAPI, Request, Query
16|from fastapi.responses import JSONResponse
17|import httpx
18|import urllib.request
19|import urllib.parse
20|
21|# ── Config ────────────────────────────────────────────────────────────────────
22|LARK_API_BASE = "https://open.larksuite.com/open-apis"
23|LARK_APP_ID = os.getenv("LARK_APP_ID", "cli_aaa0809c34389e18")
24|LARK_APP_SECRET = os.getenv("LARK_APP_SECRET", "r0az2k1jETYxHF2DxiR0MbcukUkKQZFU")
25|CRM_URL = os.getenv("CRM_URL", "http://localhost:5000")
26|# 固定回覆對話 ID（PDF Bot 所在的群組/對話）
27|DEFAULT_CHAT_ID = os.getenv("DEFAULT_CHAT_ID", "oc_2903a12ccac2829f6e2af59fc5abeadb")
28|
29|# ── FastAPI App ────────────────────────────────────────────────────────────────
30|app = FastAPI(title="Feishu PDF Bot Webhook")
31|
32|# ── Lark Token Cache ──────────────────────────────────────────────────────────
33|_tenant_token = {"token": None, "expires_at": 0}
34|
35|def get_tenant_token():
36|    now = datetime.now().timestamp()
37|    if _tenant_token["token"] and _tenant_token["expires_at"] > now:
38|        return _tenant_token["token"]
39|    
40|    resp = httpx.post(
41|        f"{LARK_API_BASE}/auth/v3/tenant_access_token/internal",
42|        json={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET},
43|        timeout=30
44|    )
45|    data = resp.json()
46|    if data.get("code") != 0:
47|        raise Exception(f"Lark auth failed: {data}")
48|    
49|    _tenant_token["token"] = data["tenant_access_token"]
50|    _tenant_token["expires_at"] = now + data.get("expire", 7200) - 120
51|    print(f"[LARK] Token refreshed, expires in {data.get('expire', 7200)}s")
52|    return _tenant_token["token"]
53|
54|# ── Lark API Helpers ───────────────────────────────────────────────────────────
55|def lark_get(path, params=None):
56|    token = get_tenant_token()
57|    resp = httpx.get(
58|        f"{LARK_API_BASE}{path}",
59|        headers={"Authorization": f"Bearer {token}"},
60|        params=params,
61|        timeout=30
62|    )
63|    return resp.json()
64|
65|def lark_post(path, json_data=None):
66|    token = get_tenant_token()
67|    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
68|    resp = httpx.post(
69|        f"{LARK_API_BASE}{path}",
70|        headers=headers,
71|        json=json_data,
72|        timeout=60
73|    )
74|    return resp.json()
75|
76|# ── CRM API Helpers ────────────────────────────────────────────────────────────
77|def crm_api_post(endpoint, fields):
78|    data = urllib.parse.urlencode(fields).encode()
79|    req = urllib.request.Request(
80|        f"{CRM_URL}{endpoint}",
81|        data=data,
82|        method="POST"
83|    )
84|    req.add_header("Content-Type", "application/x-www-form-urlencoded")
85|    try:
86|        with urllib.request.urlopen(req, timeout=15) as resp:
87|            return json.loads(resp.read().decode())
88|    except Exception as e:
89|        print(f"[CRM] POST {endpoint} failed: {e}")
90|        return {"error": str(e)}
91|
92|def crm_api_get(endpoint):
93|    req = urllib.request.Request(f"{CRM_URL}{endpoint}")
94|    try:
95|        with urllib.request.urlopen(req, timeout=10) as resp:
96|            return json.loads(resp.read().decode())
97|    except Exception as e:
98|        print(f"[CRM] GET {endpoint} failed: {e}")
99|        return []
100|
101|def crm_find_customer_by_name(name):
102|    customers = crm_api_get("/api/customers?include_potential=true")
103|    if isinstance(customers, list):
104|        for c in customers:
105|            if name in c.get("name", ""):
106|                return c
107|    return None
108|
109|def crm_create_customer(name, phone="", email=""):
110|    return crm_api_post("/api/customers", {"name": name, "phone": phone, "email": email})
111|
112|def crm_create_renewal(
113|    customer_id, license_plate, insurance_company,
114|    policy_type, coverage_amount, premium,
115|    effective_date, expiry_date, notes,
116|    policy_number, vehicle_model, phone=""
117|):
118|    return crm_api_post("/api/renewals", {
119|        "customer_id": customer_id,
120|        "license_plate": license_plate,
121|        "insurance_company": insurance_company,
122|        "policy_type": policy_type,
123|        "coverage_amount": coverage_amount,
124|        "premium": premium,
125|        "effective_date": effective_date,
126|        "expiry_date": expiry_date,
127|        "notes": notes,
128|        "policy_number": policy_number,
129|        "vehicle_model": vehicle_model,
130|        "phone": phone,
131|        "status": "pending"
132|    })
133|
134|# ── PDF Processing ────────────────────────────────────────────────────────────
135|def extract_pdf_text(pdf_path):
136|    """Extract text from PDF using pdftotext"""
137|    try:
138|        result = subprocess.run(
139|            ["pdftotext", "-layout", str(pdf_path), "-"],
140|            capture_output=True, text=True, timeout=30
141|        )
142|        if result.returncode == 0:
143|            return result.stdout
144|    except Exception as e:
145|        print(f"[PDF] pdftotext failed: {e}")
146|    return ""
147|
148|def get_pdf_page_count(pdf_path):
149|    """Get number of pages in PDF"""
150|    try:
151|        result = subprocess.run(
152|            ["pdfinfo", str(pdf_path)],
153|            capture_output=True, text=True, timeout=10
154|        )
155|        for line in result.stdout.split("\n"):
156|            if "Pages:" in line:
157|                return int(line.split(":")[-1].strip())
158|    except:
159|        pass
160|    return 1
161|
162|def parse_date(date_str):
163|    """Convert date string to YYYY-MM-DD"""
164|    if not date_str:
165|        return ""
166|    date_str = date_str.strip()
167|    formats = [
168|        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
169|        "%Y/%m/%d", "%Y-%m-%d",
170|        "%d %B %Y", "%B %d, %Y",
171|    ]
172|    for fmt in formats:
173|        try:
174|            dt = datetime.strptime(date_str, fmt)
175|            return dt.strftime("%Y-%m-%d")
176|        except:
177|            pass
178|    return date_str
179|
180|def parse_renewal_text(text, page_num=1):
181|    """Parse renewal notice text to extract policy info"""
182|    info = {
183|        "name": "", "phone": "", "license_plate": "",
184|        "policy_type": "", "premium": 0, "coverage_amount": 0,
185|        "effective_date": "", "expiry_date": "",
186|        "policy_number": "", "vehicle_model": "",
187|        "insurance_company": "永誠保險",
188|        "notes": ""
189|    }
190|    
191|    if not text.strip():
192|        return info
193|    
194|    # Extract name
195|    name_patterns = [
196|        r"客戶姓名[：:]\s*([^\n]{2,20})",
197|        r"投保人[：:]\s*([^\n]{2,20})",
198|        r"Policy\s*Holder[：:]\s*([^\n]{2,20})",
199|        r"Name[：:]\s*([^\n]{2,20})",
200|    ]
201|    for pat in name_patterns:
202|        m = re.search(pat, text)
203|        if m:
204|            info["name"] = m.group(1).strip()
205|            break
206|    
207|    # Extract phone
208|    phone_patterns = [
209|        r"電話[：:]\s*([0-9\s\-]{8,15})",
210|        r"Tel[：:]\s*([0-9\s\-]{8,15})",
211|        r"Phone[：:]\s*([0-9\s\-]{8,15})",
212|        r"(?:9|8|5|6)\d[\s\-]?\d{4}[\s\-]?\d{4}",
213|    ]
214|    for pat in phone_patterns:
215|        m = re.search(pat, text, re.IGNORECASE)
216|        if m:
217|            info["phone"] = m.group(1).strip()
218|            break
219|    
220|    # Extract license plate
221|    plate_patterns = [
222|        r"[粵粤]?\s*[A-Z]{1,3}[\s\-]?[0-9]{1,4}[\s\-]?[A-Z0-9]*",
223|        r"車牌[：:]*\s*([A-Z0-9]{2,10})",
224|        r"Registration[：:]*\s*([A-Z0-9]{2,10})",
225|        r"\b([A-Z]{2}\s*[0-9]{4})\b",
226|    ]
227|    for pat in plate_patterns:
228|        m = re.search(pat, text, re.IGNORECASE)
229|        if m:
230|            plate = re.sub(r"\s+", "", m.group(0).upper())
231|            if len(plate) >= 4:
232|                info["license_plate"] = plate
233|                break
234|    
235|    # Extract policy number
236|    policy_patterns = [
237|        r"保單號碼[：:]\s*([A-Z0-9\-]{4,25})",
238|        r"Policy\s*No[.:\s]*([A-Z0-9\-]{4,25})",
239|        r"POLICY\s*NO[.:\s]*([A-Z0-9\-]{4,25})",
240|        r"\b(POL[A-Z0-9\-]{4,})\b",
241|        r"\b(RN[-_][A-Z0-9\-]{4,})\b",
242|    ]
243|    for pat in policy_patterns:
244|        m = re.search(pat, text, re.IGNORECASE)
245|        if m:
246|            info["policy_number"] = m.group(1).strip().upper()
247|            break
248|    
249|    # Extract premium
250|    premium_patterns = [
251|        r"(?:保費|Premium)[^\$]*HK\$\s*([0-9,]+\.?\d*)",
252|        r"(?:Total|總計)[^\$]*HK\$\s*([0-9,]+\.?\d*)",
253|    ]
254|    for pat in premium_patterns:
255|        m = re.search(pat, text, re.IGNORECASE)
256|        if m:
257|            try:
258|                info["premium"] = float(m.group(1).replace(",", ""))
259|                break
260|            except:
261|                pass
262|    
263|    # Extract sum insured
264|    si_patterns = [
265|        r"Sum\s*Insured[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
266|        r"Insured\s*Amount[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
267|        r"投保金額[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
268|        r"保額[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
269|    ]
270|    for pat in si_patterns:
271|        m = re.search(pat, text, re.IGNORECASE)
272|        if m:
273|            try:
274|                info["coverage_amount"] = float(m.group(1).replace(",", ""))
275|                break
276|            except:
277|                pass
278|    
279|    # Extract dates
280|    date_patterns = [
281|        (r"生效[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
282|        (r"Effect\s*From[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
283|        (r"起保[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
284|        (r"到期[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
285|        (r"Expiry\s*Date[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
286|        (r"屆滿[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
287|    ]
288|    for pat, field in date_patterns:
289|        m = re.search(pat, text, re.IGNORECASE)
290|        if m:
291|            info[field] = parse_date(m.group(1))
292|    
293|    # Extract vehicle model
294|    vehicle_patterns = [
295|        r"車型[：:]\s*([^\n]{3,40})",
296|        r"車款[：:]\s*([^\n]{3,40})",
297|        r"Vehicle\s*Model[：:]\s*([^\n]{3,40})",
298|        r"(Tesla\s+Model\s+\w+|BYD[\s\-]\w+|Mercedes[\s\-]?BENZ[^\n]{0,20}|BMW[^\n]{0,15}|Toyota[^\n]{0,15}|Honda[^\n]{0,15})",
299|    ]
300|    for pat in vehicle_patterns:
301|        m = re.search(pat, text, re.IGNORECASE)
302|        if m:
303|            info["vehicle_model"] = m.group(1).strip()
304|            break
305|    
306|    # Determine policy type
307|    text_lower = text.lower()
308|    if "comprehensive" in text_lower or "全保" in text:
309|        info["policy_type"] = "全保"
310|    elif "third party" in text_lower or "第三者" in text:
311|        info["policy_type"] = "第三者責任"
312|        if info["coverage_amount"] == 0:
313|            info["coverage_amount"] = 2000000
314|    elif "港車北上" in text:
315|        info["policy_type"] = "港車北上"
316|    elif "兩地牌" in text:
317|        info["policy_type"] = "兩地牌"
318|    else:
319|        info["policy_type"] = "其他"
320|    
321|    # Extract NCB
322|    ncb_list = []
323|    for pat in [r"NCB\s*[：:]\s*(\d+)%", r"NCD\s*[：:]\s*(\d+)%", r"無索償折扣[：:]\s*(\d+)%"]:
324|        m = re.search(pat, text, re.IGNORECASE)
325|        if m:
326|            ncb_list.append(f"NCB: {m.group(1)}%")
327|    
328|    # Extract excesses
329|    excess_map = [
330|        ("TPPD", r"TPPD[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
331|        ("OD", r"(?:OD|Self)[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
332|        ("THEFT", r"THEFT[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
333|        ("YIU", r"YIU[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
334|        ("PARKING", r"PARKING[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
335|    ]
336|    excess_list = []
337|    for key, pat in excess_map:
338|        m = re.search(pat, text, re.IGNORECASE)
339|        if m:
340|            try:
341|                val = float(m.group(1).replace(",", ""))
342|                excess_list.append(f"{key}: HK${val:,.0f}")
343|            except:
344|                pass
345|    
346|    # Build notes
347|    notes_parts = []
348|    if ncb_list:
349|        notes_parts.append(" | ".join(ncb_list))
350|    if excess_list:
351|        notes_parts.append(" | ".join(excess_list))
352|    if info["policy_number"]:
353|        notes_parts.append(f"Policy: {info['policy_number']}")
354|    if info["vehicle_model"]:
355|        notes_parts.append(f"Model: {info['vehicle_model']}")
356|    info["notes"] = " | ".join(notes_parts)
357|    
358|    return info
359|
360|def process_pdf(pdf_path):
361|    """Process PDF and return list of parsed records"""
362|    text = extract_pdf_text(pdf_path)
363|    page_count = get_pdf_page_count(pdf_path)
364|    
365|    results = []
366|    
367|    if text.strip():
368|        # Split by form feed or page markers
369|        pages = re.split(r"\f|(?=\w+\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", text)
370|        for i, page_text in enumerate(pages[:page_count]):
371|            if page_text.strip():
372|                info = parse_renewal_text(page_text, i+1)
373|                if info["name"] or info["license_plate"] or info["policy_number"]:
374|                    results.append(info)
375|    
376|    # If nothing found, create one empty record for manual entry
377|    if not results:
378|        results.append(parse_renewal_text("", 1))
379|    
380|    return results
381|
382|# ── Save to CRM ───────────────────────────────────────────────────────────────
383|def save_to_crm(info):
384|    """Save parsed info to CRM, return result dict"""
385|    if not info.get("name") and not info.get("license_plate") and not info.get("policy_number"):
386|        return {"error": "無法識別任何資料"}
387|    
388|    name = info.get("name") or "未知客戶"
389|    customer = crm_find_customer_by_name(name)
390|    
391|    if not customer:
392|        result = crm_create_customer(name)
393|        if "error" in result:
394|            return {"error": f"建立客戶失敗: {result['error']}"}
395|        customer = crm_find_customer_by_name(name)
396|        if not customer:
397|            return {"error": "客戶建立後找不到"}
398|    
399|    cid = customer["id"]
400|    
401|    result = crm_create_renewal(
402|        customer_id=cid,
403|        license_plate=info.get("license_plate", ""),
404|        insurance_company=info.get("insurance_company", "永誠保險"),
405|        policy_type=info.get("policy_type", "其他"),
406|        coverage_amount=info.get("coverage_amount", 0),
407|        premium=info.get("premium", 0),
408|        effective_date=info.get("effective_date", ""),
409|        expiry_date=info.get("expiry_date", ""),
410|        notes=info.get("notes", ""),
411|        policy_number=info.get("policy_number", ""),
412|        vehicle_model=info.get("vehicle_model", ""),
413|        phone=info.get("phone", "")
414|    )
415|    
416|    if "error" in result:
417|        return {"error": f"建立續保記錄失敗: {result['error']}"}
418|    
419|    return {
420|        "ok": True,
421|        "customer": customer["name"],
422|        "customer_id": cid,
423|        "policy_type": info.get("policy_type"),
424|        "license_plate": info.get("license_plate"),
425|        "premium": info.get("premium"),
426|    }
427|
428|# ── Lark Message Sending ─────────────────────────────────────────────────────
429|def send_lark_text(receive_id, receive_id_type, text):
430|    """Send text message to Lark user or chat"""
431|    result = lark_post("/im/v1/messages", {
432|        "receive_id": receive_id,
433|        "msg_type": "text",
434|        "content": json.dumps({"text": text})
435|    })
436|    return result
437|
438|# ── Webhook Endpoints ─────────────────────────────────────────────────────────
439|@app.get("/webhook/lark")
440|async def webhook_verify(request: Request, challenge: str = Query(None)):
441|    """Lark Webhook URL 驗證"""
442|    print(f"[LARK WEBHOOK] GET verification, challenge={challenge}")
443|    return {"challenge": challenge}
444|
445|@app.post("/webhook/lark")
446|async def webhook_lark(request: Request):
447|    """Lark 消息 Webhook 端點"""
448|    try:
449|        body = await request.json()
450|    except:
451|        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
452|    
453|    event_type = body.get("event_type", "")
454|    print(f"[LARK WEBHOOK] Event: {event_type}")
455|    print(f"[LARK WEBHOOK] Body: {json.dumps(body, ensure_ascii=False)[:300]}")
456|    
457|    if event_type == "im.message.receive_v1":
458|        return await handle_message(body.get("event", {}))
459|    
460|    return JSONResponse({"code": 0, "msg": "ok"})
461|
462|async def handle_message(event):
463|    """處理收到的 Lark 消息"""
464|    message = event.get("message", {})
465|    msg_type = message.get("msg_type", "")
466|    msg_id = message.get("message_id", "")
467|    chat_id = event.get("chat_id", "")
468|    
469|    # Get sender info
470|    sender = event.get("sender", {})
471|    sender_id = sender.get("sender_id", {})
472|    open_id = sender_id.get("open_id", "")
473|    
474|    try:
475|        content = json.loads(message.get("content", "{}"))
476|    except:
477|        content = {}
478|    
479|    print(f"[LARK] msg_type={msg_type}, msg_id={msg_id}, chat_id={chat_id}")
480|    
481|    # ── File message (PDF) ──
482|    if msg_type == "file":
483|        file_key = content.get("file_key", "")
484|        
485|        if not file_key:
486|            return JSONResponse({"code": 0, "msg": "no file_key"})
487|        
488|        # Download file from Lark
489|        try:
490|            token = get_tenant_token()
491|            resp = httpx.get(
492|                f"{LARK_API_BASE}/im/v1/messages/{msg_id}/resources/{file_key}",
493|                headers={"Authorization": f"Bearer {token}"},
494|                timeout=60
495|            )
496|            print(f"[LARK] File download status: {resp.status_code}")
497|        except Exception as e:
498|            print(f"[LARK] File download error: {e}")
499|            send_lark_text(DEFAULT_CHAT_ID, "chat_id", "❌ 下載文件失敗，請稍後再試。")
500|            return JSONResponse({"code": 1, "msg": str(e)})
501|