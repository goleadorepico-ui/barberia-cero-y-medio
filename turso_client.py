# -*- coding: utf-8 -*-
"""
Turso Cloud Client for BarberControl (Cero y Medio)
Permite persistencia 100% en la nube (24/7) usando Turso (libSQL over HTTP).
Cero dependencias externas (usa la biblioteca estándar de Python).
"""

import os
import sys
import json
import urllib.request
import urllib.error
import re
import time

TURSO_URL_ENV = 'TURSO_DATABASE_URL'
TURSO_TOKEN_ENV = 'TURSO_AUTH_TOKEN'

def get_env_credentials():
    url = (os.environ.get(TURSO_URL_ENV) or '').strip()
    token = (os.environ.get(TURSO_TOKEN_ENV) or '').strip()
    return url, token

def is_turso_configured():
    url, token = get_env_credentials()
    return bool(url and token)

def serialize_arg(arg):
    if arg is None:
        return {"type": "null"}
    if isinstance(arg, bool):
        return {"type": "integer", "value": "1" if arg else "0"}
    if isinstance(arg, int):
        return {"type": "integer", "value": str(arg)}
    if isinstance(arg, float):
        return {"type": "float", "value": float(arg)}
    return {"type": "text", "value": str(arg)}

class TursoClient:
    def __init__(self, url=None, token=None):
        env_url, env_token = get_env_credentials()
        self.url = (url or env_url or '').strip()
        self.token = (token or env_token or '').strip()
        self.pipeline_url = self._format_pipeline_url(self.url)

    def _format_pipeline_url(self, raw_url):
        if not raw_url:
            return ''
        clean = raw_url.strip()
        if clean.startswith('libsql://'):
            clean = 'https://' + clean[9:]
        if not clean.startswith('http://') and not clean.startswith('https://'):
            clean = 'https://' + clean
        clean = clean.rstrip('/')
        if not clean.endswith('/v2/pipeline'):
            clean += '/v2/pipeline'
        return clean

    def is_valid(self):
        return bool(self.pipeline_url and self.token)

    def execute(self, sql, params=None, timeout=12):
        if not self.is_valid():
            raise RuntimeError("Turso no esta configurado. Defina TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.")

        clean_sql = re.sub(r'(!=|<>|=|is\s+not|is)\s*""', r" ''", sql.strip(), flags=re.IGNORECASE)
        stmt = {"sql": clean_sql}
        if params is not None:
            if isinstance(params, (list, tuple)):
                stmt["args"] = [serialize_arg(p) for p in params]
            elif isinstance(params, dict):
                stmt["named_args"] = [{"name": k, "value": serialize_arg(v)} for k, v in params.items()]

        payload = {
            "requests": [
                {"type": "execute", "stmt": stmt},
                {"type": "close"}
            ]
        }
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            self.pipeline_url,
            data=data_bytes,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "User-Agent": "CeroYMedio-Turso/1.0"
            }
        )

        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_json = json.loads(resp.read().decode('utf-8'))

        results = resp_json.get('results', [])
        if not results:
            return []

        first_res = results[0]
        if first_res.get('type') == 'error':
            err_msg = str(first_res.get('error', ''))
            raise RuntimeError(f"Turso Error: {err_msg}")

        result_data = first_res.get('response', {}).get('result', {})
        cols = [c['name'] for c in result_data.get('cols', [])]
        raw_rows = result_data.get('rows', [])
        
        parsed_rows = []
        for r in raw_rows:
            row_dict = {}
            for idx, cell in enumerate(r):
                col_name = cols[idx] if idx < len(cols) else f"col_{idx}"
                if isinstance(cell, dict):
                    ctype = cell.get('type')
                    val = cell.get('value')
                    if ctype == 'null' or val is None:
                        row_dict[col_name] = None
                    elif ctype == 'integer':
                        try:
                            row_dict[col_name] = int(val)
                        except Exception:
                            row_dict[col_name] = val
                    elif ctype == 'float':
                        try:
                            row_dict[col_name] = float(val)
                        except Exception:
                            row_dict[col_name] = val
                    else:
                        row_dict[col_name] = val
                else:
                    row_dict[col_name] = cell
            parsed_rows.append(row_dict)
        return parsed_rows

    def init_schema(self):
        """Crea las tablas necesarias en Turso si no existen."""
        self.execute("""
            CREATE TABLE IF NOT EXISTS barberia_storage (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS barberia_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                motivo TEXT DEFAULT 'cierre',
                data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        return True

    def load_data(self, storage_id='cero_y_medio'):
        """Carga el objeto de datos completo desde Turso Cloud."""
        try:
            self.init_schema()
            rows = self.execute("SELECT data FROM barberia_storage WHERE id = ?", [storage_id])
            if rows and rows[0].get('data'):
                return json.loads(rows[0]['data'])
            return None
        except Exception as e:
            print(f"[TURSO LOAD WARNING] No se pudo cargar desde Turso Cloud: {e}")
            return None

    def save_data(self, data_dict, storage_id='cero_y_medio'):
        """Guarda de forma persistente y permanente el estado completo en Turso Cloud."""
        try:
            self.init_schema()
            data_json = json.dumps(data_dict, ensure_ascii=False)
            self.execute("""
                INSERT INTO barberia_storage (id, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    updated_at = CURRENT_TIMESTAMP;
            """, [storage_id, data_json])
            return True
        except Exception as e:
            print(f"[TURSO SAVE ERROR] Fallo al guardar en Turso Cloud: {e}")
            return False

    def create_snapshot(self, data_dict, motivo='auto'):
        """Crea una copia inmutable de respaldo historico en Turso Cloud."""
        try:
            self.init_schema()
            data_json = json.dumps(data_dict, ensure_ascii=False)
            self.execute("""
                INSERT INTO barberia_snapshots (motivo, data, created_at)
                VALUES (?, ?, CURRENT_TIMESTAMP);
            """, [motivo, data_json])
            return True
        except Exception as e:
            print(f"[TURSO SNAPSHOT WARNING] No se pudo crear snapshot en Turso: {e}")
            return False

    def test_connection(self):
        """Prueba rápida de conectividad."""
        res = self.execute("SELECT 1 as ok;")
        return bool(res and res[0].get('ok') == 1)
