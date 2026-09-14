#!/usr/bin/env python3
"""
Aplicación Flask de producción para Barbería Cero y Medio.
Compatible con Gunicorn y plataformas cloud (Render, Railway, Heroku, etc.).
Escucha en el puerto configurado en la variable de entorno PORT (por defecto 3000).
"""

import os
import json
import socket
from flask import Flask, request, jsonify, send_from_directory, make_response

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'datos_barberia.json')
PORT = int(os.environ.get('PORT', 3000))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return 'localhost'

def get_server_info():
    return {
        'publicUrl': os.environ.get('PUBLIC_URL') or None,
        'localIp': get_local_ip(),
        'port': PORT
    }

# Cabeceras CORS globales y control de caché
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

# RUTA RAÍZ -> Panel de Control
@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

# RUTAS DE TURNOS PÚBLICOS
@app.route('/turnos')
@app.route('/turnos.html')
@app.route('/reservar')
@app.route('/reserva')
def serve_turnos():
    return send_from_directory(BASE_DIR, 'turnos.html')

# API SERVER-INFO
@app.route('/api/server-info', methods=['GET', 'OPTIONS'])
def api_server_info():
    if request.method == 'OPTIONS':
        return ('', 204)
    return jsonify(get_server_info())

# API DATA (GET / POST)
@app.route('/api/data', methods=['GET', 'POST', 'OPTIONS'])
def api_data():
    if request.method == 'OPTIONS':
        return ('', 204)

    # LECTURA DE DATOS
    if request.method == 'GET':
        data = {}
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception:
                data = {}
        data['serverInfo'] = get_server_info()
        return jsonify(data)

    # GUARDADO Y SINCRONIZACIÓN
    if request.method == 'POST':
        incoming_data = request.get_json(silent=True) or {}
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

            # Cortes (fusión por ID para no pisar registros concurrentes)
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

            # Clientes (fusión por ID)
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

            # Cierres (fuente de verdad en servidor)
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

            # Turnos (gestión en tiempo real)
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

        try:
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(final_data, f, ensure_ascii=False, indent=2)
            return jsonify({'success': True, 'cortesCount': len(final_data.get('cortes', []))}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

# SERVIR ARCHIVOS ESTÁTICOS GENERALES (css, js, img, etc.)
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(BASE_DIR, filename)

if __name__ == '__main__':
    print(f"Iniciando servidor Flask en el puerto {PORT} (0.0.0.0)...")
    app.run(host='0.0.0.0', port=PORT)
