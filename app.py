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

def process_data_update(incoming_data):
    """
    Central data processor for cortes, clientes, cierres, and turnos.
    Merges records safely without overwriting concurrent client changes.
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
            'cierres': []
        }
    else:
        final_data = dict(existing_data)

        # Barberos
        if 'barberos' in incoming_data and incoming_data['barberos']:
            final_data['barberos'] = incoming_data['barberos']
        elif 'barberos' not in final_data:
            final_data['barberos'] = incoming_data.get('barberos', [])

        # Servicios
        if 'servicios' in incoming_data and incoming_data['servicios']:
            final_data['servicios'] = incoming_data['servicios']
        elif 'servicios' not in final_data:
            final_data['servicios'] = incoming_data.get('servicios', [])

        # Cortes
        if incoming_data.get('action') == 'delete_corte':
            final_data['cortes'] = incoming_data.get('cortes', [])
        else:
            existing_cortes = existing_data.get('cortes', [])
            incoming_cortes = incoming_data.get('cortes', [])
            c_map = {c['id']: c for c in existing_cortes if isinstance(c, dict) and 'id' in c}
            for c in incoming_cortes:
                if isinstance(c, dict) and 'id' in c:
                    c_map[c['id']] = c
            merged_c = sorted(list(c_map.values()), key=lambda x: x.get('timestamp', 0), reverse=True)
            final_data['cortes'] = merged_c

        # Clientes
        if incoming_data.get('action') == 'delete_cliente':
            final_data['clientes'] = incoming_data.get('clientes', [])
        else:
            existing_clientes = existing_data.get('clientes', [])
            incoming_clientes = incoming_data.get('clientes', [])
            cl_map = {cl['id']: cl for cl in existing_clientes if isinstance(cl, dict) and 'id' in cl}
            for cl in incoming_clientes:
                if isinstance(cl, dict) and 'id' in cl:
                    cl_map[cl['id']] = cl
            final_data['clientes'] = list(cl_map.values())

        # Cierres
        if incoming_data.get('action') == 'reabrir_caja':
            fecha_reabrir = incoming_data.get('fecha')
            if fecha_reabrir:
                final_data['cierres'] = [ci for ci in existing_data.get('cierres', []) if isinstance(ci, dict) and ci.get('fecha') != fecha_reabrir]
            else:
                final_data['cierres'] = []
        elif incoming_data.get('action') == 'guardar_cierre':
            cierre_nuevo = incoming_data.get('cierre')
            if cierre_nuevo and isinstance(cierre_nuevo, dict):
                cierres_restantes = [ci for ci in existing_data.get('cierres', []) if isinstance(ci, dict) and ci.get('fecha') != cierre_nuevo.get('fecha')]
                cierres_restantes.insert(0, cierre_nuevo)
                final_data['cierres'] = cierres_restantes
            else:
                final_data['cierres'] = incoming_data.get('cierres', [])
        elif incoming_data.get('action') == 'delete_cierre':
            cierre_id = incoming_data.get('cierreId')
            final_data['cierres'] = [ci for ci in existing_data.get('cierres', []) if isinstance(ci, dict) and ci.get('id') != cierre_id]
        else:
            final_data['cierres'] = existing_data.get('cierres', [])

        # Turnos
        existing_turnos = existing_data.get('turnos', [])
        if incoming_data.get('action') == 'nuevo_turno':
            turno_nuevo = incoming_data.get('turno')
            if turno_nuevo and isinstance(turno_nuevo, dict):
                t_list = [t for t in existing_turnos if isinstance(t, dict) and t.get('id') != turno_nuevo.get('id')]
                t_list.insert(0, turno_nuevo)
                final_data['turnos'] = t_list
        elif incoming_data.get('action') == 'cancelar_turno':
            turno_id = incoming_data.get('turnoId')
            for t in existing_turnos:
                if isinstance(t, dict) and t.get('id') == turno_id:
                    t['estado'] = 'cancelado'
            final_data['turnos'] = existing_turnos
        elif incoming_data.get('action') == 'completar_turno':
            turno_id = incoming_data.get('turnoId')
            for t in existing_turnos:
                if isinstance(t, dict) and t.get('id') == turno_id:
                    t['estado'] = 'completado'
            final_data['turnos'] = existing_turnos
        elif incoming_data.get('action') == 'delete_turno':
            turno_id = incoming_data.get('turnoId')
            final_data['turnos'] = [t for t in existing_turnos if isinstance(t, dict) and t.get('id') != turno_id]
        elif 'turnos' in incoming_data:
            incoming_turnos = incoming_data.get('turnos', [])
            t_map = {t['id']: t for t in existing_turnos if isinstance(t, dict) and 'id' in t}
            for t in incoming_turnos:
                if isinstance(t, dict) and 'id' in t:
                    t_map[t['id']] = t
            final_data['turnos'] = list(t_map.values())
        elif 'turnos' not in final_data:
            final_data['turnos'] = existing_turnos

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

    if HAS_FLASK and os.environ.get('USE_FLASK', '').lower() in ('1', 'true', 'yes'):
        print(f'Iniciando con Flask en el puerto {PORT}...')
        app.run(host='0.0.0.0', port=PORT)
    else:
        # Start standard library HTTP server in background thread
        server_thread = threading.Thread(target=run_http_server, daemon=True)
        server_thread.start()
        time.sleep(1)

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
        print('======================================================================\n')

        # Open browser automatically if running on interactive desktop
        try:
            if sys.platform.startswith('win'):
                webbrowser.open(f'http://localhost:{PORT}')
        except Exception:
            pass

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            if tunnel_proc:
                try:
                    tunnel_proc.terminate()
                except Exception:
                    pass
            print('\nServidor detenido.')
