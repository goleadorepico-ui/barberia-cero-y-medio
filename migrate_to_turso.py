# -*- coding: utf-8 -*-
"""
Script de Migración a Turso Cloud para Barbería Cero y Medio
Sube los datos actuales de datos_barberia.json a la nube de Turso 24/7.
Uso: python migrate_to_turso.py [TURSO_DATABASE_URL] [TURSO_AUTH_TOKEN]
O definiendo las variables de entorno TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.
"""

import os
import sys
import json
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from turso_client import TursoClient, TURSO_URL_ENV, TURSO_TOKEN_ENV

def run_migration():
    print("======================================================================")
    print("        BARBERIA CERO Y MEDIO - MIGRACION A TURSO CLOUD (24/7)        ")
    print("======================================================================\n")

    url = os.environ.get(TURSO_URL_ENV)
    token = os.environ.get(TURSO_TOKEN_ENV)

    if len(sys.argv) >= 3:
        url = sys.argv[1]
        token = sys.argv[2]
        os.environ[TURSO_URL_ENV] = url
        os.environ[TURSO_TOKEN_ENV] = token

    if not url or not token:
        print("[ERROR] Faltan las credenciales de Turso.")
        print("\nPuedes ejecutarlo indicando la URL y el Token:")
        print("  python migrate_to_turso.py libsql://barberia-...-turso.io eyJhbGci...")
        print("\nO definir las variables de entorno TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.\n")
        sys.exit(1)

    print(f"[*] Conectando a Turso Cloud: {url}")
    client = TursoClient(url, token)

    try:
        ok = client.test_connection()
        if not ok:
            print("[ERROR] No se pudo verificar la conexion a Turso.")
            sys.exit(1)
        print("[OK] Conexion con Turso Cloud verificada exitosamente.\n")
    except Exception as e:
        print(f"[ERROR] Fallo la conexion a Turso Cloud: {e}")
        sys.exit(1)

    # Cargar datos locales
    json_path = os.path.join(BASE_DIR, 'datos_barberia.json')
    bak_path = os.path.join(BASE_DIR, 'datos_barberia.json.bak')
    
    local_data = None
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                local_data = json.load(f)
        except Exception:
            local_data = None

    if not local_data and os.path.exists(bak_path):
        try:
            with open(bak_path, 'r', encoding='utf-8') as f:
                local_data = json.load(f)
        except Exception:
            local_data = None

    if not local_data:
        print("[AVISO] No se encontro archivo local datos_barberia.json. Se inicializara estructura base.")
        local_data = {
            "barberos": [{"id": "barbero-1", "nombre": "Laureano", "comision": 50, "activo": True}],
            "servicios": [{"id": "srv-1", "nombre": "Corte", "precio": 15000}, {"id": "srv-2", "nombre": "Corte y Barba", "precio": 18000}],
            "cortes": [],
            "clientes": [],
            "cierres": [],
            "turnos": [],
            "cortes_adeudados": [],
            "cierres_semanales": []
        }

    barberos_count = len(local_data.get('barberos', []))
    cortes_count = len(local_data.get('cortes', []))
    adeudados_count = len(local_data.get('cortes_adeudados', []))
    cierres_count = len(local_data.get('cierres', []))
    clientes_count = len(local_data.get('clientes', []))

    print(f"[*] Datos listos para subir:")
    print(f"    - Barberos:         {barberos_count}")
    print(f"    - Cortes cargados:  {cortes_count}")
    print(f"    - Cortes adeudados: {adeudados_count}")
    print(f"    - Cierres diarios:  {cierres_count}")
    print(f"    - Clientes VIP:     {clientes_count}")

    print("\n[*] Subiendo a Turso Cloud (tabla 'barberia_storage')...")
    subido = client.save_data(local_data)
    if not subido:
        print("[ERROR] No se pudo guardar la informacion en Turso.")
        sys.exit(1)

    print("[*] Verificando lectura desde Turso Cloud...")
    verif = client.load_data()
    if not verif or len(verif.get('cortes', [])) != cortes_count:
        print("[ERROR] La verificacion de lectura fallo.")
        sys.exit(1)

    # Crear snapshot inicial
    client.create_snapshot(local_data, motivo='migracion_inicial')

    # Guardar configuracion local para que la PC tambien guarde directo en Turso
    cfg_file = os.path.join(BASE_DIR, 'turso_config.json')
    try:
        with open(cfg_file, 'w', encoding='utf-8') as f:
            json.dump({
                TURSO_URL_ENV: url,
                TURSO_TOKEN_ENV: token
            }, f, indent=2)
        print("[*] Configuracion guardada en turso_config.json para persistencia local directa.")
    except Exception as e:
        pass

    print("\n======================================================================")
    print("      MIGRACION A TURSO CLOUD COMPLETADA CON TOTAL EXITO!             ")
    print("======================================================================")
    print("Tus datos ya estan 100% seguros y respaldados en la nube 24/7.")
    print("Cada corte, deudor o cierre se guarda directamente en Turso Cloud.")
    print("Para tener la pagina online 24/7 en Render.com, configura:")
    print(f"  TURSO_DATABASE_URL = {url}")
    print(f"  TURSO_AUTH_TOKEN    = [TU_TOKEN_SECRETO]")
    print("======================================================================\n")

if __name__ == '__main__':
    run_migration()
