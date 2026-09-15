# 💈 BARBERÍA "CERO Y MEDIO" - GUÍA DE DESPLIEGUE NUBE 24/7
## (Igual que en SKYNET: Render.com + Turso Cloud sin pérdida de datos)

Con esta configuración, la página web de la barbería funcionará **las 24 horas del día, los 7 días de la semana en internet**, accesible desde cualquier celular o computadora del mundo sin necesidad de tener la PC del local encendida.

Además, gracias a **Turso Cloud**, **NUNCA se perderá ningún corte, cliente o deuda**, aun si Render se reinicia o entra en reposo.

---

## 📋 PASO 1: Crear la Base de Datos en Turso Cloud (Gratis)

*(Si ya tenés cuenta en Turso creada con SKYNET, este paso te lleva 1 minuto)*

1. Abrí una terminal (PowerShell o CMD) en tu PC.
2. Si tenés el comando `turso` instalado:
   ```bash
   turso db create barberia-cero-y-medio
   ```
3. Obtené la dirección URL de la base de datos:
   ```bash
   turso db show barberia-cero-y-medio --url
   ```
   *(Te dará algo como `libsql://barberia-cero-y-medio-[tu-usuario].turso.io`)*

4. Creá el token de acceso permanente:
   ```bash
   turso db tokens create barberia-cero-y-medio
   ```
   *(Te devolverá un texto largo de clave secreta)*

> **¿No tenés la terminal de Turso?**
> Podés hacerlo directamente desde la web en **[https://turso.tech/](https://turso.tech/)**:
> 1. Iniciá sesión con tu cuenta de GitHub.
> 2. Hacé clic en **"Create Database"** y poné el nombre `barberia-cero-y-medio`.
> 3. Copiá la **Database URL** y hacé clic en **"Create Token"** para copiar el **Auth Token**.

---

## 📤 PASO 2: Migrar los Datos de tu PC a Turso Cloud

Para que la nube tenga exactamente todos tus cortes, barberos, deudas y cierres actuales:

1. Abrí la carpeta de la barbería en tu PC.
2. Ejecutá en PowerShell o CMD:
   ```bash
   python migrate_to_turso.py "TU_URL_DE_TURSO" "TU_TOKEN_DE_TURSO"
   ```
3. El script subirá automáticamente todos los datos y te mostrará:
   `[OK] MIGRACION A TURSO CLOUD COMPLETADA CON TOTAL EXITO!`

---

## 🌐 PASO 3: Desplegar en Render.com (100% Gratis)

1. Ingresá a **[https://render.com/](https://render.com/)** e iniciá sesión con tu cuenta de GitHub.
2. Hacé clic en el botón azul **New +** ➔ **Web Service**.
3. Seleccioná el repositorio: **`goleadorepico-ui/barberia-cero-y-medio`**.
4. Render detectará automáticamente el archivo `render.yaml` y configurará:
   - **Name:** `barberia-cero-y-medio`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT`
5. En la sección **Environment Variables** (Variables de Entorno), agregá:
   - **`TURSO_DATABASE_URL`**: pegá tu URL de Turso (`libsql://...`).
   - **`TURSO_AUTH_TOKEN`**: pegá tu Token de Turso.
6. Hacé clic en **Create Web Service**.
7. En 2 o 3 minutos, Render terminará de compilar y te entregará tu enlace oficial HTTPS permanente:
   👉 **`https://barberia-cero-y-medio.onrender.com`**

---

## 📱 PASO 4: ¡A Disfrutar del Sistema 24/7!

- Ese enlace `https://barberia-cero-y-medio.onrender.com` funciona desde cualquier teléfono o PC con 4G o Wi-Fi en cualquier parte del mundo.
- **Podés apagar la computadora del local por la noche o los domingos**: el sistema sigue funcionando y los turnos se pueden reservar online 24/7.
- Si abrís el sistema en la computadora del local, también se sincroniza en tiempo real con la nube.
- Para subir futuras mejoras, simplemente hacé doble clic en **`SUBIR_A_GITHUB.bat`** y Render se actualizará solo.
