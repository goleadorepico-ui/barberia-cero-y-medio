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
  ADEUDADOS: 'barbercontrol_adeudados',
  CIERRES_SEMANALES: 'barbercontrol_cierres_semanales',
  USUARIOS: 'barbercontrol_usuarios',
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

const _FALLBACK_USUARIOS = [
  { id: 'user-laureano', nombre: 'Laureano', role: 'barbero', pin: '1313', foto: 'img/laureano.jpg', barberoId: 'barbero-1' },
  { id: 'user-jose', nombre: 'José', role: 'dueno', pin: '1812', foto: null },
  { id: 'user-diego', nombre: 'Diego', role: 'dueno', pin: '2626', foto: null }
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
  // CONTROL DE ELEMENTOS ELIMINADOS LOCALMENTE (Tombstones)
  _addLocalTombstone(entityType, id) {
    if (!id) return;
    try {
      const key = `barbercontrol_deleted_${entityType}_ids`;
      const current = JSON.parse(localStorage.getItem(key) || '[]');
      const strId = String(id);
      if (!current.includes(strId)) {
        current.push(strId);
        localStorage.setItem(key, JSON.stringify(current));
      }
    } catch (e) {}
  },

  _getLocalTombstones(entityType) {
    try {
      const key = `barbercontrol_deleted_${entityType}_ids`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  },

  _removeLocalTombstone(entityType, id) {
    if (!id) return;
    try {
      const key = `barbercontrol_deleted_${entityType}_ids`;
      const current = JSON.parse(localStorage.getItem(key) || '[]');
      const strId = String(id);
      const filtered = current.filter(x => String(x) !== strId);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {}
  },

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

  // ============================================================
  // USUARIOS Y CLAVES PIN (ADMINISTRACIÓN DE ACCESO)
  // ============================================================
  getUsuarios() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USUARIOS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error al leer usuarios:', e);
    }
    const defs = (typeof DEFAULT_USUARIOS !== 'undefined') ? DEFAULT_USUARIOS : _FALLBACK_USUARIOS;
    this.saveUsuarios(defs, true);
    return defs;
  },

  saveUsuarios(usuarios, skipPush = false) {
    try {
      localStorage.setItem(STORAGE_KEYS.USUARIOS, JSON.stringify(usuarios));
      if (!skipPush) {
        this.pushToServer({
          action: 'save_usuarios',
          usuarios
        });
      }
    } catch (e) {
      console.error('Error al guardar usuarios:', e);
    }
  },

  upsertUsuario(usuario) {
    const usuarios = this.getUsuarios();
    if (usuario.id) {
      const idx = usuarios.findIndex(u => u.id === usuario.id);
      if (idx !== -1) {
        usuarios[idx] = { ...usuarios[idx], ...usuario };
      } else {
        usuarios.push(usuario);
      }
    } else {
      usuario.id = 'user-' + _safeUUID();
      usuarios.push(usuario);
    }
    this.saveUsuarios(usuarios);
    return usuario;
  },

  deleteUsuario(id) {
    const usuarios = this.getUsuarios();
    const target = usuarios.find(u => u.id === id);
    if (!target) return false;

    // Proteger: no permitir borrar si es el único dueño
    if (target.role === 'dueno') {
      const dueñosRestantes = usuarios.filter(u => u.role === 'dueno' && u.id !== id);
      if (dueñosRestantes.length === 0) {
        throw new Error('Debe quedar al menos un dueño registrado en el sistema.');
      }
    }

    const filtrados = usuarios.filter(u => u.id !== id);
    this.saveUsuarios(filtrados);
    return true;
  },

  cambiarPinUsuario(id, nuevoPin) {
    const usuarios = this.getUsuarios();
    const u = usuarios.find(item => item.id === id);
    if (!u) return false;
    u.pin = String(nuevoPin).trim();
    this.saveUsuarios(usuarios);
    return true;
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
    this._removeLocalTombstone('corte', nuevoCorte.id);
    all.unshift(nuevoCorte); // Más reciente primero
    this.saveAllCortes(all, true);
    await this.pushToServer({ action: 'nuevo_corte', corte: nuevoCorte, cortes: all });
    return nuevoCorte;
  },

  async deleteCorte(id) {
    this._addLocalTombstone('corte', id);
    const all = this.getAllCortes().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CORTES, JSON.stringify(all));
    await this.pushToServer({ action: 'delete_corte', corteId: id, cortes: all, deleted_corte_ids: this._getLocalTombstones('corte') });
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

  // ============================================================
  // CIERRES SEMANALES (LUNES A SÁBADO)
  // ============================================================
  getAllCierresSemanales() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CIERRES_SEMANALES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer cierres semanales:', e);
      return [];
    }
  },

  saveAllCierresSemanales(cierres, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.CIERRES_SEMANALES, JSON.stringify(cierres));
    if (!skipPush) this.pushToServer({ action: 'save_cierres_semanales', cierres_semanales: cierres });
  },

  async guardarCierreSemanal(cierreData) {
    const list = this.getAllCierresSemanales();
    const idx = list.findIndex(c => c.id === cierreData.id || (c.semanaInicio === cierreData.semanaInicio && c.semanaFin === cierreData.semanaFin));
    if (idx >= 0) {
      list[idx] = cierreData;
    } else {
      list.unshift(cierreData);
    }
    this.saveAllCierresSemanales(list, true);
    await this.pushToServer({
      action: 'guardar_cierre_semanal',
      cierre_semanal: cierreData,
      cierres_semanales: list
    });
    return cierreData;
  },

  async deleteCierreSemanal(id) {
    const list = this.getAllCierresSemanales().filter(c => c.id !== id);
    this.saveAllCierresSemanales(list, true);
    await this.pushToServer({
      action: 'delete_cierre_semanal',
      cierreSemanalId: id,
      cierres_semanales: list
    });
    return list;
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
    if (clienteGuardado && clienteGuardado.id) this._removeLocalTombstone('cliente', clienteGuardado.id);
    this.saveClientes(list, true);
    await this.pushToServer({ action: 'upsert_cliente', cliente: clienteGuardado, clientes: list });
    return clienteGuardado;
  },

  async deleteCliente(id) {
    this._addLocalTombstone('cliente', id);
    const list = this.getClientes().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(list));
    await this.pushToServer({ action: 'delete_cliente', clienteId: id, clientes: list, deleted_cliente_ids: this._getLocalTombstones('cliente') });
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

    this._removeLocalTombstone('turno', nuevoTurno.id);
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
    this._addLocalTombstone('turno', turnoId);
    const turnos = this.getTurnos().filter(t => t.id !== turnoId);
    this.saveTurnos(turnos, true);
    await this.pushToServer({
      action: 'delete_turno',
      turnoId: turnoId,
      turnos: turnos,
      deleted_turno_ids: this._getLocalTombstones('turno')
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

  getCloudStatus() {
    try {
      const data = localStorage.getItem('barbercontrol_cloud_status');
      return data ? JSON.parse(data) : { active: false, status: 'local', label: 'Almacenamiento Local' };
    } catch (e) {
      return { active: false, status: 'local', label: 'Almacenamiento Local' };
    }
  },

  // ============================================================
  // CORTES ADEUDADOS (CUENTAS CORRIENTES / FIADOS)
  // ============================================================
  getAdeudados() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ADEUDADOS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error al leer cortes adeudados:', e);
      return [];
    }
  },

  saveAdeudados(adeudados, skipPush = false) {
    localStorage.setItem(STORAGE_KEYS.ADEUDADOS, JSON.stringify(adeudados));
    if (!skipPush) this.pushToServer({ action: 'save_adeudados', cortes_adeudados: adeudados });
  },

  async agregarAdeudado(data) {
    const list = this.getAdeudados();
    const nuevoAdeudado = {
      id: data.id || _safeUUID(),
      clienteNombre: (data.clienteNombre || '').trim(),
      clienteTelefono: (data.clienteTelefono || '').trim(),
      barberoId: data.barberoId || 'barbero-1',
      barberoNombre: data.barberoNombre || 'Laureano',
      servicioNombre: data.servicioNombre || 'Corte',
      monto: Number(data.monto) || 0,
      fecha: data.fecha || _safeTodayISO(),
      hora: data.hora || (typeof getCurrentTime === 'function' ? getCurrentTime() : '12:00'),
      notas: (data.notas || '').trim(),
      timestamp: Date.now()
    };
    this._removeLocalTombstone('adeudado', nuevoAdeudado.id);
    list.unshift(nuevoAdeudado);
    this.saveAdeudados(list, true);
    await this.pushToServer({
      action: 'nuevo_adeudado',
      adeudado: nuevoAdeudado,
      cortes_adeudados: list
    });
    return nuevoAdeudado;
  },

  async deleteAdeudado(id) {
    this._addLocalTombstone('adeudado', id);
    const list = this.getAdeudados().filter(a => a.id !== id);
    this.saveAdeudados(list, true);
    await this.pushToServer({
      action: 'delete_adeudado',
      adeudadoId: id,
      cortes_adeudados: list,
      deleted_adeudado_ids: this._getLocalTombstones('adeudado')
    });
    return list;
  },

  async marcarAdeudadoPagado(id, cobroData) {
    const list = this.getAdeudados();
    const adeudado = list.find(a => a.id === id);
    if (!adeudado) return null;

    const monto = Number(cobroData.monto !== undefined ? cobroData.monto : adeudado.monto) || 0;
    const metodoPago = cobroData.metodoPago || 'EFECTIVO';
    const fecha = cobroData.fecha || _safeTodayISO();
    const hora = cobroData.hora || (typeof getCurrentTime === 'function' ? getCurrentTime() : '12:00');

    // Registrar formalmente en la caja del dia (ahora si suma a los totales y al barbero)
    const corte = await this.addCorte({
      barberoId: cobroData.barberoId || adeudado.barberoId,
      barberoNombre: cobroData.barberoNombre || adeudado.barberoNombre,
      servicioNombre: `${adeudado.servicioNombre || 'Corte'} (Adeudado - ${adeudado.clienteNombre})`,
      monto: monto,
      metodoPago: metodoPago,
      fecha: fecha,
      hora: hora
    });

    // Eliminar de la lista de adeudados
    await this.deleteAdeudado(id);

    return corte;
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
      turnos: this.getTurnos(),
      adeudados: this.getAdeudados(),
      cierres_semanales: this.getAllCierresSemanales()
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
      if (data.adeudados) this.saveAdeudados(data.adeudados, true);
      if (data.cierres_semanales) this.saveAllCierresSemanales(data.cierres_semanales, true);
      await this.pushToServer({
        action: 'import_backup',
        barberos: data.barberos || [],
        servicios: data.servicios || [],
        cortes: data.cortes || [],
        cierres: data.cierres || [],
        clientes: data.clientes || [],
        turnos: data.turnos || [],
        cortes_adeudados: data.adeudados || [],
        cierres_semanales: data.cierres_semanales || []
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
    localStorage.removeItem(STORAGE_KEYS.ADEUDADOS);
    localStorage.removeItem(STORAGE_KEYS.CIERRES_SEMANALES);
    localStorage.removeItem('barbercontrol_deleted_corte_ids');
    localStorage.removeItem('barbercontrol_deleted_cliente_ids');
    localStorage.removeItem('barbercontrol_deleted_turno_ids');
    localStorage.removeItem('barbercontrol_deleted_adeudado_ids');
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

          // Cortes: Fusión inteligente bidireccional protegida contra pérdidas
          const localCortes = this.getAllCortes();
          const remoteCortes = Array.isArray(remoteData.cortes) ? remoteData.cortes : [];
          const deletedCorteIds = new Set([
            ...(remoteData.deleted_corte_ids || []).map(String),
            ...this._getLocalTombstones('corte').map(String)
          ]);

          const localCortesValidos = localCortes.filter(c => c && c.id && !deletedCorteIds.has(String(c.id)));
          const remoteCortesValidos = remoteCortes.filter(c => c && c.id && !deletedCorteIds.has(String(c.id)));

          const cortesMap = new Map();
          remoteCortesValidos.forEach(c => cortesMap.set(String(c.id), c));

          let hayCortesLocalesNoSubidos = false;
          localCortesValidos.forEach(c => {
            if (!cortesMap.has(String(c.id))) {
              cortesMap.set(String(c.id), c);
              hayCortesLocalesNoSubidos = true;
            }
          });

          const mergedCortes = Array.from(cortesMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

          if (JSON.stringify(localCortes) !== JSON.stringify(mergedCortes)) {
            this.saveAllCortes(mergedCortes, true);
            hasRemoteChanges = true;
          }

          if (hayCortesLocalesNoSubidos) {
            this.pushToServer({
              action: 'save_cortes',
              cortes: mergedCortes,
              deleted_corte_ids: Array.from(deletedCorteIds)
            });
          }

          // Clientes: Fusión inteligente protegida contra borrado accidental
          const localClientes = this.getClientes();
          const remoteClientes = Array.isArray(remoteData.clientes) ? remoteData.clientes : [];
          const deletedClienteIds = new Set([
            ...(remoteData.deleted_cliente_ids || []).map(String),
            ...this._getLocalTombstones('cliente').map(String)
          ]);

          const localClientesValidos = localClientes.filter(c => c && c.id && !deletedClienteIds.has(String(c.id)));
          const remoteClientesValidos = remoteClientes.filter(c => c && c.id && !deletedClienteIds.has(String(c.id)));

          const clientesMap = new Map();
          remoteClientesValidos.forEach(c => clientesMap.set(String(c.id), c));

          let hayClientesLocalesNoSubidos = false;
          localClientesValidos.forEach(c => {
            if (!clientesMap.has(String(c.id))) {
              clientesMap.set(String(c.id), c);
              hayClientesLocalesNoSubidos = true;
            }
          });

          const mergedClientes = Array.from(clientesMap.values());

          if (JSON.stringify(localClientes) !== JSON.stringify(mergedClientes)) {
            this.saveClientes(mergedClientes, true);
            hasRemoteChanges = true;
          }

          if (hayClientesLocalesNoSubidos) {
            this.pushToServer({
              action: 'save_clientes',
              clientes: mergedClientes,
              deleted_cliente_ids: Array.from(deletedClienteIds)
            });
          }

          // Cierres de caja (Diarios)
          const localCierres = this.getAllCierres();
          const remoteCierres = Array.isArray(remoteData.cierres) ? remoteData.cierres : [];
          if (remoteData.cierres && JSON.stringify(localCierres) !== JSON.stringify(remoteCierres)) {
            this.saveAllCierres(remoteCierres, true);
            hasRemoteChanges = true;
          }

          // Cierres Semanales: Fusión inteligente
          const localCierresSemanales = this.getAllCierresSemanales();
          const remoteCierresSemanales = Array.isArray(remoteData.cierres_semanales) ? remoteData.cierres_semanales : [];
          const csMap = new Map();
          remoteCierresSemanales.forEach(cs => cs && cs.id && csMap.set(String(cs.id), cs));
          let hayCsLocalesNoSubidos = false;
          localCierresSemanales.forEach(cs => {
            if (cs && cs.id && !csMap.has(String(cs.id))) {
              csMap.set(String(cs.id), cs);
              hayCsLocalesNoSubidos = true;
            }
          });
          const mergedCs = Array.from(csMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          if (JSON.stringify(localCierresSemanales) !== JSON.stringify(mergedCs)) {
            this.saveAllCierresSemanales(mergedCs, true);
            hasRemoteChanges = true;
          }
          if (hayCsLocalesNoSubidos) {
            this.pushToServer({ action: 'save_cierres_semanales', cierres_semanales: mergedCs });
          }

          // Turnos: Fusión inteligente protegida contra borrado accidental
          const localTurnos = this.getTurnos();
          const remoteTurnos = Array.isArray(remoteData.turnos) ? remoteData.turnos : [];
          const deletedTurnoIds = new Set([
            ...(remoteData.deleted_turno_ids || []).map(String),
            ...this._getLocalTombstones('turno').map(String)
          ]);

          const localTurnosValidos = localTurnos.filter(t => t && t.id && !deletedTurnoIds.has(String(t.id)));
          const remoteTurnosValidos = remoteTurnos.filter(t => t && t.id && !deletedTurnoIds.has(String(t.id)));

          const turnosMap = new Map();
          remoteTurnosValidos.forEach(t => turnosMap.set(String(t.id), t));

          let hayTurnosLocalesNoSubidos = false;
          localTurnosValidos.forEach(t => {
            if (!turnosMap.has(String(t.id))) {
              turnosMap.set(String(t.id), t);
              hayTurnosLocalesNoSubidos = true;
            }
          });

          const mergedTurnos = Array.from(turnosMap.values());

          if (JSON.stringify(localTurnos) !== JSON.stringify(mergedTurnos)) {
            this.saveTurnos(mergedTurnos, true);
            hasRemoteChanges = true;
          }

          if (hayTurnosLocalesNoSubidos) {
            this.pushToServer({
              action: 'save_turnos',
              turnos: mergedTurnos,
              deleted_turno_ids: Array.from(deletedTurnoIds)
            });
          }

          // Cortes Adeudados: Fusión inteligente protegida contra borrado accidental
          const localAdeudados = this.getAdeudados();
          const remoteAdeudados = Array.isArray(remoteData.cortes_adeudados) ? remoteData.cortes_adeudados : [];
          const deletedAdeudadoIds = new Set([
            ...(remoteData.deleted_adeudado_ids || []).map(String),
            ...this._getLocalTombstones('adeudado').map(String)
          ]);

          // 1. Filtrar deudas que ya fueron cobradas o borradas en el servidor o localmente
          const localValidos = localAdeudados.filter(a => a && a.id && !deletedAdeudadoIds.has(String(a.id)));
          const remoteValidos = remoteAdeudados.filter(a => a && a.id && !deletedAdeudadoIds.has(String(a.id)));

          // 2. Mapa unificado por ID (los remotos tienen prioridad de actualización, pero lo local pendiente jamás se borra)
          const adeudadosMap = new Map();
          remoteValidos.forEach(a => adeudadosMap.set(String(a.id), a));

          let hayLocalesNoSubidos = false;
          localValidos.forEach(a => {
            if (!adeudadosMap.has(String(a.id))) {
              adeudadosMap.set(String(a.id), a);
              hayLocalesNoSubidos = true;
            }
          });

          const mergedAdeudados = Array.from(adeudadosMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

          if (JSON.stringify(localAdeudados) !== JSON.stringify(mergedAdeudados)) {
            this.saveAdeudados(mergedAdeudados, true);
            hasRemoteChanges = true;
          }

          // Si el cliente tenía deudas locales que el servidor aún no tiene en su archivo, respaldarlas de inmediato
          if (hayLocalesNoSubidos) {
            this.pushToServer({
              action: 'save_adeudados',
              cortes_adeudados: mergedAdeudados,
              deleted_adeudado_ids: Array.from(deletedAdeudadoIds)
            });
          }

          // Usuarios y Claves: Fusión segura
          if (Array.isArray(remoteData.usuarios) && remoteData.usuarios.length > 0) {
            const currentUsuarios = this.getUsuarios();
            if (JSON.stringify(currentUsuarios) !== JSON.stringify(remoteData.usuarios)) {
              this.saveUsuarios(remoteData.usuarios, true);
              hasRemoteChanges = true;
            }
          }

          // Informacion del servidor y tunel celular (Cloudflare & WiFi IP)
          if (remoteData.serverInfo) {
            localStorage.setItem('barbercontrol_server_info', JSON.stringify(remoteData.serverInfo));
          }
          if (remoteData.cloudStatus) {
            localStorage.setItem('barbercontrol_cloud_status', JSON.stringify(remoteData.cloudStatus));
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
