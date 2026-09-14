#!/usr/bin/env python3
"""
Servidor local Cero y Medio - Barbería Moderna
Permite usar la aplicación en cualquier navegador de la PC y desde el celular en tiempo real.
"""

import http.server
import socketserver
import os
import json
import socket
import webbrowser
import threading
import time

PORT = int(os.environ.get('PORT', 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'datos_barberia.json')

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return 'localhost'

class BarberHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Habilitar CORS y no almacenar en cache para sincronización en tiempo real
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        # API de sincronización
        if self.path.startswith('/api/data'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.wfile.write(b'{}')
            return

        # Redirigir la raíz a index.html
        if self.path == '/' or self.path == '':
            self.path = '/index.html'

        return super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/data'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Silenciar logs continuos de polling para mantener la consola limpia
        if '/api/data' in args[0] and 'GET' in args[0]:
            return
        super().log_message(format, *args)

def open_browser():
    time.sleep(1)
    webbrowser.open(f'http://localhost:{PORT}')

if __name__ == '__main__':
    local_ip = get_local_ip()
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(('0.0.0.0', PORT), BarberHandler) as httpd:
        print('================================================================')
        print('          💈 CERO Y MEDIO - BARBERIA MODERNA 💈                 ')
        print('================================================================')
        print(f'\n  > En esta computadora:       http://localhost:{PORT}')
        print(f'  > Desde tu celular (WiFi):   http://{local_ip}:{PORT}\n')
        print('================================================================')
        print('  Abriendo en tu navegador... (No cierres esta ventana mientras trabajes)')
        print('================================================================\n')
        
        threading.Thread(target=open_browser, daemon=True).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServidor detenido.')
