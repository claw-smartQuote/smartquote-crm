1|1|1|"""
2|2|2|Feishu PDF Bot - Webhook Server
3|3|3|接收 Lark 發送的消息和文件，自動解析 PDF 並入庫至 CRM
4|4|4|"""
5|5|5|import os
6|6|6|import sys
7|7|7|import json
8|8|8|import asyncio
9|9|9|import tempfile
10|10|10|import subprocess
11|11|11|import re
12|12|12|import shutil
13|13|13|from pathlib import Path
14|14|14|from datetime import datetime
15|15|15|from fastapi import FastAPI, Request, Query
16|16|16|from fastapi.responses import JSONResponse
17|17|17|import httpx
18|18|18|import urllib.request
19|19|19|import urllib.parse
20|20|20|
21|21|21|# ── Config ────────────────────────────────────────────────────────────────────
22|22|22|LARK_API_BASE = "https://open.larksuite.com/open-apis"
23|23|23|LARK_APP_ID = os.getenv("LARK_APP_ID", "cli_aaa0809c34389e18")
24|24|24|LARK_APP_SECRET = "r0az2k1jETYxHF2DxiR0MbcukUkKQZFU"
25|25|25|CRM_URL = os.getenv("CRM_URL", "http://localhost:5000")
26|26|26|# Fixed reply chat ID (PDF Bot's group/conversation)
27|27|27|DEFAULT_CHAT_ID = os.getenv("DEFAULT_CHAT_ID", "oc_2903a12ccac2829f6e2af59fc5abeadb")
28|28|28|# Lark Webhook Verification Token
29|29|29|LARK_VERIFICATION_TOKEN=os.getenv("LARK_VERIFICATION_TOKEN", "")
30|30|30|# ── FastAPI App ────────────────────────────────────────────────────────────────
31|31|31|app = FastAPI(title="Feishu PDF Bot Webhook")
32|32|32|
33|33|33|# ── Lark Token Cache ──────────────────────────────────────────────────────────
34|34|34|_tenant_token = {"token": None, "expires_at": 0}
35|35|35|
36|36|36|def get_tenant_token():
37|37|37|    now = datetime.now().timestamp()
38|38|38|    if _tenant_token["token"] and _tenant_token["expires_at"] > now:
39|39|39|        return _tenant_token["token"]
40|40|40|    
41|41|41|    resp = httpx.post(
42|42|42|        f"{LARK_API_BASE}/auth/v3/tenant_access_token/internal",
43|43|43|        json={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET},
44|44|44|        timeout=30
45|45|45|    )
46|46|46|    data = resp.json()
47|47|47|    if data.get("code") != 0:
48|48|48|        raise Exception(f"Lark auth failed: {data}")
49|49|49|    
50|50|50|    _tenant_token["token"] = data["tenant_access_token"]
51|51|51|    _tenant_token["expires_at"] = now + data.get("expire", 7200) - 120
52|52|52|    print(f"[LARK] Token refreshed, expires in {data.get('expire', 7200)}s")
53|53|53|    return _tenant_token["token"]
54|54|54|
55|55|55|# ── Lark API Helpers ───────────────────────────────────────────────────────────
56|56|56|def lark_get(path, params=None):
57|57|57|    token = get_tenant_token()
58|58|58|    resp = httpx.get(
59|59|59|        f"{LARK_API_BASE}{path}",
60|60|60|        headers={"Authorization": f"Bearer {token}"},
61|61|61|        params=params,
62|62|62|        timeout=30
63|63|63|    )
64|64|64|    return resp.json()
65|65|65|
66|66|66|def lark_post(path, json_data=None):
67|67|67|    token = get_tenant_token()
68|68|68|    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
69|69|69|    resp = httpx.post(
70|70|70|        f"{LARK_API_BASE}{path}",
71|71|71|        headers=headers,
72|72|72|        json=json_data,
73|73|73|        timeout=60
74|74|74|    )
75|75|75|    return resp.json()
76|76|76|
77|77|77|# ── CRM API Helpers ────────────────────────────────────────────────────────────
78|78|78|def crm_api_post(endpoint, fields):
79|79|79|    data = urllib.parse.urlencode(fields).encode()
80|80|80|    req = urllib.request.Request(
81|81|81|        f"{CRM_URL}{endpoint}",
82|82|82|        data=data,
83|83|83|        method="POST"
84|84|84|    )
85|85|85|    req.add_header("Content-Type", "application/x-www-form-urlencoded")
86|86|86|    try:
87|87|87|        with urllib.request.urlopen(req, timeout=15) as resp:
88|88|88|            return json.loads(resp.read().decode())
89|89|89|    except Exception as e:
90|90|90|        print(f"[CRM] POST {endpoint} failed: {e}")
91|91|91|        return {"error": str(e)}
92|92|92|
93|93|93|def crm_api_get(endpoint):
94|94|94|    req = urllib.request.Request(f"{CRM_URL}{endpoint}")
95|95|95|    try:
96|96|96|        with urllib.request.urlopen(req, timeout=10) as resp:
97|97|97|            return json.loads(resp.read().decode())
98|98|98|    except Exception as e:
99|99|99|        print(f"[CRM] GET {endpoint} failed: {e}")
100|100|100|        return []
101|101|101|
102|102|102|def crm_find_customer_by_name(name):
103|103|103|    customers = crm_api_get("/api/customers?include_potential=true")
104|104|104|    if isinstance(customers, list):
105|105|105|        for c in customers:
106|106|106|            if name in c.get("name", ""):
107|107|107|                return c
108|108|108|    return None
109|109|109|
110|110|110|def crm_create_customer(name, phone="", email=""):
111|111|111|    return crm_api_post("/api/customers", {"name": name, "phone": phone, "email": email})
112|112|112|
113|113|113|def crm_create_renewal(
114|114|114|    customer_id, license_plate, insurance_company,
115|115|115|    policy_type, coverage_amount, premium,
116|116|116|    effective_date, expiry_date, notes,
117|117|117|    policy_number, vehicle_model, phone=""
118|118|118|):
119|119|119|    return crm_api_post("/api/renewals", {
120|120|120|        "customer_id": customer_id,
121|121|121|        "license_plate": license_plate,
122|122|122|        "insurance_company": insurance_company,
123|123|123|        "policy_type": policy_type,
124|124|124|        "coverage_amount": coverage_amount,
125|125|125|        "premium": premium,
126|126|126|        "effective_date": effective_date,
127|127|127|        "expiry_date": expiry_date,
128|128|128|        "notes": notes,
129|129|129|        "policy_number": policy_number,
130|130|130|        "vehicle_model": vehicle_model,
131|131|131|        "phone": phone,
132|132|132|        "status": "pending"
133|133|133|    })
134|134|134|
135|135|135|# ── PDF Processing ────────────────────────────────────────────────────────────
136|136|136|def lark_ocr_image(image_path):
137|137|137|    """Use Lark AI to analyze image and extract text"""
138|138|138|    try:
139|139|139|        import base64
140|140|140|        token = get_tenant_token()
141|141|141|        with open(image_path, "rb") as f:
142|142|142|            image_data = base64.b64encode(f.read()).decode()
143|143|143|
144|144|144|        # Use Lark's image recognition API
145|145|145|        resp = httpx.post(
146|146|146|            f"{LARK_API_BASE}/image/v1/recognize",
147|147|147|            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
148|148|148|            json={
149|149|149|                "image": image_data,
150|150|150|                "type": "text"
151|151|151|            },
152|152|152|            timeout=120
153|153|153|        )
154|154|154|        data = resp.json()
155|155|155|        print(f"[LARK OCR] Response: {data}")
156|156|156|        if data.get("code") == 0:
157|157|157|            results = data.get("data", {}).get("results", [])
158|158|158|            texts = [r.get("text", "") for r in results if r.get("text")]
159|159|159|            return "\n".join(texts)
160|160|160|        else:
161|161|161|            print(f"[LARK OCR] API error: {data}")
162|162|162|            # Try alternative endpoint
163|163|163|            resp2 = httpx.post(
164|164|164|                f"{LARK_API_BASE}/optical_char_recognition/v1/image/basic_recognize",
165|165|165|                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
166|166|166|                json={"image": image_data},
167|167|167|                timeout=60
168|168|168|            )
169|169|169|            data2 = resp2.json()
170|170|170|            print(f"[LARK OCR] Fallback response: {data2}")
171|171|171|            if data2.get("code") == 0:
172|172|172|                return data2.get("data", {}).get("text", "")
173|173|173|    except Exception as e:
174|174|174|        print(f"[LARK OCR] Failed: {e}")
175|175|175|    return ""
176|176|176|
177|177|177|def extract_pdf_text(pdf_path):
178|178|178|    """Extract text from PDF — try pdftotext, PyPDF2, then OCR for scanned PDFs"""
179|179|179|    # Try pdftotext (available on Render with poppler)
180|180|180|    try:
181|181|181|        result = subprocess.run(
182|182|182|            ["pdftotext", "-layout", str(pdf_path), "-"],
183|183|183|            capture_output=True, text=True, timeout=30
184|184|184|        )
185|185|185|        if result.returncode == 0 and result.stdout.strip():
186|186|186|            return result.stdout
187|187|187|    except Exception:
188|188|188|        pass
189|189|189|
190|190|190|    # Fallback: PyPDF2
191|191|191|    try:
192|192|192|        from PyPDF2 import PdfReader
193|193|193|        reader = PdfReader(str(pdf_path))
194|194|194|        texts = []
195|195|195|        for page in reader.pages:
196|196|196|            t = page.extract_text()
197|197|197|            if t:
198|198|198|                texts.append(t)
199|199|199|        text = "\n".join(texts)
200|200|200|        if text.strip():
201|201|201|            return text
202|202|202|    except Exception as e:
203|203|203|        print(f"[PDF] PyPDF2 extract failed: {e}")
204|204|204|
205|205|205|    # OCR fallback for scanned/image-based PDFs
206|206|206|    print("[PDF] No text found, trying OCR for scanned PDF...")
207|207|207|    try:
208|208|208|        import pymupdf
209|209|209|        doc = pymupdf.open(str(pdf_path))
210|210|210|        ocr_texts = []
211|211|211|        for page_num, page in enumerate(doc):
212|212|212|            # Render page as image (2x zoom for better OCR accuracy)
213|213|213|            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
214|214|214|            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
215|215|215|                pix.save(tmp.name)
216|216|216|                tmp_path = tmp.name
217|217|217|
218|218|218|            # Try pytesseract OCR first
219|219|219|            ocr_success = False
220|220|220|            try:
221|221|221|                import pytesseract
222|222|222|                from PIL import Image
223|223|223|                img_pil = Image.open(tmp_path)
224|224|224|                text = pytesseract.image_to_string(img_pil, lang='chi_tra+eng')
225|225|225|                if text.strip():
226|226|226|                    ocr_texts.append(text)
227|227|227|                    ocr_success = True
228|228|228|                    print(f"[PDF] pytesseract OCR page {page_num+1}: {len(text)} chars")
229|229|229|            except ImportError:
230|230|230|                print("[PDF] pytesseract not available...")
231|231|231|            except Exception as e:
232|232|232|                print(f"[PDF] pytesseract failed: {e}")
233|233|233|
234|234|234|            # Try Lark OCR as fallback
235|235|235|            if not ocr_success:
236|236|236|                try:
237|237|237|                    lark_text = lark_ocr_image(tmp_path)
238|238|238|                    if lark_text.strip():
239|239|239|                        ocr_texts.append(lark_text)
240|240|240|                        ocr_success = True
241|241|241|                        print(f"[PDF] Lark OCR page {page_num+1}: {len(lark_text)} chars")
242|242|242|                except Exception as e:
243|243|243|                    print(f"[PDF] Lark OCR failed: {e}")
244|244|244|
245|245|245|            # Cleanup temp file
246|246|246|            if os.path.exists(tmp_path):
247|247|247|                os.unlink(tmp_path)
248|248|248|
249|249|249|        if ocr_texts:
250|250|250|            return "\n\n".join(ocr_texts)
251|251|251|    except Exception as e:
252|252|252|        print(f"[PDF] OCR extraction failed: {e}")
253|253|253|
254|254|254|    return ""
255|255|255|
256|256|256|def get_pdf_page_count(pdf_path):
257|257|257|    """Get number of pages in PDF"""
258|258|258|    # Try pdfinfo first
259|259|259|    try:
260|260|260|        result = subprocess.run(
261|261|261|            ["pdfinfo", str(pdf_path)],
262|262|262|            capture_output=True, text=True, timeout=10
263|263|263|        )
264|264|264|        for line in result.stdout.split("\n"):
265|265|265|            if "Pages:" in line:
266|266|266|                return int(line.split(":")[-1].strip())
267|267|267|    except:
268|268|268|        pass
269|269|269|    # Fallback: PyPDF2
270|270|270|    try:
271|271|271|        from PyPDF2 import PdfReader
272|272|272|        return len(PdfReader(str(pdf_path)).pages)
273|273|273|    except:
274|274|274|        pass
275|275|275|    return 1
276|276|276|
277|277|277|def parse_date(date_str):
278|278|278|    """Convert date string to YYYY-MM-DD"""
279|279|279|    if not date_str:
280|280|280|        return ""
281|281|281|    date_str = date_str.strip()
282|282|282|    formats = [
283|283|283|        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
284|284|284|        "%Y/%m/%d", "%Y-%m-%d",
285|285|285|        "%d %B %Y", "%B %d, %Y",
286|286|286|    ]
287|287|287|    for fmt in formats:
288|288|288|        try:
289|289|289|            dt = datetime.strptime(date_str, fmt)
290|290|290|            return dt.strftime("%Y-%m-%d")
291|291|291|        except:
292|292|292|            pass
293|293|293|    return date_str
294|294|294|
295|295|295|def parse_renewal_text(text, page_num=1):
296|296|296|    """Parse renewal notice text to extract policy info"""
297|297|297|    info = {
298|298|298|        "name": "", "phone": "", "license_plate": "",
299|299|299|        "policy_type": "", "premium": 0, "coverage_amount": 0,
300|300|300|        "effective_date": "", "expiry_date": "",
301|301|301|        "policy_number": "", "vehicle_model": "",
302|302|302|        "insurance_company": "永誠保險",
303|303|303|        "notes": ""
304|304|304|    }
305|305|305|    
306|306|306|    if not text.strip():
307|307|307|        return info
308|308|308|    
309|309|309|    # Extract name
310|310|310|    name_patterns = [
311|311|311|        r"客戶姓名[：:]\s*([^\n]{2,20})",
312|312|312|        r"投保人[：:]\s*([^\n]{2,20})",
313|313|313|        r"Policy\s*Holder[：:]\s*([^\n]{2,20})",
314|314|314|        r"Name[：:]\s*([^\n]{2,20})",
315|315|315|    ]
316|316|316|    for pat in name_patterns:
317|317|317|        m = re.search(pat, text)
318|318|318|        if m:
319|319|319|            info["name"] = m.group(1).strip()
320|320|320|            break
321|321|321|    
322|322|322|    # Extract phone
323|323|323|    phone_patterns = [
324|324|324|        r"電話[：:]\s*([0-9\s\-]{8,15})",
325|325|325|        r"Tel[：:]\s*([0-9\s\-]{8,15})",
326|326|326|        r"Phone[：:]\s*([0-9\s\-]{8,15})",
327|327|327|        r"(?:9|8|5|6)\d[\s\-]?\d{4}[\s\-]?\d{4}",
328|328|328|    ]
329|329|329|    for pat in phone_patterns:
330|330|330|        m = re.search(pat, text, re.IGNORECASE)
331|331|331|        if m:
332|332|332|            info["phone"] = m.group(1).strip()
333|333|333|            break
334|334|334|    
335|335|335|    # Extract license plate
336|336|336|    plate_patterns = [
337|337|337|        r"[粵粤]?\s*[A-Z]{1,3}[\s\-]?[0-9]{1,4}[\s\-]?[A-Z0-9]*",
338|338|338|        r"車牌[：:]*\s*([A-Z0-9]{2,10})",
339|339|339|        r"Registration[：:]*\s*([A-Z0-9]{2,10})",
340|340|340|        r"\b([A-Z]{2}\s*[0-9]{4})\b",
341|341|341|    ]
342|342|342|    for pat in plate_patterns:
343|343|343|        m = re.search(pat, text, re.IGNORECASE)
344|344|344|        if m:
345|345|345|            plate = re.sub(r"\s+", "", m.group(0).upper())
346|346|346|            if len(plate) >= 4:
347|347|347|                info["license_plate"] = plate
348|348|348|                break
349|349|349|    
350|350|350|    # Extract policy number
351|351|351|    policy_patterns = [
352|352|352|        r"保單號碼[：:]\s*([A-Z0-9\-]{4,25})",
353|353|353|        r"Policy\s*No[.:\s]*([A-Z0-9\-]{4,25})",
354|354|354|        r"POLICY\s*NO[.:\s]*([A-Z0-9\-]{4,25})",
355|355|355|        r"\b(POL[A-Z0-9\-]{4,})\b",
356|356|356|        r"\b(RN[-_][A-Z0-9\-]{4,})\b",
357|357|357|    ]
358|358|358|    for pat in policy_patterns:
359|359|359|        m = re.search(pat, text, re.IGNORECASE)
360|360|360|        if m:
361|361|361|            info["policy_number"] = m.group(1).strip().upper()
362|362|362|            break
363|363|363|    
364|364|364|    # Extract premium
365|365|365|    premium_patterns = [
366|366|366|        r"(?:保費|Premium)[^\$]*HK\$\s*([0-9,]+\.?\d*)",
367|367|367|        r"(?:Total|總計)[^\$]*HK\$\s*([0-9,]+\.?\d*)",
368|368|368|    ]
369|369|369|    for pat in premium_patterns:
370|370|370|        m = re.search(pat, text, re.IGNORECASE)
371|371|371|        if m:
372|372|372|            try:
373|373|373|                info["premium"] = float(m.group(1).replace(",", ""))
374|374|374|                break
375|375|375|            except:
376|376|376|                pass
377|377|377|    
378|378|378|    # Extract sum insured
379|379|379|    si_patterns = [
380|380|380|        r"Sum\s*Insured[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
381|381|381|        r"Insured\s*Amount[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
382|382|382|        r"投保金額[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
383|383|383|        r"保額[：:]*\s*HK\$\s*([0-9,]+\.?\d*)",
384|384|384|    ]
385|385|385|    for pat in si_patterns:
386|386|386|        m = re.search(pat, text, re.IGNORECASE)
387|387|387|        if m:
388|388|388|            try:
389|389|389|                info["coverage_amount"] = float(m.group(1).replace(",", ""))
390|390|390|                break
391|391|391|            except:
392|392|392|                pass
393|393|393|    
394|394|394|    # Extract dates
395|395|395|    date_patterns = [
396|396|396|        (r"生效[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
397|397|397|        (r"Effect\s*From[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
398|398|398|        (r"起保[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
399|399|399|        (r"到期[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
400|400|400|        (r"Expiry\s*Date[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
401|401|401|        (r"屆滿[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
402|402|402|    ]
403|403|403|    for pat, field in date_patterns:
404|404|404|        m = re.search(pat, text, re.IGNORECASE)
405|405|405|        if m:
406|406|406|            info[field] = parse_date(m.group(1))
407|407|407|    
408|408|408|    # Extract vehicle model
409|409|409|    vehicle_patterns = [
410|410|410|        r"車型[：:]\s*([^\n]{3,40})",
411|411|411|        r"車款[：:]\s*([^\n]{3,40})",
412|412|412|        r"Vehicle\s*Model[：:]\s*([^\n]{3,40})",
413|413|413|        r"(Tesla\s+Model\s+\w+|BYD[\s\-]\w+|Mercedes[\s\-]?BENZ[^\n]{0,20}|BMW[^\n]{0,15}|Toyota[^\n]{0,15}|Honda[^\n]{0,15})",
414|414|414|    ]
415|415|415|    for pat in vehicle_patterns:
416|416|416|        m = re.search(pat, text, re.IGNORECASE)
417|417|417|        if m:
418|418|418|            info["vehicle_model"] = m.group(1).strip()
419|419|419|            break
420|420|420|    
421|421|421|    # Determine policy type
422|422|422|    text_lower = text.lower()
423|423|423|    if "comprehensive" in text_lower or "全保" in text:
424|424|424|        info["policy_type"] = "全保"
425|425|425|    elif "third party" in text_lower or "第三者" in text:
426|426|426|        info["policy_type"] = "第三者責任"
427|427|427|        if info["coverage_amount"] == 0:
428|428|428|            info["coverage_amount"] = 2000000
429|429|429|    elif "港車北上" in text:
430|430|430|        info["policy_type"] = "港車北上"
431|431|431|    elif "兩地牌" in text:
432|432|432|        info["policy_type"] = "兩地牌"
433|433|433|    else:
434|434|434|        info["policy_type"] = "其他"
435|435|435|    
436|436|436|    # Extract NCB
437|437|437|    ncb_list = []
438|438|438|    for pat in [r"NCB\s*[：:]\s*(\d+)%", r"NCD\s*[：:]\s*(\d+)%", r"無索償折扣[：:]\s*(\d+)%"]:
439|439|439|        m = re.search(pat, text, re.IGNORECASE)
440|440|440|        if m:
441|441|441|            ncb_list.append(f"NCB: {m.group(1)}%")
442|442|442|    
443|443|443|    # Extract excesses
444|444|444|    excess_map = [
445|445|445|        ("TPPD", r"TPPD[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
446|446|446|        ("OD", r"(?:OD|Self)[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
447|447|447|        ("THEFT", r"THEFT[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
448|448|448|        ("YIU", r"YIU[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
449|449|449|        ("PARKING", r"PARKING[：:]*\s*HK\$\s*([0-9,]+\.?\d*)"),
450|450|450|    ]
451|451|451|    excess_list = []
452|452|452|    for key, pat in excess_map:
453|453|453|        m = re.search(pat, text, re.IGNORECASE)
454|454|454|        if m:
455|455|455|            try:
456|456|456|                val = float(m.group(1).replace(",", ""))
457|457|457|                excess_list.append(f"{key}: HK${val:,.0f}")
458|458|458|            except:
459|459|459|                pass
460|460|460|    
461|461|461|    # Build notes
462|462|462|    notes_parts = []
463|463|463|    if ncb_list:
464|464|464|        notes_parts.append(" | ".join(ncb_list))
465|465|465|    if excess_list:
466|466|466|        notes_parts.append(" | ".join(excess_list))
467|467|467|    if info["policy_number"]:
468|468|468|        notes_parts.append(f"Policy: {info['policy_number']}")
469|469|469|    if info["vehicle_model"]:
470|470|470|        notes_parts.append(f"Model: {info['vehicle_model']}")
471|471|471|    info["notes"] = " | ".join(notes_parts)
472|472|472|    
473|473|473|    return info
474|474|474|
475|475|475|def process_pdf(pdf_path):
476|476|476|    """Process PDF and return list of parsed records"""
477|477|477|    text = extract_pdf_text(pdf_path)
478|478|478|    page_count = get_pdf_page_count(pdf_path)
479|479|479|    
480|480|480|    results = []
481|481|481|    
482|482|482|    if text.strip():
483|483|483|        # Split by form feed or page markers
484|484|484|        pages = re.split(r"\f|(?=\w+\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", text)
485|485|485|        for i, page_text in enumerate(pages[:page_count]):
486|486|486|            if page_text.strip():
487|487|487|                info = parse_renewal_text(page_text, i+1)
488|488|488|                if info["name"] or info["license_plate"] or info["policy_number"]:
489|489|489|                    results.append(info)
490|490|490|    
491|491|491|    # If nothing found, try to extract images from PDF for manual review
492|492|492|    if not results:
493|493|493|        print("[PDF] No text data found, extracting images for manual review...")
494|494|494|        try:
495|495|495|            import pymupdf
496|496|496|            doc = pymupdf.open(str(pdf_path))
497|497|497|            images = []
498|498|498|            for page_num, page in enumerate(doc):
499|499|499|                # Render page as image
500|500|500|                pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))  # 2x zoom for better quality
501|