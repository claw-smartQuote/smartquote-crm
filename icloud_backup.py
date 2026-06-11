"""iCloud backup module for Insurance CRM database."""
import os
import shutil
import threading
from datetime import datetime
from pathlib import Path

ICLOUD_PATH = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/InsuranceCRM"
LOCAL_DB = Path(__file__).parent / "insurance.db"
STATUS_FILE = Path(__file__).parent / ".backup_status.json"

_backup_lock = threading.Lock()
_last_backup = None

def get_icloud_dir():
    ICLOUD_PATH.mkdir(parents=True, exist_ok=True)
    return ICLOUD_PATH

def get_status():
    """Return backup status dict."""
    if STATUS_FILE.exists():
        import json
        try:
            with open(STATUS_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {"last_backup": None, "status": "never"}

def save_status(data):
    import json
    with open(STATUS_FILE, "w") as f:
        json.dump(data, f)

def backup_now():
    """Copy local db to iCloud Drive."""
    global _last_backup
    with _backup_lock:
        try:
            dest = get_icloud_dir() / "insurance.db"
            shutil.copy2(LOCAL_DB, dest)
            _last_backup = datetime.now().isoformat()
            save_status({"last_backup": _last_backup, "status": "ok"})
            return True, _last_backup
        except Exception as e:
            save_status({"last_backup": _last_backup, "status": "error", "error": str(e)})
            return False, str(e)

def restore_from_icloud():
    """Restore local db from iCloud."""
    src = get_icloud_dir() / "insurance.db"
    if src.exists():
        shutil.copy2(src, LOCAL_DB)
        return True
    return False

def start_auto_backup(interval_hours=6):
    """Start a background thread that backs up every `interval_hours`."""
    import time
    def worker():
        while True:
            backup_now()
            time.sleep(interval_hours * 3600)
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return t
