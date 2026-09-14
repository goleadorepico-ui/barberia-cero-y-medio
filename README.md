# 💈 Cero y Medio - Control de Cortes y Cierre de Caja

Sistema web ágil, moderno e intuitivo para barberías. Permite registrar cortes en segundos, contabilizar la actividad de cada barbero, discriminar los cobros en **Efectivo** y **Mercado Pago**, y realizar el **cierre de caja diario automático**.

---

## 🚀 ¿Cómo empezar a usarlo?

Tienes dos formas súper sencillas:

### Opción 1: Apertura Directa (Recomendada y sin instalar nada)
- Simplemente haz doble clic sobre el archivo **`iniciar.bat`** o sobre **`index.html`**.
- Se abrirá inmediatamente en tu navegador favorito (Chrome, Edge, Brave, etc.).
- ¡Listo para usar! Todos los datos se guardan de forma permanente y segura en tu navegador.

### Opción 2: Compartir con Celulares por WiFi (Con Node.js)
Si quieres que cada barbero registre los cortes desde su propio celular conectado a la red WiFi de la barbería:
1. Abre la terminal en esta carpeta.
2. Ejecuta:
   ```bash
   npm start
   ```
3. La consola te mostrará una dirección (por ejemplo `http://192.168.1.50:3000`).
4. Abre esa dirección en los navegadores de los teléfonos de los barberos.

---

## ✨ Características Principales

### 1. ✂️ Cargar Corte (Mostrador Rápido)
- **Servicio y precio sugerido**:
  - ✂️ **Corte**: $15.000
  - 💈 **Corte y Barba**: $18.000
  - *(Monto editable al instante si se requiere)*
- **Medio de pago con 1 toque:**
  - 💵 **Efectivo** (Caja física)
  - 📱 **Mercado Pago** (QR / App)
- **Horario automático** en tiempo real.
- **Botón de registro rápido** (soporta atajo `Ctrl + Enter`).
- Confirmación visual con confeti y lista de actividad reciente.

### 2. 📊 Caja del Día & Cierre Automático
- Tarjetas en tiempo real:
  - **Total Efectivo hoy** (dinero físico en el cajón).
  - **Total Mercado Pago** (dinero digital en la app).
  - **Total Recaudado y total de cortes**.
  - **Ticket promedio**.
- Tabla interactiva con el detalle de cada corte con opción de borrar ante equivocaciones.
- **Botón "Cerrar Caja del Día":**
  - Arqueo completo del día.
  - Desglose por barbero: cortes hechos y dinero total generado.
  - Botón **"Enviar por WhatsApp"** para mandar el resumen al dueño o al grupo de trabajo con formato listo.
  - Botón **"Imprimir Ticket"** compatible con impresoras térmicas y PDF.

### 3. 👥 Rendimiento de Barberos
- Consulta por **Hoy**, **Esta semana**, **Este mes** o **Histórico completo**.
- Conteo de cortes y recaudación total en Efectivo y Mercado Pago.

### 4. 📅 Historial de Cajas Anteriores
- Registro histórico de todos los días cerrados.
- Filtro por fecha para auditar cualquier día del mes.

### 5. ⚙️ Configuración y Copias de Seguridad
- Agregar, editar o desactivar barberos y definir sus porcentajes.
- Agregar o modificar tipos de corte y precios base.
- **Descargar copia de seguridad (JSON)** para resguardar tus datos o migrarlos a otra PC.
