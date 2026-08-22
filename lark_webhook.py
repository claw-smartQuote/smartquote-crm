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

# ── CRM API Helpers (use httpx with certifi for reliable SSL) ───────────────────
import certifi

def crm_api_post(endpoint, fields):
    try:
        resp = httpx.post(
            f"{CRM_URL}{endpoint}",
            data=fields,
            timeout=30,
            verify=certifi.where(),
            follow_redirects=True,
        )
        if resp.text:
            return resp.json()
        return {"error": "empty response"}
    except Exception as e:
        print(f"[CRM] POST {endpoint} failed: {e}")
        return {"error": str(e)}

def crm_api_get(endpoint):
    try:
        resp = httpx.get(
            f"{CRM_URL}{endpoint}",
            timeout=30,
            verify=certifi.where(),
            follow_redirects=True,
        )
        if resp.text:
            return resp.json()
        return []
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
    # Default dates to today if empty (CRM requires non-empty dates)
    from datetime import date as _date
    today = _date.today().isoformat()
    if not effective_date:
        effective_date = today
    if not expiry_date:
        expiry_date = today
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
    """Extract text from PDF — try pdftotext first, fallback to PyPDF2"""
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout
    except Exception as e:
        print(f"[PDF] pdftotext failed: {e}")
    # Fallback: PyPDF2
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(str(pdf_path))
        texts = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                texts.append(t)
        out = "\n".join(texts)
        print(f"[PDF] PyPDF2 extracted {len(out)} chars")
        if out.strip():
            return out
        # PyPDF2 returned empty — fall through to Vision OCR for scanned PDFs
    except Exception as e:
        print(f"[PDF] PyPDF2 also failed: {e}")

    # Fallback: pymupdf + pytesseract OCR (works on Linux/Render)
    print("[PDF] Trying pymupdf + pytesseract OCR for scanned PDF...")
    try:
        import pymupdf
        doc = pymupdf.open(str(pdf_path))
        print(f"[PDF] pymupdf opened: {len(doc)} pages")
        ocr_texts = []
        for page_num, page in enumerate(doc):
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                pix.save(tmp.name)
                tmp_path = tmp.name

            ocr_success = False
            # Try pytesseract
            try:
                import pytesseract
                from PIL import Image
                img_pil = Image.open(tmp_path)
                text = pytesseract.image_to_string(img_pil, lang='chi_tra+eng')
                if text.strip():
                    ocr_texts.append(text)
                    ocr_success = True
                    print(f"[PDF] pytesseract OCR page {page_num+1}: {len(text)} chars")
            except ImportError:
                print("[PDF] pytesseract not available")
            except Exception as e:
                print(f"[PDF] pytesseract failed: {e}")

            # Try Lark OCR as fallback
            if not ocr_success:
                try:
                    import base64
                    token = get_tenant_token()
                    with open(tmp_path, "rb") as f:
                        img_b64 = base64.b64encode(f.read()).decode()
                    resp = httpx.post(
                        f"{LARK_API_BASE}/optical_char_recognition/v1/image/basic_recognize",
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                        json={"image": img_b64},
                        timeout=120
                    )
                    data = resp.json()
                    if data.get("code") == 0:
                        ocr_text = data.get("data", {}).get("text", "")
                        if ocr_text.strip():
                            ocr_texts.append(ocr_text)
                            ocr_success = True
                            print(f"[PDF] Lark OCR page {page_num+1}: {len(ocr_text)} chars")
                    else:
                        print(f"[PDF] Lark OCR error: code={data.get('code')}, msg={data.get('msg')}")
                except Exception as e:
                    print(f"[PDF] Lark OCR failed: {e}")

            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        if ocr_texts:
            return "\n\n".join(ocr_texts)
    except Exception as e:
        print(f"[PDF] pymupdf OCR failed: {e}")

    # Final fallback: Vision OCR (macOS only) for scanned PDFs
    text = _vision_ocr_pdf(pdf_path)
    if text:
        return text
    return ""

