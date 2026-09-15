#!/usr/bin/env python3
"""
Cero y Medio - Barberia
Main application file (app.py)
Compatible with standard Python http.server, Flask, and Gunicorn.
Reads the PORT environment variable (default: 3000).
All code, prints, and docstrings use standard ASCII to prevent encoding errors.
"""

import os
import sys
import json
import socket
import webbrowser
import threading
import subprocess
import time
import re
import datetime
import functools

PORT = int(os.environ.get('PORT', 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'datos_barberia.json')
CLOUDFLARED = os.path.join(BASE_DIR, 'cloudflared.exe')

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return 'localhost'

LOCAL_IP = get_local_ip()
SERVER_INFO = {
    'publicUrl': os.environ.get('PUBLIC_URL') or None,
    'localIp': LOCAL_IP,
    'port': PORT
}

DATA_LOCK = threading.Lock()

def with_data_lock(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        with DATA_LOCK:
            return fn(*args, **kwargs)
    return wrapper

@with_data_lock
def process_data_update(incoming_data):
    """
    Central data processor for cortes, clientes, cierres, and turnos.
    Merges records safely with permanent tombstones to prevent resurrection.
    """
    existing_data = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
        except Exception:
            existing_data = {}

    if incoming_data.get('reset') is True:
        final_data = {
            'barberos': existing_data.get('barberos', incoming_data.get('barberos', [])),
            'servicios': existing_data.get('servicios', incoming_data.get('servicios', [])),
            'cortes': [],
            'clientes': [],
            'cierres': [],
            'turnos': [],
            'cortes_adeudados': [],
            'cierres_semanales': [],
            'deleted_cliente_ids': [],
            'deleted_corte_ids': [],
            'deleted_turno_ids': [],
            'deleted_adeudado_ids': []
        }
    else:
        final_data = dict(existing_data)
        action = incoming_data.get('action')

        deleted_cliente_ids = set(str(cid) for cid in existing_data.get('deleted_cliente_ids', []))
        deleted_corte_ids = set(str(cid) for cid in existing_data.get('deleted_corte_ids', []))
        deleted_turno_ids = set(str(tid) for tid in existing_data.get('deleted_turno_ids', []))
        deleted_adeudado_ids = set(str(aid) for aid in existing_data.get('deleted_adeudado_ids', []))

        # 1. Barberos
        if action == 'save_barberos' and 'barberos' in incoming_data:
            final_data['barberos'] = incoming_data['barberos']
        elif 'barberos' not in final_data:
            final_data['barberos'] = incoming_data.get('barberos', existing_data.get('barberos', []))

        # 2. Servicios
        if action == 'save_servicios' and 'servicios' in incoming_data:
            final_data['servicios'] = incoming_data['servicios']
        elif 'servicios' not in final_data:
            final_data['servicios'] = incoming_data.get('servicios', existing_data.get('servicios', []))

        # 3. Cortes
        if action == 'delete_corte':
            corte_id = incoming_data.get('corteId')
            if corte_id:
                deleted_corte_ids.add(str(corte_id))
            existing_cortes = existing_data.get('cortes', [])
            final_data['cortes'] = [c for c in existing_cortes if isinstance(c, dict) and str(c.get('id')) not in deleted_corte_ids and str(c.get('id')) != str(corte_id)]
        elif action == 'nuevo_corte':
            nuevo_c = incoming_data.get('corte')
            if nuevo_c and isinstance(nuevo_c, dict) and nuevo_c.get('id'):
                deleted_corte_ids.discard(str(nuevo_c['id']))
            existing_cortes = [c for c in existing_data.get('cortes', []) if isinstance(c, dict) and str(c.get('id')) not in deleted_corte_ids]
            c_map = {str(c['id']): c for c in existing_cortes if 'id' in c}
            if nuevo_c and isinstance(nuevo_c, dict) and 'id' in nuevo_c:
                c_map[str(nuevo_c['id'])] = nuevo_c
            merged_c = sorted(list(c_map.values()), key=lambda x: x.get('timestamp', 0), reverse=True)
            final_data['cortes'] = merged_c
        elif action == 'save_cortes':
            incoming_cortes = incoming_data.get('cortes', [])
            final_data['cortes'] = [c for c in incoming_cortes if isinstance(c, dict) and str(c.get('id')) not in deleted_corte_ids]
        else:
            existing_cortes = existing_data.get('cortes', [])
            final_data['cortes'] = [c for c in existing_cortes if isinstance(c, dict) and str(c.get('id')) not in deleted_corte_ids]
        final_data['deleted_corte_ids'] = list(deleted_corte_ids)

        # 4. Clientes (VIP y Membresias)
        if action == 'delete_cliente':
            cid = incoming_data.get('clienteId')
            if cid:
                deleted_cliente_ids.add(str(cid))
            existing_clientes = existing_data.get('clientes', [])
            final_data['clientes'] = [c for c in existing_clientes if isinstance(c, dict) and str(c.get('id')) not in deleted_cliente_ids and str(c.get('id')) != str(cid)]
        elif action == 'upsert_cliente':
            nuevo_cliente = incoming_data.get('cliente')
            if nuevo_cliente and isinstance(nuevo_cliente, dict) and nuevo_cliente.get('id'):
                deleted_cliente_ids.discard(str(nuevo_cliente['id']))
            incoming_clientes = incoming_data.get('clientes', [])
            if incoming_clientes:
                final_data['clientes'] = [c for c in incoming_clientes if isinstance(c, dict) and str(c.get('id')) not in deleted_cliente_ids]
            elif nuevo_cliente and isinstance(nuevo_cliente, dict):
                current_cl = [c for c in existing_data.get('clientes', []) if isinstance(c, dict) and str(c.get('id')) not in deleted_cliente_ids]
                found = False
                for idx, c in enumerate(current_cl):
                    if str(c.get('id')) == str(nuevo_cliente.get('id')):
                        current_cl[idx] = {**c, **nuevo_cliente}
                        found = True
                        break
                if not found:
                    current_cl.insert(0, nuevo_cliente)
                final_data['clientes'] = current_cl
        elif action == 'save_clientes':
            incoming_clientes = incoming_data.get('clientes', [])
            final_data['clientes'] = [c for c in incoming_clientes if isinstance(c, dict) and str(c.get('id')) not in deleted_cliente_ids]
        else:
            # En peticiones generales o de sondeo, el servidor es autoritativo y nunca resucita clientes eliminados
            existing_clientes = existing_data.get('clientes', [])
            final_data['clientes'] = [c for c in existing_clientes if isinstance(c, dict) and str(c.get('id')) not in deleted_cliente_ids]
        final_data['deleted_cliente_ids'] = list(deleted_cliente_ids)

        # 5. Cierres
        if action == 'reabrir_caja':
            fecha_reabrir = incoming_data.get('fecha')
            if fecha_reabrir:
                final_data['cierres'] = [ci for ci in existing_data.get('cierres', []) if isinstance(ci, dict) and ci.get('fecha') != fecha_reabrir]
            else:
                final_data['cierres'] = []
        elif action == 'guardar_cierre':
            cierre_nuevo = incoming_data.get('cierre')
            if cierre_nuevo and isinstance(cierre_nuevo, dict):
                cierres_restantes = [ci for ci in existing_data.get('cierres', []) if isinstance(ci, dict) and ci.get('fecha') != cierre_nuevo.get('fecha')]
                cierres_restantes.insert(0, cierre_nuevo)
                final_data['cierres'] = cierres_restantes
            else:
                final_data['cierres'] = incoming_data.get('cierres', [])
        elif action == 'delete_cierre':
            cierre_id = incoming_data.get('cierreId')
            final_data['cierres'] = [ci for ci in existing_data.get('cierres', []) if isinstance(ci, dict) and ci.get('id') != cierre_id]
        else:
            final_data['cierres'] = existing_data.get('cierres', [])

        # 6. Turnos
        existing_turnos = [t for t in existing_data.get('turnos', []) if isinstance(t, dict) and str(t.get('id')) not in deleted_turno_ids]
        if action == 'nuevo_turno':
            turno_nuevo = incoming_data.get('turno')
            if turno_nuevo and isinstance(turno_nuevo, dict):
                if turno_nuevo.get('id'):
                    deleted_turno_ids.discard(str(turno_nuevo['id']))
                t_list = [t for t in existing_turnos if str(t.get('id')) != str(turno_nuevo.get('id'))]
                t_list.insert(0, turno_nuevo)
                final_data['turnos'] = t_list
        elif action == 'cancelar_turno':
            turno_id = incoming_data.get('turnoId')
            for t in existing_turnos:
                if str(t.get('id')) == str(turno_id):
                    t['estado'] = 'cancelado'
            final_data['turnos'] = existing_turnos
        elif action == 'completar_turno':
            turno_id = incoming_data.get('turnoId')
            for t in existing_turnos:
                if str(t.get('id')) == str(turno_id):
                    t['estado'] = 'completado'
            final_data['turnos'] = existing_turnos
        elif action == 'delete_turno':
            turno_id = incoming_data.get('turnoId')
            if turno_id:
                deleted_turno_ids.add(str(turno_id))
            final_data['turnos'] = [t for t in existing_turnos if str(t.get('id')) != str(turno_id)]
        elif action == 'save_turnos':
            incoming_turnos = incoming_data.get('turnos', [])
            final_data['turnos'] = [t for t in incoming_turnos if isinstance(t, dict) and str(t.get('id')) not in deleted_turno_ids]
        else:
            final_data['turnos'] = existing_turnos
        final_data['deleted_turno_ids'] = list(deleted_turno_ids)

        # 7. Cortes Adeudados
        existing_adeudados = [a for a in existing_data.get('cortes_adeudados', []) if isinstance(a, dict) and str(a.get('id')) not in deleted_adeudado_ids]
        if action == 'nuevo_adeudado':
            nuevo_a = incoming_data.get('adeudado')
            if nuevo_a and isinstance(nuevo_a, dict) and nuevo_a.get('id'):
                deleted_adeudado_ids.discard(str(nuevo_a['id']))
                a_list = [a for a in existing_adeudados if str(a.get('id')) != str(nuevo_a.get('id'))]
                a_list.insert(0, nuevo_a)
                final_data['cortes_adeudados'] = a_list
            else:
                final_data['cortes_adeudados'] = existing_adeudados
        elif action == 'delete_adeudado':
            adeudado_id = incoming_data.get('adeudadoId')
            if adeudado_id:
                deleted_adeudado_ids.add(str(adeudado_id))
            final_data['cortes_adeudados'] = [a for a in existing_adeudados if str(a.get('id')) != str(adeudado_id)]
        elif action == 'save_adeudados':
            incoming_adeudados = incoming_data.get('cortes_adeudados', [])
            a_map = {str(a['id']): a for a in existing_adeudados if isinstance(a, dict) and 'id' in a}
            for a in incoming_adeudados:
                if isinstance(a, dict) and 'id' in a and str(a['id']) not in deleted_adeudado_ids:
                    a_map[str(a['id'])] = a
            final_data['cortes_adeudados'] = sorted(list(a_map.values()), key=lambda x: x.get('timestamp', 0), reverse=True)
        else:
            final_data['cortes_adeudados'] = existing_adeudados
        final_data['deleted_adeudado_ids'] = list(deleted_adeudado_ids)

        # 8. Cierres Semanales (Lunes a Sabado)
        existing_cierres_sem = existing_data.get('cierres_semanales', [])
        if action == 'guardar_cierre_semanal':
            nuevo_cs = incoming_data.get('cierre_semanal')
            if nuevo_cs and isinstance(nuevo_cs, dict):
                c_id = nuevo_cs.get('id')
                sem_ini = nuevo_cs.get('semanaInicio')
                sem_fin = nuevo_cs.get('semanaFin')
                filtered = [c for c in existing_cierres_sem if isinstance(c, dict) and (c.get('id') != c_id and not (c.get('semanaInicio') == sem_ini and c.get('semanaFin') == sem_fin))]
                filtered.insert(0, nuevo_cs)
                final_data['cierres_semanales'] = filtered
            else:
                final_data['cierres_semanales'] = incoming_data.get('cierres_semanales', existing_cierres_sem)
        elif action == 'delete_cierre_semanal':
            cs_id = incoming_data.get('cierreSemanalId')
            final_data['cierres_semanales'] = [c for c in existing_cierres_sem if isinstance(c, dict) and str(c.get('id')) != str(cs_id)]
        elif action == 'save_cierres_semanales':
            final_data['cierres_semanales'] = incoming_data.get('cierres_semanales', [])
        else:
            final_data['cierres_semanales'] = existing_cierres_sem

        # 9. Restauracion / Importacion de Backup
        if action == 'import_backup':
            if 'barberos' in incoming_data:
                final_data['barberos'] = incoming_data['barberos']
            if 'servicios' in incoming_data:
                final_data['servicios'] = incoming_data['servicios']
            if 'cortes' in incoming_data:
                final_data['cortes'] = incoming_data['cortes']
            if 'cierres' in incoming_data:
                final_data['cierres'] = incoming_data['cierres']
            if 'clientes' in incoming_data:
                final_data['clientes'] = incoming_data['clientes']
            if 'turnos' in incoming_data:
                final_data['turnos'] = incoming_data['turnos']
            if 'cortes_adeudados' in incoming_data:
                final_data['cortes_adeudados'] = incoming_data['cortes_adeudados']
            if 'cierres_semanales' in incoming_data:
                final_data['cierres_semanales'] = incoming_data['cierres_semanales']
            final_data['deleted_cliente_ids'] = []
            final_data['deleted_corte_ids'] = []
            final_data['deleted_turno_ids'] = []
            final_data['deleted_adeudado_ids'] = []

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    return final_data


# ----------------------------------------------------------------------
# 1. FLASK APPLICATION (Used by Gunicorn in production / cloud)
# ----------------------------------------------------------------------
try:
    from flask import Flask, request, jsonify, send_from_directory
    HAS_FLASK = True
    app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')

    @app.after_request
    def add_cors_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response

    @app.route('/')
    def flask_index():
        return send_from_directory(BASE_DIR, 'index.html')

    @app.route('/turnos')
    @app.route('/turnos.html')
    @app.route('/reservar')
    @app.route('/reserva')
    def flask_turnos():
        return send_from_directory(BASE_DIR, 'turnos.html')

    @app.route('/api/server-info', methods=['GET', 'OPTIONS'])
    def flask_server_info():
        if request.method == 'OPTIONS':
            return ('', 204)
        return jsonify(SERVER_INFO)

    @app.route('/api/data', methods=['GET', 'POST', 'OPTIONS'])
    def flask_data():
        if request.method == 'OPTIONS':
            return ('', 204)

        if request.method == 'GET':
            data = {}
            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    data = {}
            if 'cierres_semanales' not in data:
                data['cierres_semanales'] = []
            if 'caja_status' not in data:
                data['caja_status'] = {'estado': 'abierta', 'fecha': datetime.date.today().isoformat()}
            data['serverInfo'] = SERVER_INFO
            return jsonify(data)

        if request.method == 'POST':
            incoming = request.get_json(silent=True) or {}
            try:
                final_data = process_data_update(incoming)
                return jsonify({'success': True, 'cortesCount': len(final_data.get('cortes', []))}), 200
            except Exception as e:
                return jsonify({'error': str(e)}), 500

    @app.route('/<path:filename>')
    def flask_static(filename):
        return send_from_directory(BASE_DIR, filename)

except ImportError:
    HAS_FLASK = False
    app = None


# ----------------------------------------------------------------------
# 2. STANDARD LIBRARY HTTP SERVER (Zero dependencies, runs anywhere)
# ----------------------------------------------------------------------
import http.server
import socketserver

class BarberHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/server-info'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(SERVER_INFO).encode('utf-8'))
            return

        if self.path.startswith('/api/data'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            data = {}
            if os.path.exists(DATA_FILE):
                try:
                    with open(DATA_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    data = {}
            if 'cierres_semanales' not in data:
                data['cierres_semanales'] = []
            if 'caja_status' not in data:
                data['caja_status'] = {'estado': 'abierta', 'fecha': datetime.date.today().isoformat()}
            data['serverInfo'] = SERVER_INFO
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        clean_path = self.path.split('?')[0].rstrip('/')
        if clean_path in ('/turnos', '/reservar', '/reserva'):
            turnos_file = os.path.join(BASE_DIR, 'turnos.html')
            if os.path.exists(turnos_file):
                with open(turnos_file, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return

        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/data'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                incoming_data = json.loads(body)
                final_data = process_data_update(incoming_data)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'cortesCount': len(final_data.get('cortes', []))}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        try:
            if args and isinstance(args[0], str) and '/api/data' in args[0] and 'GET' in args[0]:
                return
            super().log_message(format, *args)
        except Exception:
            pass


@with_data_lock
def ejecutar_autocierre_dia(fecha_iso):
    """Genera el cierre de caja de una fecha si tiene cortes y no esta cerrada."""
    if not os.path.exists(DATA_FILE):
        return
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        cortes_del_dia = [c for c in data.get('cortes', []) if isinstance(c, dict) and c.get('fecha') == fecha_iso]
        if not cortes_del_dia:
            return

        cierres = data.get('cierres', [])
        ya_cerrado = any(isinstance(ci, dict) and ci.get('fecha') == fecha_iso for ci in cierres)
        if ya_cerrado:
            return

        barberos = data.get('barberos', [])
        total = 0
        efectivo = 0
        mp = 0
        transf = 0
        desglose = []

        for b in barberos:
            cortes_b = [c for c in cortes_del_dia if c.get('barberoId') == b.get('id')]
            subtotal_b = sum(c.get('monto', 0) for c in cortes_b)
            comision = b.get('comision', 50)
            ganancia_b = round((subtotal_b * comision) / 100)
            desglose.append({
                'barberoId': b.get('id'),
                'nombre': b.get('nombre'),
                'comision': comision,
                'cortes': len(cortes_b),
                'subtotal': subtotal_b,
                'gananciaBarbero': ganancia_b,
                'gananciaLocal': subtotal_b - ganancia_b
            })

        for c in cortes_del_dia:
            m = c.get('monto', 0)
            total += m
            pago = c.get('metodoPago', 'EFECTIVO')
            if pago == 'EFECTIVO':
                efectivo += m
            elif pago == 'MERCADOPAGO':
                mp += m
            else:
                transf += m

        nuevo_cierre = {
            'id': f"auto-cierre-{fecha_iso}",
            'fecha': fecha_iso,
            'fechaLegible': fecha_iso,
            'horaCierre': '23:59',
            'autoCierre': True,
            'totalGeneral': total,
            'totalEfectivo': efectivo,
            'totalMercadoPago': mp,
            'totalTransferencia': transf,
            'totalCortes': len(cortes_del_dia),
            'desgloseBarberos': desglose,
            'cortes': cortes_del_dia
        }

        cierres.insert(0, nuevo_cierre)
        data['cierres'] = cierres

        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"[AUTO-CIERRE] Caja del dia {fecha_iso} cerrada automaticamente a las 23:59 hs (Total: ${total}).")
    except Exception as e:
        print(f"[AUTO-CIERRE ERROR] {e}")


def auto_cash_register_daemon():
    """Hilo en segundo plano para cierre automatico a las 23:59 y apertura automatica a las 00:01."""
    import time
    from datetime import datetime, timedelta

    last_checked_minute = None

    while True:
        try:
            now = datetime.now()
            current_time_str = now.strftime('%H:%M')
            current_date_str = now.strftime('%Y-%m-%d')
            minute_key = f"{current_date_str}_{current_time_str}"

            if minute_key != last_checked_minute:
                last_checked_minute = minute_key

                # 1. Cierre automatico a las 23:59
                if current_time_str == '23:59':
                    ejecutar_autocierre_dia(current_date_str)

                # 2. Si cambio de dia y el dia anterior tenia cortes sin cerrar (ej: PC en reposo a las 23:59)
                ayer_date_str = (now - timedelta(days=1)).strftime('%Y-%m-%d')
                ejecutar_autocierre_dia(ayer_date_str)
        except Exception:
            pass

        time.sleep(20)


def run_http_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('0.0.0.0', PORT), BarberHandler) as httpd:
        httpd.serve_forever()


def start_tunnel():
    if not os.path.exists(CLOUDFLARED):
        return None, None
    log_path = os.path.join(BASE_DIR, 'tunnel.log')
    if os.path.exists(log_path):
        try:
            os.remove(log_path)
        except Exception:
            pass
    try:
        proc = subprocess.Popen(
            [CLOUDFLARED, 'tunnel', '--url', f'http://localhost:{PORT}', '--logfile', log_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        url = None
        start_time = time.time()
        while time.time() - start_time < 25:
            try:
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                matches = re.findall(r'https://[a-zA-Z0-9\-]+\.trycloudflare\.com', content)
                if matches:
                    url = matches[-1]
                    SERVER_INFO['publicUrl'] = url
                    break
            except Exception:
                pass
            time.sleep(0.5)
        return url, proc
    except Exception as e:
        print('Error starting tunnel:', e)
        return None, None


if __name__ == '__main__':
    local_ip = get_local_ip()
    SERVER_INFO['localIp'] = local_ip

    print('======================================================================')
    print('             CERO Y MEDIO - BARBERIA MODERNA                          ')
    print('======================================================================')

    # Iniciar hilo de autocierre de caja a las 23:59 y reapertura a las 00:01
    import threading
    t_auto = threading.Thread(target=auto_cash_register_daemon, daemon=True)
    t_auto.start()

    if HAS_FLASK and os.environ.get('USE_FLASK', '').lower() in ('1', 'true', 'yes'):
        print(f'Iniciando con Flask en el puerto {PORT}...')
        app.run(host='0.0.0.0', port=PORT)
    else:
        # Start tunnel if cloudflared binary is available
        public_url, tunnel_proc = start_tunnel()
        if public_url:
            SERVER_INFO['publicUrl'] = public_url
            try:
                with open(os.path.join(BASE_DIR, 'ENLACE_CELULAR.txt'), 'w', encoding='utf-8') as f:
                    f.write(f"ENLACE PARA ABRIR EN EL CELULAR O CUALQUIER DISPOSITIVO:\n\n{public_url}\n\n(Este enlace funciona desde cualquier lugar, con datos 4G o WiFi)\n")
            except Exception:
                pass

        print('======================================================================')
        print('  [OK] SISTEMA LISTO Y EN LINEA')
        print('======================================================================')
        print(f'  PC LOCAL:          http://localhost:{PORT}')
        print(f'  RED LOCAL WIFI:    http://{local_ip}:{PORT}')
        if public_url:
            print(f'  CELULAR / REMOTO:  {public_url}')
        print('======================================================================')
        print('  Presiona Ctrl+C para detener el servidor.')
        print('======================================================================\n', flush=True)

        if sys.platform.startswith('win') and sys.stdin and hasattr(sys.stdin, 'isatty') and sys.stdin.isatty():
            try:
                webbrowser.open(f'http://localhost:{PORT}')
            except Exception:
                pass

        socketserver.TCPServer.allow_reuse_address = True
        try:
            with socketserver.TCPServer(('0.0.0.0', PORT), BarberHandler) as httpd:
                httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            if tunnel_proc:
                try:
                    tunnel_proc.terminate()
                except Exception:
                    pass
            print('\nServidor detenido.')
