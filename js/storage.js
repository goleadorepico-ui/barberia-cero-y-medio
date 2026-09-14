/**
 * Capa de almacenamiento y persistencia para BarberControl (LocalStorage)
 */

const STORAGE_KEYS = {
  BARBEROS: 'barbercontrol_barberos',
  SERVICIOS: 'barbercontrol_servicios',
  CORTES: 'barbercontrol_cortes',
  CIERRES: 'barbercontrol_cierres',
  CLIENTES: 'barbercontrol_clientes',
  TURNOS: 'barbercontrol_turnos',
  CONFIG: 'barbercontrol_config',
  SESSION: 'barbercontrol_session'
};

// Helpers seguros en caso de ejecución independiente sin data.js
const _FALLBACK_BARBEROS = [
  { id: 'barbero-1', nombre: 'Laureano', foto: 'img/laureano.jpg', comision: 50, activo: true }
];

const _FALLBACK_SERVICIOS = [
  { id: 'srv-1', nombre: 'Corte', precio: 15000 },
  { id: 'srv-2', nombre: 'Corte y Barba', precio: 18000 }
];

function _safeUUID() {
  if (typeof generateUUID === 'function') return generateUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

function _safeTodayISO() {
  if (typeof getTodayISO === 'function') return getTodayISO();
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const StorageService = {
  // SESIÓN DE USUARIO
  getSession() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SESSION);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Error al leer sesión:', e);
      return null;
    }
  },

  saveSession(session) {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
  },

  clearSession() {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
  },

  // BARBEROS
  getBarberos() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BARBEROS);
      const fallback = typeof DEFAULT_BARBEROS !== 'undefined' ? DEFAULT_BARBEROS : _FALLBACK_BARBEROS;
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error('Error al leer barberos:', e);
      return typeof DEFAULT_BARBEROS !== 'undefined' ? DEFAULT_BARBEROS : _FALLBACK_BARBEROS;
    }
  },

  saveBarberos(barberos, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.BARBEROS, JSON.stringify(barberos));
    if (!skipPush) this.pushToServer({ action: 'save_barberos', barberos });
  },

  upsertBarbero(barbero) {
    const list = this.getBarberos();
    const index = list.findIndex(b => b.id === barbero.id);
    if (index >= 0) {
      list[index] = { ...list[index], ...barbero };
    } else {
      list.push({ ...barbero, id: barbero.id || _safeUUID(), activo: true });
    }
    this.saveBarberos(list);
    return list;
  },

  deleteBarbero(id) {
    const list = this.getBarberos().filter(b => b.id !== id);
    this.saveBarberos(list);
    return list;
  },

  // SERVICIOS
  getServicios() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SERVICIOS);
      const fallback = typeof DEFAULT_SERVICIOS !== 'undefined' ? DEFAULT_SERVICIOS : _FALLBACK_SERVICIOS;
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error('Error al leer servicios:', e);
      return typeof DEFAULT_SERVICIOS !== 'undefined' ? DEFAULT_SERVICIOS : _FALLBACK_SERVICIOS;
    }
  },

  saveServicios(servicios, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.SERVICIOS, JSON.stringify(servicios));
    if (!skipPush) this.pushToServer({ action: 'save_servicios', servicios });
  },

  upsertServicio(servicio) {
    const list = this.getServicios();
    const index = list.findIndex(s => s.id === servicio.id);
    if (index >= 0) {
      list[index] = { ...list[index], ...servicio };
    } else {
      list.push({ ...servicio, id: servicio.id || generateUUID() });
    }
    this.saveServicios(list);
    return list;
  },

  deleteServicio(id) {
    const list = this.getServicios().filter(s => s.id !== id);
    this.saveServicios(list);
    return list;
  },

  // CORTES (VENTAS)
  getAllCortes() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CORTES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer cortes:', e);
      return [];
    }
  },

  saveAllCortes(cortes, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.CORTES, JSON.stringify(cortes));
    if (!skipPush) this.pushToServer({ action: 'save_cortes', cortes });
  },

  getCortesHoy() {
    const today = getTodayISO();
    return this.getAllCortes().filter(c => c.fecha === today);
  },

  async addCorte(corte) {
    const all = this.getAllCortes();
    const nuevoCorte = {
      id: generateUUID(),
      fecha: corte.fecha || getTodayISO(),
      hora: corte.hora || getCurrentTime(),
      barberoId: corte.barberoId,
      barberoNombre: corte.barberoNombre,
      servicioNombre: corte.servicioNombre,
      monto: Number(corte.monto) || 0,
      metodoPago: corte.metodoPago, // 'EFECTIVO' | 'MERCADOPAGO' | 'TRANSFERENCIA'
      timestamp: Date.now()
    };
    all.unshift(nuevoCorte); // Más reciente primero
    this.saveAllCortes(all, true);
    await this.pushToServer({ action: 'nuevo_corte', corte: nuevoCorte, cortes: all });
    return nuevoCorte;
  },

  async deleteCorte(id) {
    const all = this.getAllCortes().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CORTES, JSON.stringify(all));
    await this.pushToServer({ action: 'delete_corte', corteId: id, cortes: all });
    return all;
  },

  // CIERRES DE CAJA
  getAllCierres() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CIERRES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer cierres:', e);
      return [];
    }
  },

  saveAllCierres(cierres, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.CIERRES, JSON.stringify(cierres));
    if (!skipPush) this.pushToServer();
  },

  async guardarCierre(cierreData) {
    const cierres = this.getAllCierres();
    // Si ya había un cierre para hoy, se reemplaza o actualiza
    const idx = cierres.findIndex(c => c.fecha === cierreData.fecha);
    if (idx >= 0) {
      cierres[idx] = cierreData;
    } else {
      cierres.unshift(cierreData);
    }
    this.saveAllCierres(cierres, true);
    await this.pushToServer({
      action: 'guardar_cierre',
      cierre: cierreData,
      cierres: cierres
    });
    return cierreData;
  },

  getCierreHoy() {
    const today = getTodayISO();
    return this.getAllCierres().find(c => c.fecha === today) || null;
  },

  async reabrirCajaHoy() {
    const today = getTodayISO();
    const all = this.getAllCierres().filter(c => c.fecha !== today);
    this.saveAllCierres(all, true);
    await this.pushToServer({
      action: 'reabrir_caja',
      fecha: today,
      cierres: all
    });
    return true;
  },

  // CLIENTES Y MEMBRESÍAS
  getClientes() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLIENTES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer clientes:', e);
      return [];
    }
  },

  saveClientes(clientes, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(clientes));
    if (!skipPush) this.pushToServer({ action: 'save_clientes', clientes: clientes });
  },

  getClienteById(id) {
    return this.getClientes().find(c => c.id === id) || null;
  },

  async upsertCliente(cliente) {
    const list = this.getClientes();
    const index = list.findIndex(c => c.id === cliente.id);
    let clienteGuardado;
    if (index >= 0) {
      clienteGuardado = { ...list[index], ...cliente };
      list[index] = clienteGuardado;
    } else {
      clienteGuardado = {
        id: cliente.id || generateUUID(),
        nombre: cliente.nombre,
        telefono: cliente.telefono || '',
        notas: cliente.notas || '',
        fechaAlta: cliente.fechaAlta || getTodayISO(),
        membresia: cliente.membresia || {
          activa: false,
          precioMensual: 25000,
          fechaInicio: null,
          fechaVencimiento: null,
          cortesIncluidos: 'ilimitado'
        },
        pagos: cliente.pagos || [],
        cortes: cliente.cortes || []
      };
      list.unshift(clienteGuardado);
    }
    this.saveClientes(list, true);
    await this.pushToServer({ action: 'upsert_cliente', cliente: clienteGuardado, clientes: list });
    return clienteGuardado;
  },

  async deleteCliente(id) {
    const list = this.getClientes().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(list));
    await this.pushToServer({ action: 'delete_cliente', clienteId: id, clientes: list });
    return list;
  },

  async registrarPagoMembresia(clienteId, pagoData) {
    const list = this.getClientes();
    const cliente = list.find(c => c.id === clienteId);
    if (!cliente) return null;

    const fechaPago = pagoData.fecha || getTodayISO();
    const horaPago = pagoData.hora || getCurrentTime();
    const diasValidez = Number(pagoData.diasValidez) || 30;
    const monto = Number(pagoData.monto) || 0;
    const fechaVencimiento = addDaysToDate(fechaPago, diasValidez);

    const nuevoPago = {
      id: generateUUID(),
      fecha: fechaPago,
      hora: horaPago,
      monto: monto,
      metodoPago: pagoData.metodoPago || 'EFECTIVO',
      fechaInicio: fechaPago,
      fechaVencimiento: fechaVencimiento,
      diasValidez: diasValidez,
      timestamp: Date.now()
    };

    if (!cliente.pagos) cliente.pagos = [];
    cliente.pagos.unshift(nuevoPago);

    cliente.membresia = {
      activa: true,
      precioMensual: monto,
      fechaInicio: fechaPago,
      fechaVencimiento: fechaVencimiento,
      cortesIncluidos: pagoData.cortesIncluidos || 'ilimitado'
    };

    this.saveClientes(list, true);
    await this.pushToServer({ action: 'upsert_cliente', cliente: cliente, clientes: list });

    // Registrar como movimiento de ingreso en la caja del día
    if (pagoData.registrarEnCaja !== false && monto > 0) {
      await this.addCorte({
        barberoId: 'barbero-1',
        barberoNombre: 'Laureano',
        servicioNombre: `Membresía Mensual (${cliente.nombre})`,
        monto: monto,
        metodoPago: pagoData.metodoPago || 'EFECTIVO',
        fecha: fechaPago,
        hora: horaPago,
        esMembresia: true,
        clienteId: cliente.id
      });
    }

    return cliente;
  },

  async registrarCorteMembresia(clienteId, corteData) {
    const list = this.getClientes();
    const cliente = list.find(c => c.id === clienteId);
    if (!cliente) return null;

    const fecha = corteData.fecha || getTodayISO();
    const hora = corteData.hora || getCurrentTime();
    const barberoId = corteData.barberoId || 'barbero-1';
    const barberoNombre = corteData.barberoNombre || 'Laureano';
    const servicioNombre = corteData.servicioNombre || 'Corte con Membresía';

    const corteGlobal = await this.addCorte({
      barberoId: barberoId,
      barberoNombre: barberoNombre,
      servicioNombre: `${servicioNombre} (${cliente.nombre})`,
      monto: 0,
      metodoPago: 'MEMBRESIA',
      fecha: fecha,
      hora: hora,
      clienteId: cliente.id
    });

    if (!cliente.cortes) cliente.cortes = [];
    cliente.cortes.unshift({
      id: generateUUID(),
      corteGlobalId: corteGlobal ? corteGlobal.id : null,
      fecha: fecha,
      hora: hora,
      barberoId: barberoId,
      barberoNombre: barberoNombre,
      servicioNombre: servicioNombre,
      timestamp: Date.now()
    });

    this.saveClientes(list, true);
    await this.pushToServer({ action: 'upsert_cliente', cliente: cliente, clientes: list });
    return cliente;
  },

  // ============================================================
  // TURNOS ONLINE Y RESERVAS
  // ============================================================
  getTurnos() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TURNOS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer turnos:', e);
      return [];
    }
  },

  saveTurnos(turnos, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.TURNOS, JSON.stringify(turnos));
    if (!skipPush) this.pushToServer({ action: 'save_turnos', turnos: turnos });
  },

  async agregarTurno(turnoData) {
    const turnos = this.getTurnos();
    // Validar si ya existe un turno activo en la misma fecha, horario y barbero
    const existeOcupado = turnos.some(t => 
      t.fecha === turnoData.fecha && 
      t.hora === turnoData.hora && 
      t.barberoId === turnoData.barberoId &&
      t.estado !== 'cancelado'
    );
    if (existeOcupado) {
      throw new Error('El horario seleccionado ya fue reservado por otro cliente.');
    }

    const nuevoTurno = {
      id: turnoData.id || _safeUUID(),
      fecha: turnoData.fecha,
      hora: turnoData.hora,
      horaFin: turnoData.horaFin || '',
      clienteNombre: (turnoData.clienteNombre || '').trim(),
      clienteTelefono: (turnoData.clienteTelefono || '').trim(),
      barberoId: turnoData.barberoId,
      barberoNombre: turnoData.barberoNombre,
      servicioId: turnoData.servicioId,
      servicioNombre: turnoData.servicioNombre,
      precio: Number(turnoData.precio) || 0,
      notas: (turnoData.notas || '').trim(),
      estado: turnoData.estado || 'pendiente', // 'pendiente', 'completado', 'cancelado'
      creadoEn: new Date().toISOString(),
      timestamp: Date.now()
    };

    turnos.unshift(nuevoTurno);
    turnos.sort((a, b) => (a.fecha + ' ' + a.hora).localeCompare(b.fecha + ' ' + b.hora));
    this.saveTurnos(turnos, true);

    await this.pushToServer({
      action: 'nuevo_turno',
      turno: nuevoTurno,
      turnos: turnos
    });

    return nuevoTurno;
  },

  async cancelarTurno(turnoId) {
    const turnos = this.getTurnos();
    const t = turnos.find(x => x.id === turnoId);
    if (t) {
      t.estado = 'cancelado';
      this.saveTurnos(turnos, true);
      await this.pushToServer({
        action: 'cancelar_turno',
        turnoId: turnoId,
        turnos: turnos
      });
      return true;
    }
    return false;
  },

  async completarTurno(turnoId) {
    const turnos = this.getTurnos();
    const t = turnos.find(x => x.id === turnoId);
    if (t) {
      t.estado = 'completado';
      this.saveTurnos(turnos, true);
      await this.pushToServer({
        action: 'completar_turno',
        turnoId: turnoId,
        turnos: turnos
      });
      return true;
    }
    return false;
  },

  async deleteTurno(turnoId) {
    const turnos = this.getTurnos().filter(t => t.id !== turnoId);
    this.saveTurnos(turnos, true);
    await this.pushToServer({
      action: 'delete_turno',
      turnoId: turnoId,
      turnos: turnos
    });
    return true;
  },

  getTurnosOcupados(fecha, barberoId) {
    const turnos = this.getTurnos();
    return turnos
      .filter(t => t.fecha === fecha && t.barberoId === barberoId && t.estado !== 'cancelado')
      .map(t => t.hora);
  },

  getServerInfo() {
    try {
      const data = localStorage.getItem('barbercontrol_server_info');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  // BACKUP & RESTORE
  exportBackup() {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      barberos: this.getBarberos(),
      servicios: this.getServicios(),
      cortes: this.getAllCortes(),
      cierres: this.getAllCierres(),
      clientes: this.getClientes(),
      turnos: this.getTurnos()
    };
    return JSON.stringify(backup, null, 2);
  },

  async importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.barberos) this.saveBarberos(data.barberos, true);
      if (data.servicios) this.saveServicios(data.servicios, true);
      if (data.cortes) this.saveAllCortes(data.cortes, true);
      if (data.cierres) this.saveAllCierres(data.cierres, true);
      if (data.clientes) this.saveClientes(data.clientes, true);
      if (data.turnos) this.saveTurnos(data.turnos, true);
      await this.pushToServer({
        action: 'import_backup',
        barberos: data.barberos || [],
        servicios: data.servicios || [],
        cortes: data.cortes || [],
        cierres: data.cierres || [],
        clientes: data.clientes || [],
        turnos: data.turnos || []
      });
      return true;
    } catch (e) {
      console.error('Error al importar backup:', e);
      return false;
    }
  },

  async resetAll() {
    localStorage.removeItem(STORAGE_KEYS.BARBEROS);
    localStorage.removeItem(STORAGE_KEYS.SERVICIOS);
    localStorage.removeItem(STORAGE_KEYS.CORTES);
    localStorage.removeItem(STORAGE_KEYS.CIERRES);
    localStorage.removeItem(STORAGE_KEYS.CLIENTES);
    localStorage.removeItem(STORAGE_KEYS.TURNOS);
    await this.pushToServer({ reset: true });
  },

  // SINCRONIZACIÓN CON EL SERVIDOR LOCAL (Para acceso desde celular)
  isServerAvailable() {
    return window.location.protocol.startsWith('http');
  },

  async syncWithServer() {
    if (!this.isServerAvailable()) return false;
    try {
      // Evitar cache con timestamp
      const res = await fetch('/api/data?t=' + Date.now());
      if (res.ok) {
        const remoteData = await res.json();
        if (remoteData) {
          let hasRemoteChanges = false;

          // Barberos
          if (Array.isArray(remoteData.barberos) && remoteData.barberos.length > 0) {
            const current = this.getBarberos();
            if (JSON.stringify(current) !== JSON.stringify(remoteData.barberos)) {
              this.saveBarberos(remoteData.barberos, true);
              hasRemoteChanges = true;
            }
          }

          // Servicios
          if (Array.isArray(remoteData.servicios) && remoteData.servicios.length > 0) {
            const current = this.getServicios();
            if (JSON.stringify(current) !== JSON.stringify(remoteData.servicios)) {
              this.saveServicios(remoteData.servicios, true);
              hasRemoteChanges = true;
            }
          }

          // Cortes (El servidor es la fuente central de verdad autoritativa)
          const localCortes = this.getAllCortes();
          const remoteCortes = Array.isArray(remoteData.cortes) ? remoteData.cortes : [];
          if (JSON.stringify(localCortes) !== JSON.stringify(remoteCortes)) {
            this.saveAllCortes(remoteCortes, true);
            hasRemoteChanges = true;
          }

          // Clientes (El servidor es la fuente central de verdad: evita resucitar clientes borrados)
          const localClientes = this.getClientes();
          const remoteClientes = Array.isArray(remoteData.clientes) ? remoteData.clientes : [];
          if (JSON.stringify(localClientes) !== JSON.stringify(remoteClientes)) {
            this.saveClientes(remoteClientes, true);
            hasRemoteChanges = true;
          }

          // Cierres (El servidor es la fuente central de verdad: evita resucitar cierres reabiertos)
          const localCierres = this.getAllCierres();
          const remoteCierres = Array.isArray(remoteData.cierres) ? remoteData.cierres : [];
          if (JSON.stringify(localCierres) !== JSON.stringify(remoteCierres)) {
            this.saveAllCierres(remoteCierres, true);
            hasRemoteChanges = true;
          }

          // Turnos (El servidor es la fuente central de verdad autoritativa)
          const localTurnos = this.getTurnos();
          const remoteTurnos = Array.isArray(remoteData.turnos) ? remoteData.turnos : [];
          if (JSON.stringify(localTurnos) !== JSON.stringify(remoteTurnos)) {
            this.saveTurnos(remoteTurnos, true);
            hasRemoteChanges = true;
          }

          // Informacion del servidor y tunel celular (Cloudflare & WiFi IP)
          if (remoteData.serverInfo) {
            localStorage.setItem('barbercontrol_server_info', JSON.stringify(remoteData.serverInfo));
          }

          return hasRemoteChanges;
        }
      }
    } catch (e) {
      console.warn('Servidor no disponible para sincronizacion:', e);
    }
    return false;
  },

  async pushToServer(extraPayload = {}) {
    if (!this.isServerAvailable()) return;
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(extraPayload)
      });
    } catch (e) {
      console.warn('No se pudo enviar al servidor:', e);
    }
  }
};