def _vision_ocr_pdf(pdf_path):
    """Extract text from scanned PDF using macOS Vision framework OCR."""
    try:
        from PyPDF2 import PdfReader
        from PIL import Image
        import Vision
        from Cocoa import NSURL
        import io as _io

        reader = PdfReader(str(pdf_path))
        all_text = []
        for i, page in enumerate(reader.pages):
            images = page.images
            if not images:
                continue
            for img_info in images:
                try:
                    # Convert image to PNG (Vision needs proper format)
                    pil_img = Image.open(_io.BytesIO(img_info.data))
                    if pil_img.mode not in ('RGB', 'L'):
                        pil_img = pil_img.convert('RGB')
                    png_path = f"/tmp/ocr_page_{i}.png"
                    pil_img.save(png_path)

                    # Run Vision OCR
                    image_url = NSURL.fileURLWithPath_(png_path)
                    request = Vision.VNRecognizeTextRequest.alloc().init()
                    request.setRecognitionLevel_(0)  # accurate
                    request.setRecognitionLanguages_(["zh-Hant", "zh-Hans", "en-US"])

                    handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(image_url, None)
                    success, _ = handler.performRequests_error_([request], None)

                    if success:
                        observations = request.results()
                        for obs in observations:
                            candidates = obs.topCandidates_(1)
                            if candidates:
                                all_text.append(candidates[0].string())

                    import os as _os
                    _os.unlink(png_path)
                except Exception as e:
                    print(f"[PDF] Vision OCR page {i} failed: {e}")

        out = "\n".join(all_text)
        if out:
            print(f"[PDF] Vision OCR extracted {len(out)} chars")
        return out
    except Exception as e:
        print(f"[PDF] Vision OCR not available: {e}")
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
    try:
        from PyPDF2 import PdfReader
        return len(PdfReader(str(pdf_path)).pages)
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
    """Parse renewal notice / policy schedule text to extract policy info.
    Supports multiple formats: 達信 Dah Sing, 永誠, FWD, etc."""
    info = {
        "name": "", "phone": "", "license_plate": "",
        "policy_type": "", "premium": 0, "coverage_amount": 0,
        "effective_date": "", "expiry_date": "",
        "policy_number": "", "vehicle_model": "",
        "insurance_company": "",
        "notes": ""
    }

    if not text.strip():
        return info

    # ── Insurance company detection ──
    if "Dah Sing" in text:
        info["insurance_company"] = "達信保險 Dah Sing"
    elif "Well Link" in text or "WELL LINK" in text:
        info["insurance_company"] = "宏利保險 Well Link"
    elif "PROGRESS" in text.upper() or "ROGRESS" in text:
        info["insurance_company"] = "忠意保險 Progress"
    elif "永誠" in text or "Yong Cheng" in text or "YONGCHENG" in text:
        info["insurance_company"] = "永誠保險"
    elif "FWD" in text:
        info["insurance_company"] = "FWD"
    elif "AXA" in text:
        info["insurance_company"] = "AXA"
    elif "AIG" in text:
        info["insurance_company"] = "AIG"
    elif "Zurich" in text:
        info["insurance_company"] = "Zurich"
    elif "Bocraft" in text or "BOC Group" in text:
        info["insurance_company"] = "中銀集團保險"
    elif "Companion" in text:
        info["insurance_company"] = "民安保險"
    else:
        info["insurance_company"] = "未知保險公司"

    # ── Name extraction ──
    name_patterns = [
        r"客戶姓名[：:]\s*([^\n]{2,30})",
        r"投保人[：:]\s*([^\n]{2,30})",
        r"被保[險险]人[：:]\s*([^\n]{2,30})",
        r"Policy\s*Holder\s*[：:]\s*([A-Z][^\n]{2,40})",
        r"Insured\s*/\s*Policyholder\s*[：:]\s*([A-Z][^\n]{2,40})",
        r"Insured\s*Name\s*[：:]\s*([A-Z][^\n]{2,40})",
        r"Name\s*of\s*Insured\s*[：:]\s*([A-Z][^\n]{2,40})",
        # Well Link: name on NEXT line after "Insured / Policyholder :LABEL"
        r"Insured\s*/\s*Policyholder\s*[：:][^\n]*\n\s*([A-Z][A-Z][A-Z \t\.\,&]{2,40})",
        # Dah Sing: name after "Source XXX" line
        r"Source\s+[A-Z][^\n]{0,80}\n\s*([A-Z][A-Z\s]{2,30})\n",
        # Name of Insured at end of document (Dah Sing page 2)
        r"Name\s*of\s*Insured\s*\n\s*([A-Z][A-Z\s]{2,30})",
        # Renewal notice: "Name" on one line, "：VALUE" on next line (OCR layout)
        r"Name\s*\n\s*[：:]\s*([A-Z][A-Z \t&]{2,30})",
        # Standard "Name: VALUE"
        r"Name[：:]\s*([A-Z][A-Z \t&]{2,30})",
    ]
    bad_words = ["flat", "house", "estate", "floor", "block", "road", "street",
                 "company", "limited", "n/a", "property", "occupation",
                 "the insured", "policyholder", "insured /", "business"]
    for pat in name_patterns:
        m = re.search(pat, text, re.MULTILINE | re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if not any(x in candidate.lower() for x in bad_words):
                info["name"] = candidate
                break

    # ── Phone ──
    # Only match labeled phones or HK/China mobile format — exclude company/office numbers
    phone_patterns = [
        r"客戶[聯电聯電]?話[：:]\s*([0-9\s\-]{8,15})",
        r"客戶手[提機][：:]\s*([0-9\s\-]{8,15})",
        r"(?:聯絡|聯繫|联络)[電話话][：:]\s*([0-9\s\-]{8,15})",
        r"Contact\s*(?:No|Number|Phone|Tel)[.：:]*\s*([0-9\s\-]{8,15})",
        r"Mobile\s*[No.：:\s]*([0-9\s\-]{8,15})",
        r"客戶[Phone|Tel][：:]\s*([0-9\s\-]{8,15})",
        # HK mobile — must be full 8 digits starting with 5/6/7/8/9
        r"\b([56789]\d{3}\s?\d{4})\b",
        # China mobile — 11 digits
        r"\b(1[3-9]\d{9})\b",
    ]
    for pat in phone_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            phone = re.sub(r"\s+", "", m.group(1) if m.lastindex else m.group(0))
            # Exclude obvious company numbers (starting with area code pattern like "852" for HK)
            if phone.startswith("852") or phone.startswith("800") or phone.startswith("2808"):
                continue
            if 8 <= len(phone) <= 15:
                info["phone"] = phone
                break

    # ── License plate ──
    # Prefer explicit labels from page 2 schedule, then fall back to HK plate format
    plate_patterns = [
        # Dah Sing / Hong Kong schedule format: "Registration No. : ZU2518"
        # Use [ \t]? for optional trailing letter — do NOT cross newlines (avoid grabbing next line)
        r"Registration\s*(?:Mark|No|Number)[.：:\s]*\s*([A-Z]{1,3}[ \t]?\d{1,5}(?:[ \t]?[A-Z])?)",
        r"Reg[.:\s]*No[.:\s]*([A-Z]{1,3}[ \t]?\d{1,5}(?:[ \t]?[A-Z])?)",
        r"Vehicle\s*Reg[.:\s]*([A-Z]{1,3}[ \t]?\d{1,5}(?:[ \t]?[A-Z])?)",
        # Chinese labels
        r"車牌[號編]?[：:]*\s*([A-Z0-9]{2,12})",
        # HK plate: 1-2 letters + 1-4 digits + optional letter (lower priority — false positives possible)
        r"\b([A-Z]{2}\s?\d{3,4}\s?[A-Z]?)\b",
        # 粤港澳 plates
        r"([粵粤][A-Z]\s?\d{4,5}\s?[港澳])",
    ]
    for pat in plate_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            plate = re.sub(r"\s+", "", m.group(1).upper())
            # Exclude pure numbers, single letters, or suspicious patterns
            if not re.match(r"^[A-Z]", plate):
                continue
            if len(plate) < 2 or len(plate) > 12:
                continue
            # Skip if preceded by address/phone context
            start = max(0, m.start() - 40)
            preceding = text[start:m.start()]
            if any(x in preceding.lower() for x in ["2808", "phone", "tel", "fax", "852 ", "floor", "tower", "road", "place tower"]):
                continue
            # Must contain at least one digit
            if not re.search(r"\d", plate):
                continue
            info["license_plate"] = plate
            break

    # ── Policy number ──
    # Strategy: try the MOST SPECIFIC patterns first (company-specific prefixes),
    # then labeled patterns. Support both half-width : and full-width ：
    policy_patterns = [
        # Dah Sing page 2 format: "267723PMV Policy No."
        r"(\d{4,}[A-Z]{2,5}[\-A-Z0-9]*)\s*Policy\s*No",
        # Known company-specific policy number formats (highest priority)
        r"\b(BBPMV\d{4,})\b",  # Dah Sing motor
        r"\b(\d{2,}PMV\d{2,}[\-A-Z0-9]*)\b",  # generic PMV format
        r"\b(PMV\d{4,}[\-A-Z0-9]*)\b",  # PMV prefix
        # Well Link / generic format with full-width or half-width colon
        r"Polic[yY]?\s*No[.]*\s*[：:]\s*([A-Z0-9][A-Z0-9/\-]{3,24})",
        r"Policy\s*Number\s*[：:]\s*([A-Z0-9][A-Z0-9/\-]{3,24})",
        r"POLICY\s*NO[.]*\s*[：:]\s*([A-Z0-9][A-Z0-9/\-]{3,24})",
        r"保單[號号]碼[：:]\s*([A-Z0-9][A-Z0-9\-]{3,24})",
        # Generic alphanumeric policy numbers (U6VPO..., etc.)
        r"\b([A-Z]\d[A-Z]{2,}\d{6,}[/\d]*)\b",
    ]
    label_words = {"ENDORSEMENT", "ENDORSEMENTS", "NUMBER", "POLICY", "SCHEDULE", "ORIGINAL", "OCCUPATION", "INSURED"}
    for pat in policy_patterns:
        m = re.search(pat, text)  # case-sensitive!
        if m:
            candidate = m.group(1).strip().upper()
            # Reject if it's just a label word
            if candidate in label_words:
                continue
            # Reject if it doesn't contain any digit
            if not re.search(r"\d", candidate):
                continue
            # Reject if it starts with common word fragments (from layout jumbling)
            bad_prefixes = ("ON", "ION", "TION", "ATION", "MENT", "ED", "ER", "ING", "BLE")
            for prefix in bad_prefixes:
                if candidate.startswith(prefix) and len(candidate) - len(prefix) < 15:
                    # Only reject if removing the prefix leaves a short string (likely word fragment)
                    rest = candidate[len(prefix):]
                    if rest and rest[0].isdigit():
                        candidate = rest  # strip the word fragment
                        break
            if candidate in label_words:
                continue
            info["policy_number"] = candidate
            break

    # ── Premium (support HK$ and HKD) ──
    premium_patterns = [
        r"Premium\s*Payable\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
        r"Gross\s*Premium\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
        r"(?:保費|總保費)[^$\d]*?(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
        r"(?:Premium|總計)[^$\d]*?(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
    ]
    for pat in premium_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                info["premium"] = float(m.group(1).replace(",", ""))
                break
            except:
                pass

    # ── Sum insured (support HK$ and HKD) ──
    si_patterns = [
        r"Sum\s*Insured[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
        r"Insured\s*Amount[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
        r"投保金額[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
        r"保額[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
        r"Market\s*Value[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)",
    ]
    for pat in si_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                info["coverage_amount"] = float(m.group(1).replace(",", ""))
                break
            except:
                pass

    # ── Dates ──
    # Numeric formats dd/mm/yyyy or dd-mm-yyyy
    date_patterns = [
        (r"生效[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
        (r"Effect\s*From[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
        (r"起保[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
        (r"Inception[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "effective_date"),
        (r"到期[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
        (r"Expiry\s*Date[：:]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
        (r"屆滿[日日期:：\s]*\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", "expiry_date"),
    ]
    for pat, field in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            info[field] = parse_date(m.group(1))

    # Period of Insurance format: "28 February 2026 00:00 to 27 February 2027"
    period_m = re.search(r"Period\s*of\s*Insurance\s*(\d{1,2}\s+\w+\s+\d{4}).*?to\s*(\d{1,2}\s+\w+\s+\d{4})", text, re.IGNORECASE)
    if period_m:
        info["effective_date"] = parse_date(period_m.group(1))
        info["expiry_date"] = parse_date(period_m.group(2))

    # Well Link / generic: two dates in "DD Month, YYYY" or "DD Month YYYY" format
    # Only consider dates NEAR "Period of Insurance" to avoid grabbing unrelated dates
    if not info["effective_date"] or not info["expiry_date"]:
        # Find the Period of Insurance section (200 chars around it)
        poi_match = re.search(r"Period\s*of\s*Insurance", text, re.IGNORECASE)
        if poi_match:
            search_start = max(0, poi_match.start() - 100)
            search_end = min(len(text), poi_match.end() + 200)
            search_region = text[search_start:search_end]
        else:
            search_region = text

        # Exclude known unrelated date contexts
        # Remove lines about "Premium Levy", "From 1 January 2018 onwards"
        excluded_regions = []
        for bad_pat in [r"From\s+\d{1,2}\s+\w+\s+\d{4}\s+onwards", r"Premium\s*Levy[^\n]*\n[^\n]*\d{4}"]:
            for bm in re.finditer(bad_pat, text, re.IGNORECASE):
                excluded_regions.append((bm.start(), bm.end()))

        all_dates = re.findall(r"(\d{1,2}\s+\w+[,]?\s+\d{4})", search_region)
        parsed_dates = []
        for d in all_dates:
            parsed = parse_date(d.replace(",", ""))
            if parsed and re.match(r"\d{4}-\d{2}-\d{2}", parsed):
                # Skip dates in excluded regions
                d_pos = search_region.find(d)
                if d_pos >= 0:
                    abs_pos = (poi_match.start() - 100 if poi_match else 0) + d_pos
                    in_excluded = any(s <= abs_pos <= e for s, e in excluded_regions)
                    if in_excluded:
                        continue
                parsed_dates.append(parsed)

        # Only accept dates in 2020-2030 range (valid policy years)
        parsed_dates = [d for d in parsed_dates if "202" in d or "203" in d]

        if len(parsed_dates) >= 2:
            parsed_dates = sorted(set(parsed_dates))
            if not info["effective_date"]:
                info["effective_date"] = parsed_dates[0]
            if not info["expiry_date"]:
                info["expiry_date"] = parsed_dates[-1]
        elif len(parsed_dates) == 1:
            if not info["effective_date"]:
                info["effective_date"] = parsed_dates[0]

    # ── Vehicle model (Make + Model from schedule) ──
    vehicle_make = ""
    vehicle_model = ""
    # Try "Make : XXX" format (normal layout)
    make_m = re.search(r"Make\s*[:：]\s*([A-Z][A-Za-z\- ]{2,30})\n", text)
    if make_m:
        vehicle_make = make_m.group(1).strip()
    # Jumbled layout: ":VALUE Make" (value appears before label)
    if not vehicle_make:
        make_m2 = re.search(r":([A-Z][A-Za-z]+)[^\n]{0,40}:\s*Make\b", text)
        if make_m2:
            vehicle_make = make_m2.group(1).strip()
    # Try "Model : YYY" format (normal layout)
    model_m = re.search(r"Model\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9\s\-\.]{2,40})\n", text)
    if model_m:
        vehicle_model = model_m.group(1).strip()
    # Jumbled: "MODELNAME Model" (value before label)
    if not vehicle_model:
        model_m2 = re.search(r"^\s*(MODEL\s+[A-Z0-9\s\-\.]{2,30})\s*Model\b", text, re.MULTILINE)
        if model_m2:
            vehicle_model = model_m2.group(1).strip().title()
    # Also try bare model names after "Model" keyword
    if not vehicle_model:
        model_m3 = re.search(r"Model\s+([A-Z][A-Z0-9\s\-]{2,30})\n", text)
        if model_m3:
            candidate = model_m3.group(1).strip()
            if not any(x in candidate.lower() for x in ["number", "type", "capacity"]):
                vehicle_model = candidate.title()

    if vehicle_make and vehicle_model:
        info["vehicle_model"] = f"{vehicle_make} {vehicle_model}".strip()
    elif vehicle_model:
        info["vehicle_model"] = vehicle_model
    elif vehicle_make:
        info["vehicle_model"] = vehicle_make
    else:
        # Fallback patterns
        vehicle_patterns = [
            r"車型[：:]\s*([^\n]{3,40})",
            r"車款[：:]\s*([^\n]{3,40})",
            r"Vehicle\s*(?:Make|Model|Description)[：:]*\s*([^\n]{3,40})",
            r"(Tesla\s+Model\s+\w+|BYD[\s\-]\w+|Mercedes[\s\-]?BENZ[^\n]{0,20}|BMW[^\n]{0,15}|Toyota[^\n]{0,15}|Honda[^\n]{0,15}|Lexus[^\n]{0,15})",
        ]
        for pat in vehicle_patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                info["vehicle_model"] = m.group(1).strip()
                break

    # ── Policy type ──
    # Priority: "Type of Cover" from schedule > Comprehensive > Private Motor > others
    text_lower = text.lower()
    type_of_cover_m = re.search(r"Type\s*of\s*Cover\s*[:：]\s*([A-Za-z ]+)", text, re.IGNORECASE)
    if type_of_cover_m:
        cover = type_of_cover_m.group(1).strip().upper()
        if "COMPREHENSIVE" in cover or "COMP" in cover:
            info["policy_type"] = "全保"
        elif "THIRD PARTY" in cover or "TPO" in cover:
            info["policy_type"] = "第三者責任"
            if info["coverage_amount"] == 0:
                info["coverage_amount"] = 2000000
        else:
            info["policy_type"] = cover.title()
    elif "comprehensive" in text_lower or "全保" in text:
        info["policy_type"] = "全保"
    elif re.search(r"third\s*party\s*(?:only|property|liability)?", text_lower) and "third party property damage excess" not in text_lower:
        info["policy_type"] = "第三者責任"
        if info["coverage_amount"] == 0:
            info["coverage_amount"] = 2000000
    elif "第三者" in text:
        info["policy_type"] = "第三者責任"
        if info["coverage_amount"] == 0:
            info["coverage_amount"] = 2000000
    elif "港車北上" in text:
        info["policy_type"] = "港車北上"
    elif "兩地牌" in text or "两地牌" in text:
        info["policy_type"] = "兩地牌"
    else:
        info["policy_type"] = "其他"

    # ── NCB ──
    ncb_list = []
    for pat in [r"NCB\s*[:：]\s*(\d+)\s*%?", r"NCD\s*[:：]\s*(\d+)\s*%?", r"無索償折扣[：:]\s*(\d+)\s*%", r"No\s*Claim\s*Bonus[：:]*\s*(\d+)\s*%"]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            ncb_list.append(f"NCB: {m.group(1)}%")

    # ── Excesses (support HK$ and HKD) ──
    excess_map = [
        ("TPPD", r"TPPD[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)"),
        ("OD", r"(?:Own\s*Damage|OD)[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)"),
        ("THEFT", r"THEFT[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)"),
        ("YIU", r"YIU[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)"),
        ("PARKING", r"PARKING[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)"),
        ("WINDSCREEN", r"WINDSCREEN[：:]*\s*(?:HK\$|HKD)\s*([0-9,]+\.?\d*)"),
    ]
    excess_list = []
    for key, pat in excess_map:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                val = float(m.group(1).replace(",", ""))
                excess_list.append(f"{key}: HKD {val:,.0f}")
            except:
                pass

    # ── Build notes ──
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

    print(f"[PDF] Extracted {len(text)} chars, {page_count} pages")
    print(f"[PDF] Full text:\n{text}")

    results = []

    if text.strip():
        # Try page-by-page parsing first
        pages = re.split(r"\f|(?=\w+\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})", text)
        for i, page_text in enumerate(pages[:page_count]):
            if page_text.strip():
                info = parse_renewal_text(page_text, i+1)
                if info["name"] or info["license_plate"] or info["policy_number"]:
                    results.append(info)

    # Fallback: if page-by-page parsing found nothing, try the FULL text
    if not results and text.strip():
        print("[PDF] Page-by-page found nothing, trying full text...")
        info = parse_renewal_text(text, 1)
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
        elif not event_type:
            # Handle alternative event format (uuid-style events without event_type)
            # These have msg_type/message_type directly in event_data
            msg_type_alt = event_data.get("msg_type", "") or event_data.get("message_type", "")
            if msg_type_alt:
                print(f"[LARK WS] Detected message via alt format, msg_type={msg_type_alt}")
                # Wrap into the expected structure for _handle_lark_message_ws
                # If event_data already has "message" key, use it; otherwise treat event_data as the message
                if "message" not in event_data:
                    wrapped = {
                        "message": event_data,
                        "sender": event_data.get("sender", {"sender_id": {"open_id": event_data.get("open_id", "")}})
                    }
                    _handle_lark_message_ws(wrapped)
                else:
                    _handle_lark_message_ws(event_data)
            else:
                # Check if it's a message_read or other non-message event
                event_type_inner = event_data.get("type", "")
                if event_type_inner and "read" in event_type_inner:
                    pass  # silently ignore read receipts
                else:
                    print(f"[LARK WS] Unhandled event (no type, no msg_type)")
        else:
            print(f"[LARK WS] Unhandled event type: {event_type}")

    except Exception as e:
        print(f"[LARK WS] Handler error: {e}")
        traceback.print_exc()


# Deduplication: track processed message IDs to avoid duplicate processing
_processed_msg_ids = set()
_PROCESSED_MAX = 500

def _is_duplicate(msg_id):
    """Check if we've already processed this message ID."""
    if not msg_id:
        return False
    if msg_id in _processed_msg_ids:
        return True
    _processed_msg_ids.add(msg_id)
    # Trim set if too large
    if len(_processed_msg_ids) > _PROCESSED_MAX:
        # Remove oldest half (set is unordered but this bounds memory)
        to_remove = list(_processed_msg_ids)[:_PROCESSED_MAX // 2]
        for r in to_remove:
            _processed_msg_ids.discard(r)
    return False

def _handle_lark_message_ws(event_data):
    """Handle im.message.receive_v1 from WebSocket."""
    import tempfile, os as _os

    message = event_data.get("message", {})

    # Try all possible field names for message type
    msg_type = message.get("message_type", "") or message.get("msg_type", "") or message.get("type", "")
    # msg_id can be in message_id OR open_message_id (uuid-format events)
    msg_id = message.get("message_id", "") or message.get("open_message_id", "") or event_data.get("message_id", "") or event_data.get("open_message_id", "")

    # Deduplication: skip if we already processed this message
    if _is_duplicate(msg_id):
        print(f"[LARK WS] Skipping duplicate msg_id={msg_id}")
        return
    sender = event_data.get("sender", {})
    sender_id = sender.get("sender_id", {})
    open_id = sender_id.get("open_id", "") or event_data.get("open_id", "")

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
        # file_key/file_name may be in content JSON (v2 format) OR directly in event (uuid format)
        file_key = content.get("file_key", "") or message.get("file_key", "") or event_data.get("file_key", "")
        file_name = content.get("file_name", "") or message.get("file_name", "") or event_data.get("file_name", "")
        print(f"[LARK WS] file_key={file_key}, file_name={file_name}")
        print(f"[LARK WS] message keys: {list(message.keys())}")
        print(f"[LARK WS] event_data keys: {list(event_data.keys())}")

        if not file_key:
            reply("❌ 收到文件但无法获取文件标识，请重新发送。")
            return

        # If msg_id is empty (uuid-format event), look it up from chat history
        if not msg_id:
            chat_id = message.get("chat_id", "") or event_data.get("open_chat_id", "")
            if chat_id:
                try:
                    token = get_tenant_token()
                    list_resp = httpx.get(
                        f"{LARK_API_BASE}/im/v1/messages",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"container_id": chat_id, "container_id_type": "chat", "page_size": 5, "sort_type": "ByCreateTimeDesc"},
                        timeout=15
                    )
                    for item in list_resp.json().get("data", {}).get("items", []):
                        if item.get("msg_type") == "file":
                            item_content = json.loads(item.get("body", {}).get("content", "{}"))
                            if item_content.get("file_key") == file_key:
                                msg_id = item.get("message_id", "")
                                print(f"[LARK WS] Found msg_id from chat history: {msg_id}")
                                break
                except Exception as e:
                    print(f"[LARK WS] Chat history lookup failed: {e}")

            if not msg_id:
                reply("❌ 无法获取消息ID，请重新发送文件。")
                return

        # Download file
        try:
            token = get_tenant_token()
            resp = httpx.get(
                f"{LARK_API_BASE}/im/v1/messages/{msg_id}/resources/{file_key}",
                headers={"Authorization": f"Bearer {token}"},
                params={"type": "file"},
                timeout=60
            )
            print(f"[LARK WS] File download: {resp.status_code}, size={len(resp.content)}")
            if resp.status_code != 200:
                print(f"[LARK WS] Download error body: {resp.text[:300]}")
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
