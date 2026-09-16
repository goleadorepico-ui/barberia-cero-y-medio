/**
 * BarberControl - Lógica principal de la aplicación
 */

// Estado global de la aplicación
let appState = {
  selectedBarberoId: null,
  selectedServicioId: null,
  selectedServicioNombre: 'Corte',
  selectedClienteMembresiaId: null,
  currentTab: 'tab-registro'
};

// Inicialización cuando carga el DOM
document.addEventListener('DOMContentLoaded', async () => {
  initLiveClock();

  // PRIMERO: Traer los datos y cortes existentes del servidor antes de renderizar
  if (StorageService.isServerAvailable()) {
    await StorageService.syncWithServer();
  }

  initDefaultsIfEmpty();
  setupInitialForm();
  renderAllViews();
  initAuth();

  // Actualización periódica en segundo plano cada 3 segundos (para ver cortes en vivo desde cualquier celular)
  if (StorageService.isServerAvailable()) {
    setInterval(async () => {
      const hasChanges = await StorageService.syncWithServer();
      if (hasChanges) {
        renderAllViews();
      }
    }, 3000);
  }

  // Atajo de teclado: Enter para registrar corte si no está en un textarea/modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      const form = document.getElementById('formCorte');
      if (form) form.requestSubmit();
    }
  });
});

// Inicializar datos si es primera vez o actualizar al barbero Laureano y servicios vigentes
function initDefaultsIfEmpty() {
  const currentBarberos = StorageService.getBarberos();
  // Si no hay barberos o si quedaron los de prueba previos o Laureano no tiene foto, actualizar localmente sin sobreescribir servidor
  if (!localStorage.getItem(STORAGE_KEYS.BARBEROS) || currentBarberos.some(b => b.nombre === 'Lucas' || b.nombre === 'Mateo') || (currentBarberos.length === 1 && !currentBarberos[0].foto)) {
    StorageService.saveBarberos(DEFAULT_BARBEROS, true);
  }
  
  const currentServicios = StorageService.getServicios();
  // Si no hay servicios o si quedaron los anteriores (Corte Clásico, Fade, etc.), actualizar localmente
  if (!localStorage.getItem(STORAGE_KEYS.SERVICIOS) || currentServicios.some(s => s.nombre === 'Corte Clásico' || s.nombre === 'Corte Fade / Degradé')) {
    StorageService.saveServicios(DEFAULT_SERVICIOS, true);
  }
}

// Reloj digital y fecha en vivo
function initLiveClock() {
  const dateEl = document.getElementById('currentDateDisplay');
  const clockEl = document.getElementById('liveTimeClock');
  const inputHorario = document.getElementById('inputHorario');

  function update() {
    const now = new Date();
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('es-AR');
    }
    // Si el input de horario está vacío, poner la hora actual
    if (inputHorario && !inputHorario.value) {
      inputHorario.value = getCurrentTime();
    }

    // Comprobación de auto-cierre a las 23:59 y auto-apertura a las 00:01
    const hours = now.getHours();
    const mins = now.getMinutes();
    const secs = now.getSeconds();
    if ((hours === 23 && mins === 59 && secs === 1) || (hours === 0 && mins === 1 && secs === 1)) {
      if (typeof syncWithServer === 'function') {
        syncWithServer();
      }
    }
  }

  update();
  setInterval(update, 1000);
}

// Navegación entre Pestañas
function switchTab(tabId) {
  const session = StorageService.getSession();
  if (session && session.role !== 'dueno') {
    if (tabId === 'tab-config' || tabId === 'tab-historial' || tabId === 'tab-semanal') {
      showToast('Esta sección es exclusiva de la administración (Dueños).', 'error');
      return;
    }
  }

  appState.currentTab = tabId;

  // Ocultar todas las secciones
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.add('hidden');
    section.classList.remove('block');
  });

  // Mostrar la seleccionada
  const target = document.getElementById(tabId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('block');
  }

  // Actualizar estado botones de navegación
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById('btn-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Refrescar vistas correspondientes
  if (tabId === 'tab-turnos') {
    renderTabTurnos();
  } else if (tabId === 'tab-diario') {
    renderTabDiario();
  } else if (tabId === 'tab-adeudados') {
    renderTabAdeudados();
  } else if (tabId === 'tab-clientes') {
    renderTabClientes();
  } else if (tabId === 'tab-barberos') {
    actualizarLiquidacionesBarberos();
  } else if (tabId === 'tab-historial') {
    renderHistorialCierres();
  } else if (tabId === 'tab-semanal') {
    renderTabSemanal();
  } else if (tabId === 'tab-config') {
    renderConfigTab();
  }

  // Asegurar que el estado de la caja se mantenga coherente en todas las solapas
  checkCajaStatus();

  // Re-inicializar iconos de Lucide
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Renderizar todo
function renderAllViews() {
  renderBarberosSelector();
  renderServiciosSelector();
  renderSelectClientesMembresiaCorte();
  renderRecentCuts();
  renderTabDiario();
  renderTabClientes();
  actualizarBadgeTurnos();
  actualizarBadgeAdeudados();
  if (appState.currentTab === 'tab-turnos') {
    renderTabTurnos();
  } else if (appState.currentTab === 'tab-adeudados') {
    renderTabAdeudados();
  } else if (appState.currentTab === 'tab-semanal') {
    renderTabSemanal();
  }
  actualizarHeaderTotals();
  checkCajaStatus();
  actualizarBadgeTurso();
  const currentSession = StorageService.getSession();
  if (currentSession && currentSession.role) {
    applyRolePermissions(currentSession.role);
  }
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Estado y control de la caja (Abierta / Cerrada)
function checkCajaStatus() {
  const badge = document.getElementById('cajaStatusBadge');
  const panelShortcut = document.getElementById('panelEstadoCajaShortcut');
  const bannerDiario = document.getElementById('cajaCerradaBannerTabDiario');
  const accionesDiario = document.getElementById('cajaAccionesTabDiario');
  const cierreHoy = StorageService.getCierreHoy();

  if (cierreHoy) {
    // 1. Header Badge: advertencia de cerrada con botón para abrir
    if (badge) {
      badge.className = 'text-xs px-2.5 py-1 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 cursor-pointer hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40 transition-all group';
      badge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-red-400 group-hover:bg-emerald-400 transition-colors"></span>
        <span>Caja Cerrada</span>
        <span class="bg-red-500/30 group-hover:bg-emerald-500/40 text-white text-[10px] px-1.5 py-0.5 rounded ml-1 font-semibold flex items-center gap-1">
          <i data-lucide="unlock" class="w-3 h-3"></i> Abrir
        </span>
      `;
      badge.onclick = () => confirmarAbrirCaja();
      badge.title = 'Haz clic para reabrir la caja del día';
    }

    // 2. Shortcut lateral en Tab 1 (Cargar Corte)
    if (panelShortcut) {
      panelShortcut.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="p-3 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30">
            <i data-lucide="lock" class="w-6 h-6"></i>
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-bold text-white">Caja Cerrada</h4>
              <span class="text-[10px] text-red-400 font-bold bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full">
                ${cierreHoy.horaCierre ? cierreHoy.horaCierre + ' hs' : 'Hoy'}
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-1">La caja fue cerrada. Puedes abrirla en cualquier momento para seguir registrando cortes.</p>
            <div class="mt-3 flex flex-col sm:flex-row gap-2">
              <button onclick="confirmarAbrirCaja()" class="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/25">
                <i data-lucide="unlock" class="w-3.5 h-3.5"></i>
                <span>Abrir Caja</span>
              </button>
              <button onclick="openModalCierreCaja()" class="py-2 px-3 bg-brand-dark hover:bg-brand-cardHover border border-brand-border text-gray-300 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                <span>Ver Cierre</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // 3. Banner superior en Tab 2 (Caja del Día)
    if (bannerDiario) {
      bannerDiario.innerHTML = `
        <div class="bg-gradient-to-r from-amber-500/15 via-red-500/10 to-amber-500/15 border border-amber-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg mb-6">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-amber-500/20 text-brand-gold border border-amber-500/30 flex-shrink-0">
              <i data-lucide="lock" class="w-5 h-5 text-amber-400"></i>
            </div>
            <div>
              <h4 class="text-sm font-bold text-white flex items-center gap-2">
                La caja del día de hoy fue cerrada ${cierreHoy.horaCierre ? 'a las ' + cierreHoy.horaCierre + ' hs' : ''}
              </h4>
              <p class="text-xs text-gray-300">Si necesitas seguir atendiendo clientes o registrar nuevos cortes, abre la caja nuevamente con 1 clic.</p>
            </div>
          </div>
          <button onclick="confirmarAbrirCaja()" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition-all">
            <i data-lucide="unlock" class="w-4 h-4"></i>
            <span>Abrir Caja de Hoy</span>
          </button>
        </div>
      `;
    }

    // 4. Botones de acción en tabla de Tab 2
    if (accionesDiario) {
      accionesDiario.innerHTML = `
        <button onclick="exportarCortesHoyCSV()" class="px-3 py-2 bg-brand-dark hover:bg-brand-cardHover border border-brand-border rounded-xl text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-1.5">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Exportar Excel</span>
        </button>
        <button onclick="openModalCierreCaja()" class="px-3 py-2 bg-brand-dark hover:bg-brand-cardHover border border-brand-border rounded-xl text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-1.5">
          <i data-lucide="file-text" class="w-4 h-4"></i>
          <span>Ver Cierre</span>
        </button>
        <button onclick="confirmarAbrirCaja()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-1.5">
          <i data-lucide="unlock" class="w-4 h-4"></i>
          <span>Abrir Caja</span>
        </button>
      `;
    }

  } else {
    // Caja Abierta
    // 1. Header Badge: verde
    if (badge) {
      badge.className = 'text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5';
      badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Caja Abierta';
      badge.onclick = null;
      badge.title = 'Caja abierta y operando con normalidad';
    }

    // 2. Shortcut lateral en Tab 1
    if (panelShortcut) {
      panelShortcut.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="p-3 rounded-xl bg-amber-500/10 text-brand-gold border border-amber-500/20">
            <i data-lucide="shield-check" class="w-6 h-6"></i>
          </div>
          <div class="flex-1">
            <h4 class="text-sm font-bold text-white">¿Terminó la jornada?</h4>
            <p class="text-xs text-gray-400 mt-0.5">El sistema hace el balance automático de efectivo vs Mercado Pago.</p>
            <button onclick="openModalCierreCaja()" class="mt-3 w-full py-2 px-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5">
              <i data-lucide="lock" class="w-3.5 h-3.5"></i>
              <span>Hacer Cierre de Caja</span>
            </button>
          </div>
        </div>
      `;
    }

    // 3. Banner superior en Tab 2
    if (bannerDiario) {
      bannerDiario.innerHTML = '';
    }

    // 4. Botones de acción en tabla de Tab 2
    if (accionesDiario) {
      accionesDiario.innerHTML = `
        <button onclick="exportarCortesHoyCSV()" class="px-3 py-2 bg-brand-dark hover:bg-brand-cardHover border border-brand-border rounded-xl text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-1.5">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Exportar Excel</span>
        </button>
        <button onclick="openModalCierreCaja()" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-red-600/20 transition-all flex items-center gap-1.5">
          <i data-lucide="lock" class="w-4 h-4"></i>
          <span>Cerrar Caja del Día</span>
        </button>
      `;
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Función para reabrir la caja del día
async function confirmarAbrirCaja() {
  const cierreHoy = StorageService.getCierreHoy();
  const horaTexto = cierreHoy && cierreHoy.horaCierre ? ` (cerrada a las ${cierreHoy.horaCierre} hs)` : '';

  if (confirm(`¿Deseas abrir la caja del día de hoy${horaTexto}?\n\nAl abrirla, la caja volverá al estado "Caja Abierta" y podrás continuar registrando cortes y cobros.`)) {
    await StorageService.reabrirCajaHoy();
    checkCajaStatus();
    showToast('¡Caja abierta con éxito! Ya puedes seguir registrando cortes.', 'success');
    if (window.confetti) {
      confetti({
        particleCount: 30,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#10B981', '#D4AF37', '#ffffff']
      });
    }
    renderAllViews();
  }
}

// Totales rápidos del Header
function actualizarHeaderTotals() {
  const cortesHoy = StorageService.getCortesHoy();
  let cash = 0;
  let mp = 0;
  let total = 0;

  cortesHoy.forEach(c => {
    total += c.monto;
    if (c.metodoPago === 'EFECTIVO') cash += c.monto;
    if (c.metodoPago === 'MERCADOPAGO') mp += c.monto;
  });

  const headerCash = document.getElementById('headerCashTotal');
  const headerMp = document.getElementById('headerMpTotal');
  const headerDay = document.getElementById('headerDayTotal');

  if (headerCash) headerCash.textContent = formatCurrency(cash);
  if (headerMp) headerMp.textContent = formatCurrency(mp);
  if (headerDay) headerDay.textContent = formatCurrency(total);
}

// Configuración inicial del formulario
function setupInitialForm() {
  const inputHorario = document.getElementById('inputHorario');
  if (inputHorario) inputHorario.value = getCurrentTime();
}

// Renderizar Botones de Barberos en Tab 1
function renderBarberosSelector() {
  const container = document.getElementById('barberosGrid');
  const hiddenInput = document.getElementById('selectedBarberoId');
  if (!container) return;

  const barberos = StorageService.getBarberos().filter(b => b.activo !== false);

  if (barberos.length === 0) {
    container.innerHTML = `<div class="col-span-full p-4 text-center text-sm text-gray-400 bg-brand-dark rounded-xl border border-brand-border">
      No hay barberos registrados. Ve a Configuración para agregar uno.
    </div>`;
    return;
  }

  // Si no hay seleccionado o el seleccionado ya no existe, seleccionar el primero
  if (!appState.selectedBarberoId || !barberos.some(b => b.id === appState.selectedBarberoId)) {
    appState.selectedBarberoId = barberos[0].id;
  }
  hiddenInput.value = appState.selectedBarberoId;

  container.innerHTML = barberos.map(b => {
    const isSelected = b.id === appState.selectedBarberoId;
    return `
      <button type="button" onclick="selectBarbero('${b.id}')"
        class="barbero-btn p-3 rounded-xl border border-brand-border bg-brand-dark flex items-center gap-3 text-left ${isSelected ? 'selected' : 'hover:border-gray-600'}">
        <div class="barbero-avatar w-12 h-12 rounded-xl bg-brand-card flex items-center justify-center font-bold text-sm text-brand-gold border border-brand-border transition-colors overflow-hidden flex-shrink-0">
          <img src="${b.foto || 'img/laureano.jpg'}" alt="${b.nombre}" class="w-full h-full object-cover object-top">
        </div>
        <div class="overflow-hidden">
          <span class="barbero-name block text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-gray-300'}">${b.nombre}</span>
          <span class="text-[11px] text-gray-500 block">Barbero</span>
        </div>
      </button>
    `;
  }).join('');
}

function selectBarbero(id) {
  appState.selectedBarberoId = id;
  const hiddenInput = document.getElementById('selectedBarberoId');
  if (hiddenInput) hiddenInput.value = id;
  renderBarberosSelector();
}

// Renderizar Botones de Servicios en Tab 1
function renderServiciosSelector() {
  const container = document.getElementById('serviciosGrid');
  const inputMonto = document.getElementById('inputMonto');
  if (!container) return;

  const servicios = StorageService.getServicios();

  if (servicios.length === 0) {
    container.innerHTML = `<div class="col-span-full p-3 text-center text-xs text-gray-400 bg-brand-dark rounded-xl">
      Sin servicios cargados. Ingresa el monto abajo directamente.
    </div>`;
    return;
  }

  // Si no hay seleccionado, seleccionar el primero
  if (!appState.selectedServicioId && servicios.length > 0) {
    appState.selectedServicioId = servicios[0].id;
    appState.selectedServicioNombre = servicios[0].nombre;
    if (inputMonto && !inputMonto.value) {
      inputMonto.value = servicios[0].precio;
    }
  }

  container.innerHTML = servicios.map(s => {
    const isSelected = s.id === appState.selectedServicioId;
    return `
      <button type="button" onclick="selectServicio('${s.id}', '${s.nombre}', ${s.precio})"
        class="servicio-btn p-3 rounded-xl border border-brand-border bg-brand-dark flex flex-col justify-between text-left ${isSelected ? 'selected' : 'hover:border-gray-600'}">
        <span class="text-xs font-semibold truncate text-white block">${s.nombre}</span>
        <span class="servicio-price text-sm font-bold text-gray-300 mt-1 block">${formatCurrency(s.precio)}</span>
      </button>
    `;
  }).join('');
}

function selectServicio(id, nombre, precio) {
  appState.selectedServicioId = id;
  appState.selectedServicioNombre = nombre;
  const inputMonto = document.getElementById('inputMonto');
  if (inputMonto) {
    inputMonto.value = precio;
  }
  renderServiciosSelector();
}

// Manejo de Membresía en mostrador (Tab 1)
function toggleSelectorMembresiaCorte() {
  const wrapper = document.getElementById('wrapperSelectorClienteMembresia');
  if (wrapper) {
    wrapper.classList.toggle('hidden');
    if (!wrapper.classList.contains('hidden')) {
      renderSelectClientesMembresiaCorte();
    }
  }
}

function renderSelectClientesMembresiaCorte() {
  const select = document.getElementById('selectClienteMembresiaCorte');
  if (!select) return;

  const clientes = StorageService.getClientes();
  const valorActual = select.value;

  if (clientes.length === 0) {
    select.innerHTML = `<option value="">-- No hay clientes registrados aún --</option>`;
    return;
  }

  select.innerHTML = `<option value="">-- Seleccionar cliente con membresía --</option>` +
    clientes.map(c => {
      const dias = c.membresia && c.membresia.fechaVencimiento ? getDiasRestantes(c.membresia.fechaVencimiento) : 0;
      const estadoTexto = (c.membresia && c.membresia.activa && dias >= 0) ? `(🟢 Activa - ${dias}d restantes)` : `(🔴 Vencida / Sin membresía)`;
      return `<option value="${c.id}">${c.nombre} ${estadoTexto}</option>`;
    }).join('');

  if (valorActual) {
    select.value = valorActual;
  }
}

function handleSelectClienteMembresiaCorte() {
  const select = document.getElementById('selectClienteMembresiaCorte');
  const badgeInfo = document.getElementById('badgeClienteMembresiaInfo');
  const badgeTexto = document.getElementById('badgeClienteMembresiaTexto');
  const inputMonto = document.getElementById('inputMonto');
  const radioMembresia = document.getElementById('paymentMethodMembresiaOption');
  const radioCash = document.getElementById('paymentMethodCashOption');
  const radioMp = document.getElementById('paymentMethodMpOption');

  if (!select || !select.value) {
    deseleccionarClienteMembresiaCorte();
    return;
  }

  const cliente = StorageService.getClienteById(select.value);
  if (!cliente) return;

  appState.selectedClienteMembresiaId = cliente.id;
  const dias = cliente.membresia && cliente.membresia.fechaVencimiento ? getDiasRestantes(cliente.membresia.fechaVencimiento) : 0;
  const estaActiva = cliente.membresia && cliente.membresia.activa && dias >= 0;

  if (badgeInfo && badgeTexto) {
    badgeInfo.classList.remove('hidden');
    if (estaActiva) {
      badgeInfo.className = 'p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center justify-between';
      badgeTexto.textContent = `Membresía Activa (${dias} días restantes) • $0 a cobrar`;
    } else {
      badgeInfo.className = 'p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400 flex items-center justify-between';
      badgeTexto.textContent = `⚠️ Membresía Vencida o Inactiva • Cobro habitual`;
    }
  }

  if (estaActiva) {
    if (inputMonto) {
      inputMonto.value = 0;
      inputMonto.readOnly = true;
    }
    if (radioMembresia) {
      radioMembresia.classList.remove('hidden');
      const radioInput = radioMembresia.querySelector('input');
      if (radioInput) radioInput.checked = true;
    }
    if (radioCash) radioCash.classList.add('opacity-40');
    if (radioMp) radioMp.classList.add('opacity-40');
  } else {
    if (inputMonto) {
      inputMonto.readOnly = false;
      const srv = StorageService.getServicios().find(s => s.id === appState.selectedServicioId);
      if (srv) inputMonto.value = srv.precio;
    }
    if (radioMembresia) radioMembresia.classList.add('hidden');
    if (radioCash) {
      radioCash.classList.remove('opacity-40');
      const r = radioCash.querySelector('input');
      if (r) r.checked = true;
    }
    if (radioMp) radioMp.classList.remove('opacity-40');
  }
}

function deseleccionarClienteMembresiaCorte() {
  appState.selectedClienteMembresiaId = null;
  const select = document.getElementById('selectClienteMembresiaCorte');
  const badgeInfo = document.getElementById('badgeClienteMembresiaInfo');
  const inputMonto = document.getElementById('inputMonto');
  const radioMembresia = document.getElementById('paymentMethodMembresiaOption');
  const radioCash = document.getElementById('paymentMethodCashOption');
  const radioMp = document.getElementById('paymentMethodMpOption');

  if (select) select.value = '';
  if (badgeInfo) badgeInfo.classList.add('hidden');
  if (inputMonto) {
    inputMonto.readOnly = false;
    const srv = StorageService.getServicios().find(s => s.id === appState.selectedServicioId);
    if (srv) inputMonto.value = srv.precio;
  }
  if (radioMembresia) radioMembresia.classList.add('hidden');
  if (radioCash) {
    radioCash.classList.remove('opacity-40');
    const r = radioCash.querySelector('input');
    if (r) r.checked = true;
  }
  if (radioMp) radioMp.classList.remove('opacity-40');
}

// REGISTRAR UN NUEVO CORTE
async function handleRegistrarCorte(event) {
  event.preventDefault();

  // Si la caja de hoy está cerrada, consultar si se desea reabrir
  const cierreHoy = StorageService.getCierreHoy();
  if (cierreHoy) {
    const continuar = confirm(`La caja de hoy figura cerrada (a las ${cierreHoy.horaCierre || '--:--'} hs).\n\n¿Deseas abrir la caja ahora para registrar este corte y continuar la jornada?`);
    if (!continuar) {
      return;
    }
    await StorageService.reabrirCajaHoy();
    checkCajaStatus();
    showToast('Caja reabierta automáticamente.', 'info');
  }

  const barberoId = document.getElementById('selectedBarberoId').value;
  const barberos = StorageService.getBarberos();
  const barbero = barberos.find(b => b.id === barberoId);

  if (!barbero) {
    showToast('Por favor selecciona un barbero.', 'error');
    return;
  }

  const metodoPago = document.querySelector('input[name="metodoPago"]:checked')?.value || 'EFECTIVO';
  const monto = parseFloat(document.getElementById('inputMonto').value) || 0;

  if (metodoPago !== 'MEMBRESIA' && (isNaN(monto) || monto <= 0)) {
    showToast('Por favor ingresa un monto válido.', 'error');
    return;
  }

  const horario = document.getElementById('inputHorario').value || getCurrentTime();
  const servicioBase = appState.selectedServicioNombre || 'Corte General';

  // Si tiene cliente de membresía seleccionado
  const clienteId = appState.selectedClienteMembresiaId;
  const cliente = clienteId ? StorageService.getClienteById(clienteId) : null;
  const servicioNombre = cliente ? `${servicioBase} (${cliente.nombre})` : servicioBase;

  const corte = {
    barberoId: barbero.id,
    barberoNombre: barbero.nombre,
    servicioNombre: servicioNombre,
    monto: monto,
    metodoPago: metodoPago,
    hora: horario,
    fecha: getTodayISO(),
    clienteId: clienteId || null
  };

  const nuevoCorte = await StorageService.addCorte(corte);

  // Si estaba asociado a un cliente, registrar en su historial
  if (cliente) {
    if (!cliente.cortes) cliente.cortes = [];
    cliente.cortes.unshift({
      id: generateUUID(),
      corteGlobalId: nuevoCorte.id,
      fecha: getTodayISO(),
      hora: horario,
      barberoId: barbero.id,
      barberoNombre: barbero.nombre,
      servicioNombre: servicioBase,
      timestamp: Date.now()
    });
    await StorageService.upsertCliente(cliente);
    deseleccionarClienteMembresiaCorte();
  }

  // Efecto Confeti sutil de éxito
  if (window.confetti) {
    confetti({
      particleCount: 25,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#D4AF37', '#10B981', '#009EE3']
    });
  }

  const mensajeCorte = metodoPago === 'MEMBRESIA'
    ? `¡Corte con membresía registrado! (${barbero.nombre})`
    : `¡Corte registrado! $${monto.toLocaleString('es-AR')} (${barbero.nombre})`;
  showToast(mensajeCorte, 'success');

  // Reset del horario a la hora actual para el próximo corte
  document.getElementById('inputHorario').value = getCurrentTime();

  // Actualizar vistas
  renderRecentCuts();
  renderTabDiario();
  renderTabClientes();
  actualizarHeaderTotals();
  checkCajaStatus();
}

// Mini lista de últimos cortes en el panel de carga rápida (Tab 1)
function renderRecentCuts() {
  const container = document.getElementById('recentCutsList');
  const badgeTotal = document.getElementById('badgeTotalCortesCount');
  if (!container) return;

  const cortesHoy = StorageService.getCortesHoy();

  if (badgeTotal) {
    badgeTotal.textContent = `${cortesHoy.length} corte${cortesHoy.length === 1 ? '' : 's'}`;
  }

  if (cortesHoy.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center text-gray-500">
        <i data-lucide="scissors" class="w-8 h-8 mx-auto mb-2 opacity-30"></i>
        <p class="text-xs">Aún no hay cortes registrados hoy.</p>
        <p class="text-[11px] text-gray-600 mt-1">Completa el formulario para registrar el primero.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = cortesHoy.slice(0, 6).map(c => {
    let badgePago = '';
    if (c.metodoPago === 'EFECTIVO') {
      badgePago = `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"><i data-lucide="banknote" class="w-3 h-3"></i> Efectivo</span>`;
    } else if (c.metodoPago === 'MEMBRESIA') {
      badgePago = `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-gold/15 text-brand-gold border border-brand-gold/30 flex items-center gap-1"><i data-lucide="crown" class="w-3 h-3"></i> Membresía</span>`;
    } else {
      badgePago = `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1.5"><img src="img/mercadopago.jpg" class="w-3.5 h-3.5 rounded object-contain bg-white"> MP</span>`;
    }

    return `
      <div class="p-3 bg-brand-dark/80 rounded-xl border border-brand-border flex items-center justify-between gap-3 hover:border-gray-600 transition-colors">
        <div class="flex items-center gap-2.5 overflow-hidden">
          <div class="w-8 h-8 rounded-lg overflow-hidden border border-brand-border flex-shrink-0 bg-brand-card">
            <img src="img/laureano.jpg" alt="${c.barberoNombre}" class="w-full h-full object-cover object-top">
          </div>
          <div class="truncate">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-white truncate">${c.barberoNombre}</span>
              <span class="text-[10px] text-gray-400">• ${c.hora} hs</span>
            </div>
            <span class="text-[11px] text-gray-400 block truncate">${c.servicioNombre}</span>
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <span class="text-xs font-bold text-white block">${formatCurrency(c.monto)}</span>
          <div class="mt-0.5">${badgePago}</div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// RENDER TAB 2: CAJA DEL DÍA
function renderTabDiario() {
  const cortesHoy = StorageService.getCortesHoy();
  const barberos = StorageService.getBarberos();

  let efectivo = 0;
  let efectivoCount = 0;
  let mp = 0;
  let mpCount = 0;
  let transf = 0;
  let transfCount = 0;
  let total = 0;

  // Conteo y totales por barbero hoy
  const statsPorBarbero = {};
  barberos.forEach(b => {
    statsPorBarbero[b.id] = {
      nombre: b.nombre,
      comision: b.comision,
      cortesCount: 0,
      totalMonto: 0,
      efectivo: 0,
      mp: 0
    };
  });

  cortesHoy.forEach(c => {
    total += c.monto;
    if (c.metodoPago === 'EFECTIVO') {
      efectivo += c.monto;
      efectivoCount++;
    } else if (c.metodoPago === 'MERCADOPAGO') {
      mp += c.monto;
      mpCount++;
    } else {
      transf += c.monto;
      transfCount++;
    }

    if (!statsPorBarbero[c.barberoId]) {
      statsPorBarbero[c.barberoId] = {
        nombre: c.barberoNombre,
        comision: 50,
        cortesCount: 0,
        totalMonto: 0,
        efectivo: 0,
        mp: 0
      };
    }
    statsPorBarbero[c.barberoId].cortesCount++;
    statsPorBarbero[c.barberoId].totalMonto += c.monto;
    if (c.metodoPago === 'EFECTIVO') statsPorBarbero[c.barberoId].efectivo += c.monto;
    if (c.metodoPago === 'MERCADOPAGO') statsPorBarbero[c.barberoId].mp += c.monto;
  });

  // Actualizar KPIs de Tab 2
  const kpiEfectivo = document.getElementById('kpiEfectivo');
  const kpiEfectivoCount = document.getElementById('kpiEfectivoCount');
  const kpiMp = document.getElementById('kpiMp');
  const kpiMpCount = document.getElementById('kpiMpCount');
  const kpiTotal = document.getElementById('kpiTotal');
  const kpiTotalCount = document.getElementById('kpiTotalCount');
  const kpiTicketPromedio = document.getElementById('kpiTicketPromedio');

  if (kpiEfectivo) kpiEfectivo.textContent = formatCurrency(efectivo);
  if (kpiEfectivoCount) kpiEfectivoCount.textContent = `${efectivoCount} cobro${efectivoCount === 1 ? '' : 's'} en efectivo`;
  if (kpiMp) kpiMp.textContent = formatCurrency(mp);
  if (kpiMpCount) kpiMpCount.textContent = `${mpCount} cobro${mpCount === 1 ? '' : 's'} por Mercado Pago`;
  if (kpiTotal) kpiTotal.textContent = formatCurrency(total);
  if (kpiTotalCount) kpiTotalCount.textContent = `${cortesHoy.length} corte${cortesHoy.length === 1 ? '' : 's'} hoy`;

  const promedio = cortesHoy.length > 0 ? Math.round(total / cortesHoy.length) : 0;
  if (kpiTicketPromedio) kpiTicketPromedio.textContent = formatCurrency(promedio);

  // Renderizar Tarjetas de Estadísticas de Barberos Hoy
  const barberosStatsGrid = document.getElementById('barberosDayStatsGrid');
  if (barberosStatsGrid) {
    const listBarberosStats = Object.values(statsPorBarbero);
    if (listBarberosStats.length === 0) {
      barberosStatsGrid.innerHTML = `<p class="text-xs text-gray-500 col-span-full">Sin barberos activos.</p>`;
    } else {
      barberosStatsGrid.innerHTML = listBarberosStats.map(b => {
        return `
          <div class="p-4 bg-brand-dark/80 rounded-xl border border-brand-border">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg overflow-hidden border border-brand-border flex-shrink-0 bg-brand-card">
                  <img src="${b.foto || 'img/laureano.jpg'}" alt="${b.nombre}" class="w-full h-full object-cover object-top">
                </div>
                <h4 class="text-sm font-bold text-white">${b.nombre}</h4>
              </div>
              <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
                ${b.cortesCount} cortes
              </span>
            </div>
            <div class="mt-3 space-y-1 text-xs">
              <div class="flex justify-between text-gray-400">
                <span>Cortes realizados:</span>
                <span class="font-bold text-white">${b.cortesCount}</span>
              </div>
              <div class="flex justify-between text-emerald-400 font-semibold">
                <span>Total generado:</span>
                <span>${formatCurrency(b.totalMonto)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Renderizar Tabla de Cortes de Hoy
  const tableBody = document.getElementById('tablaCortesHoyBody');
  if (tableBody) {
    if (cortesHoy.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-5 py-10 text-center text-gray-500">
            <i data-lucide="calendar" class="w-8 h-8 mx-auto mb-2 opacity-30"></i>
            <p class="text-sm">No se han registrado cortes hoy.</p>
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = cortesHoy.map(c => {
        let badgeMetodo = '';
        if (c.metodoPago === 'EFECTIVO') {
          badgeMetodo = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <i data-lucide="banknote" class="w-3.5 h-3.5"></i> Efectivo
          </span>`;
        } else if (c.metodoPago === 'MEMBRESIA') {
          badgeMetodo = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
            <i data-lucide="crown" class="w-3.5 h-3.5"></i> Membresía
          </span>`;
        } else {
          badgeMetodo = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <img src="img/mercadopago.jpg" class="w-4 h-4 rounded object-contain bg-white p-[1px]"> Mercado Pago
          </span>`;
        }

        return `
          <tr class="hover:bg-brand-cardHover/50 transition-colors">
            <td class="px-5 py-3.5 font-semibold text-white whitespace-nowrap">${c.hora} hs</td>
            <td class="px-5 py-3.5 font-bold text-white whitespace-nowrap">
              <span class="inline-flex items-center gap-2">
                <span class="w-7 h-7 rounded-full overflow-hidden border border-brand-border inline-block flex-shrink-0 align-middle">
                  <img src="img/laureano.jpg" alt="${c.barberoNombre}" class="w-full h-full object-cover object-top">
                </span>
                ${c.barberoNombre}
              </span>
            </td>
            <td class="px-5 py-3.5 text-gray-300">${c.servicioNombre}</td>
            <td class="px-5 py-3.5">${badgeMetodo}</td>
            <td class="px-5 py-3.5 text-right font-extrabold text-white text-base">${formatCurrency(c.monto)}</td>
            <td class="px-5 py-3.5 text-center">
              <button onclick="eliminarCorteConfirm('${c.id}')" class="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Eliminar registro">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

// Eliminar un corte registrado
async function eliminarCorteConfirm(id) {
  if (confirm('¿Estás seguro de que deseas eliminar este corte? Se recalculará la caja del día.')) {
    await StorageService.deleteCorte(id);
    showToast('Corte eliminado con éxito.', 'info');
    renderAllViews();
  }
}

// ============================================================
// MODAL CIERRE DE CAJA Y BALANCE
// ============================================================
function openModalCierreCaja() {
  const cortesHoy = StorageService.getCortesHoy();
  const barberos = StorageService.getBarberos();

  let efectivo = 0;
  let mp = 0;
  let transf = 0;
  let total = 0;

  const statsPorBarbero = {};
  barberos.forEach(b => {
    statsPorBarbero[b.id] = {
      nombre: b.nombre,
      comision: b.comision || 50,
      cortes: 0,
      monto: 0
    };
  });

  cortesHoy.forEach(c => {
    total += c.monto;
    if (c.metodoPago === 'EFECTIVO') efectivo += c.monto;
    else if (c.metodoPago === 'MERCADOPAGO') mp += c.monto;
    else transf += c.monto;

    if (!statsPorBarbero[c.barberoId]) {
      statsPorBarbero[c.barberoId] = {
        nombre: c.barberoNombre,
        comision: 50,
        cortes: 0,
        monto: 0
      };
    }
    statsPorBarbero[c.barberoId].cortes++;
    statsPorBarbero[c.barberoId].monto += c.monto;
  });

  // Asignar al modal
  const cierreExistente = StorageService.getCierreHoy();
  const modalAcciones = document.getElementById('modalCierreAcciones');

  if (cierreExistente) {
    document.getElementById('modalCierreFechaText').textContent = `Balance de hoy (Caja Cerrada a las ${cierreExistente.horaCierre || '--:--'} hs)`;
    if (modalAcciones) {
      modalAcciones.innerHTML = `
        <button onclick="compartirWhatsAppResumen()" class="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
          <i data-lucide="share-2" class="w-4 h-4"></i> WhatsApp
        </button>
        <button onclick="imprimirTicketCierre()" class="w-full sm:w-auto px-4 py-2.5 bg-brand-dark hover:bg-brand-cardHover border border-brand-border rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2">
          <i data-lucide="printer" class="w-4 h-4"></i> Imprimir Ticket
        </button>
        <button onclick="closeModalCierreCaja(); confirmarAbrirCaja();" class="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25">
          <i data-lucide="unlock" class="w-4 h-4"></i> Abrir Caja
        </button>
        <button onclick="ejecutarCierreCajaDefinitivo()" class="w-full sm:flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizar Cierre
        </button>
      `;
    }
  } else {
    document.getElementById('modalCierreFechaText').textContent = `Balance de hoy: ${formatDateReadable(getTodayISO())}`;
    if (modalAcciones) {
      modalAcciones.innerHTML = `
        <button onclick="compartirWhatsAppResumen()" class="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
          <i data-lucide="share-2" class="w-4 h-4"></i> Enviar por WhatsApp
        </button>
        <button onclick="imprimirTicketCierre()" class="w-full sm:w-auto px-4 py-2.5 bg-brand-dark hover:bg-brand-cardHover border border-brand-border rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2">
          <i data-lucide="printer" class="w-4 h-4"></i> Imprimir Ticket
        </button>
        <button onclick="ejecutarCierreCajaDefinitivo()" class="w-full sm:flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/30">
          <i data-lucide="check" class="w-4 h-4"></i> Finalizar y Cerrar Día
        </button>
      `;
    }
  }

  document.getElementById('modalCierreEfectivo').textContent = formatCurrency(efectivo);
  document.getElementById('modalCierreMp').textContent = formatCurrency(mp);
  const elTransf = document.getElementById('modalCierreTransferencia');
  if (elTransf) elTransf.textContent = formatCurrency(transf);
  document.getElementById('modalCierreTotalGeneral').textContent = formatCurrency(total);
  document.getElementById('modalCierreTotalCortes').textContent = `${cortesHoy.length} cortes`;

  // Barberos en el modal
  const listContainer = document.getElementById('modalCierreBarberosList');
  const activos = Object.values(statsPorBarbero).filter(b => b.cortes > 0);

  if (activos.length === 0) {
    listContainer.innerHTML = `<p class="text-xs text-gray-500 py-2">No hay actividad de barberos hoy aún.</p>`;
  } else {
    listContainer.innerHTML = activos.map(b => {
      return `
        <div class="p-2.5 bg-brand-card rounded-lg border border-brand-border flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-white">${b.nombre}</span>
            <span class="text-gray-400 text-[11px] block">${b.cortes} cortes realizados</span>
          </div>
          <div class="text-right">
            <span class="text-emerald-400 font-bold block text-sm">${formatCurrency(b.monto)}</span>
            <span class="text-[10px] text-gray-500">Total generado</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('modalCierreCaja').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeModalCierreCaja() {
  document.getElementById('modalCierreCaja').classList.add('hidden');
}

// Ejecutar Cierre Definitivo
async function ejecutarCierreCajaDefinitivo() {
  const cortesHoy = StorageService.getCortesHoy();
  const barberos = StorageService.getBarberos();

  let efectivo = 0;
  let mp = 0;
  let transf = 0;
  let total = 0;

  const desgloseBarberos = [];

  barberos.forEach(b => {
    const cortesB = cortesHoy.filter(c => c.barberoId === b.id);
    const subtotal = cortesB.reduce((sum, c) => sum + c.monto, 0);
    const ganancia = Math.round((subtotal * (b.comision || 50)) / 100);

    desgloseBarberos.push({
      barberoId: b.id,
      nombre: b.nombre,
      comision: b.comision || 50,
      cortes: cortesB.length,
      subtotal: subtotal,
      gananciaBarbero: ganancia,
      gananciaLocal: subtotal - ganancia
    });
  });

  cortesHoy.forEach(c => {
    total += c.monto;
    if (c.metodoPago === 'EFECTIVO') efectivo += c.monto;
    else if (c.metodoPago === 'MERCADOPAGO') mp += c.monto;
    else transf += c.monto;
  });

  const nuevoCierre = {
    id: generateUUID(),
    fecha: getTodayISO(),
    fechaLegible: formatDateReadable(getTodayISO()),
    horaCierre: getCurrentTime(),
    totalGeneral: total,
    totalEfectivo: efectivo,
    totalMercadoPago: mp,
    totalTransferencia: transf,
    totalCortes: cortesHoy.length,
    desgloseBarberos: desgloseBarberos,
    cortes: cortesHoy
  };

  await StorageService.guardarCierre(nuevoCierre);
  closeModalCierreCaja();
  showToast('¡Caja del día cerrada y guardada en el historial con éxito!', 'success');
  checkCajaStatus();
  renderAllViews();
}

// Compartir resumen estructurado por WhatsApp
function compartirWhatsAppResumen() {
  const cortesHoy = StorageService.getCortesHoy();
  const barberos = StorageService.getBarberos();

  let efectivo = 0;
  let mp = 0;
  let total = 0;

  cortesHoy.forEach(c => {
    total += c.monto;
    if (c.metodoPago === 'EFECTIVO') efectivo += c.monto;
    if (c.metodoPago === 'MERCADOPAGO') mp += c.monto;
  });

  let texto = `💈 *CIERRE DE CAJA - CERO Y MEDIO* 💈\n`;
  texto += `📅 Fecha: ${formatDateReadable(getTodayISO())}\n`;
  texto += `⏰ Hora de cierre: ${getCurrentTime()} hs\n\n`;
  texto += `💵 *Efectivo en Caja:* $${efectivo.toLocaleString('es-AR')}\n`;
  texto += `📱 *Mercado Pago:* $${mp.toLocaleString('es-AR')}\n`;
  texto += `💰 *TOTAL GENERAL:* $${total.toLocaleString('es-AR')}\n`;
  texto += `✂️ *Cortes Totales:* ${cortesHoy.length}\n\n`;
  texto += `*--- DETALLE POR BARBERO ---*\n`;

  barberos.forEach(b => {
    const cortesB = cortesHoy.filter(c => c.barberoId === b.id);
    if (cortesB.length > 0) {
      const subtotal = cortesB.reduce((s, c) => s + c.monto, 0);
      const comision = Math.round((subtotal * (b.comision || 50)) / 100);
      texto += `• ${b.nombre}: ${cortesB.length} cortes | Total: $${subtotal.toLocaleString('es-AR')} | Su parte (${b.comision}%): $${comision.toLocaleString('es-AR')}\n`;
    }
  });

  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}

// Imprimir Ticket térmico / comprobante
function imprimirTicketCierre() {
  const cortesHoy = StorageService.getCortesHoy();
  const barberos = StorageService.getBarberos();

  let efectivo = 0;
  let mp = 0;
  let total = 0;

  cortesHoy.forEach(c => {
    total += c.monto;
    if (c.metodoPago === 'EFECTIVO') efectivo += c.monto;
    if (c.metodoPago === 'MERCADOPAGO') mp += c.monto;
  });

  let html = `
    <div style="text-align:center; font-family: monospace; padding: 10px;">
      <img src="img/logo.jpg" style="width: 65px; height: 65px; border-radius: 50%; margin: 0 auto 8px auto; display: block; object-fit: cover;">
      <h2 style="margin: 0;">*** CERO Y MEDIO ***</h2>
      <p style="margin: 2px 0 6px 0; font-size: 11px; color: #444;">BARBERÍA MODERNA</p>
      <h3 style="margin: 4px 0;">CIERRE DE CAJA DIARIO</h3>
      <p>${formatDateReadable(getTodayISO())} - ${getCurrentTime()} hs</p>
      <hr style="border: 1px dashed #000;">
      <table style="width: 100%; text-align: left; font-size: 13px;">
        <tr><td><strong>Efectivo:</strong></td><td style="text-align: right;">$${efectivo.toLocaleString('es-AR')}</td></tr>
        <tr><td><strong>Mercado Pago:</strong></td><td style="text-align: right;">$${mp.toLocaleString('es-AR')}</td></tr>
        <tr><td colspan="2"><hr style="border: 1px dashed #000;"></td></tr>
        <tr style="font-size: 15px;"><td><strong>TOTAL:</strong></td><td style="text-align: right;"><strong>$${total.toLocaleString('es-AR')}</strong></td></tr>
        <tr><td>Total Cortes:</td><td style="text-align: right;">${cortesHoy.length}</td></tr>
      </table>
      <hr style="border: 1px dashed #000;">
      <h4>DETALLE:</h4>
  `;

  barberos.forEach(b => {
    const cortesB = cortesHoy.filter(c => c.barberoId === b.id);
    if (cortesB.length > 0) {
      const subtotal = cortesB.reduce((s, c) => s + c.monto, 0);
      html += `
        <p style="text-align: left; margin: 4px 0; font-size: 12px;">
          <strong>${b.nombre}</strong> (${cortesB.length} cortes)<br>
          Total generado: $${subtotal.toLocaleString('es-AR')}
        </p>
      `;
    }
  });

  html += `
      <hr style="border: 1px dashed #000;">
      <p style="font-size: 11px;">Impreso desde Cero y Medio</p>
    </div>
  `;

  const printArea = document.getElementById('printArea');
  printArea.innerHTML = html;
  window.print();
}

// Exportar Cortes de Hoy a formato Excel (CSV)
function exportarCortesHoyCSV() {
  const cortesHoy = StorageService.getCortesHoy();
  if (cortesHoy.length === 0) {
    showToast('No hay cortes para exportar hoy.', 'info');
    return;
  }

  let csv = "\uFEFFHora,Barbero,Servicio,Medio de Pago,Monto\n";
  cortesHoy.forEach(c => {
    csv += `"${c.hora}","${c.barberoNombre}","${c.servicioNombre}","${c.metodoPago}",${c.monto}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `cortes_${getTodayISO()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Reporte Excel descargado.', 'success');
}

// ============================================================
// TAB 3: LIQUIDACIONES Y MÉTRICAS DE BARBEROS
// ============================================================
function actualizarLiquidacionesBarberos() {
  const container = document.getElementById('cardsLiquidacionBarberos');
  const filtro = document.getElementById('filtroPeriodoBarberos').value;
  if (!container) return;

  const barberos = StorageService.getBarberos();
  const allCortes = StorageService.getAllCortes();
  const today = getTodayISO();

  // Filtrar cortes según el período seleccionado
  let cortesFiltrados = [];
  const now = new Date();

  if (filtro === 'hoy') {
    cortesFiltrados = allCortes.filter(c => c.fecha === today);
  } else if (filtro === 'semana') {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo o lunes
    const startStr = startOfWeek.toISOString().split('T')[0];
    cortesFiltrados = allCortes.filter(c => c.fecha >= startStr);
  } else if (filtro === 'mes') {
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    cortesFiltrados = allCortes.filter(c => c.fecha >= startOfMonth);
  } else {
    cortesFiltrados = allCortes;
  }

  container.innerHTML = barberos.map(b => {
    const cortesB = cortesFiltrados.filter(c => c.barberoId === b.id);
    const totalMonto = cortesB.reduce((acc, c) => acc + c.monto, 0);
    const comisionPct = b.comision || 50;
    const gananciaBarbero = Math.round((totalMonto * comisionPct) / 100);
    const gananciaLocal = totalMonto - gananciaBarbero;

    const efectivo = cortesB.filter(c => c.metodoPago === 'EFECTIVO').reduce((s, c) => s + c.monto, 0);
    const mp = cortesB.filter(c => c.metodoPago === 'MERCADOPAGO').reduce((s, c) => s + c.monto, 0);

    return `
      <div class="bg-brand-card rounded-2xl border border-brand-border p-5 shadow-lg relative overflow-hidden">
        <div class="flex items-center justify-between pb-3 border-b border-brand-border">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl overflow-hidden border border-brand-gold/40 flex-shrink-0 shadow bg-brand-dark">
              <img src="${b.foto || 'img/laureano.jpg'}" alt="${b.nombre}" class="w-full h-full object-cover object-top">
            </div>
            <div>
              <h3 class="text-base font-bold text-white">${b.nombre}</h3>
              <span class="text-xs text-gray-400">Barbero</span>
            </div>
          </div>
          <span class="text-xs font-black px-2.5 py-1 rounded-lg bg-brand-dark border border-brand-border text-brand-gold">
            ${cortesB.length} cortes
          </span>
        </div>

        <div class="mt-4 space-y-2.5 text-xs">
          <div class="flex justify-between text-gray-400">
            <span>Cortes Realizados:</span>
            <span class="font-bold text-white text-sm">${cortesB.length}</span>
          </div>
          <div class="flex justify-between text-emerald-400 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span class="font-bold">Total Recaudado:</span>
            <span class="font-black text-sm">${formatCurrency(totalMonto)}</span>
          </div>
          <div class="pt-2 border-t border-brand-border/60 flex justify-between text-[11px] text-gray-400">
            <span>💵 Efectivo: ${formatCurrency(efectivo)}</span>
            <span>📱 Mercado Pago: ${formatCurrency(mp)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ============================================================
// TAB 4: HISTORIAL DE CIERRES DE CAJA
// ============================================================
function renderHistorialCierres() {
  const container = document.getElementById('historialCierresContainer');
  const filtroFecha = document.getElementById('filtroFechaHistorial').value;
  if (!container) return;

  let cierres = StorageService.getAllCierres();

  if (filtroFecha) {
    cierres = cierres.filter(c => c.fecha === filtroFecha);
  }

  if (cierres.length === 0) {
    container.innerHTML = `
      <div class="bg-brand-card p-10 rounded-2xl border border-brand-border text-center text-gray-500">
        <i data-lucide="archive" class="w-10 h-10 mx-auto mb-2 opacity-30"></i>
        <p class="text-sm font-semibold">No hay cierres de caja archivados ${filtroFecha ? 'para esta fecha' : 'aún'}.</p>
        <p class="text-xs text-gray-600 mt-1">Al realizar un "Cierre de Caja del Día", quedará registrado aquí para consultar siempre.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = cierres.map(c => {
    const esHoy = c.fecha === getTodayISO();
    return `
      <div class="bg-brand-card rounded-2xl border ${esHoy ? 'border-brand-gold/50 shadow-brand-gold/10' : 'border-brand-border'} p-5 shadow-lg">
        <div class="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-brand-border">
          <div>
            <div class="flex items-center gap-2">
              <span class="p-1.5 rounded-lg ${esHoy ? 'bg-amber-500/20 text-brand-gold' : 'bg-emerald-500/10 text-emerald-400'}">
                <i data-lucide="${esHoy ? 'lock' : 'check-circle'}" class="w-4 h-4"></i>
              </span>
              <h3 class="text-base font-bold text-white">${c.fechaLegible || c.fecha}</h3>
              ${esHoy ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold border border-brand-gold/30">Cierre de Hoy</span>' : ''}
            </div>
            <p class="text-xs text-gray-400 mt-0.5">Cerrada a las ${c.horaCierre || '--:--'} hs • ${c.totalCortes} cortes en total</p>
          </div>

          <div class="flex items-center gap-3">
            ${esHoy ? `
              <button onclick="confirmarAbrirCaja()" class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
                <i data-lucide="unlock" class="w-3.5 h-3.5"></i>
                <span>Abrir Caja</span>
              </button>
            ` : ''}
            <div class="text-right">
              <span class="text-xs uppercase tracking-wider text-gray-400 block font-semibold">Total del Día</span>
              <span class="text-xl font-black text-brand-gold">${formatCurrency(c.totalGeneral)}</span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 my-3 text-xs">
          <div class="p-2.5 rounded-xl bg-brand-dark border border-brand-border">
            <span class="text-gray-400 block text-[11px]">💵 Efectivo</span>
            <span class="text-sm font-bold text-emerald-400">${formatCurrency(c.totalEfectivo)}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-brand-dark border border-brand-border">
            <span class="text-gray-400 flex items-center gap-1.5 text-[11px]"><img src="img/mercadopago.jpg" class="w-3.5 h-3.5 rounded object-contain bg-white"> Mercado Pago</span>
            <span class="text-sm font-bold text-sky-400">${formatCurrency(c.totalMercadoPago)}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-brand-dark border border-brand-border col-span-2 sm:col-span-1">
            <span class="text-gray-400 block text-[11px]">✂️ Cortes Totales</span>
            <span class="text-sm font-bold text-white">${c.totalCortes}</span>
          </div>
        </div>

        <!-- Desglose de Barberos de este cierre -->
        ${c.desgloseBarberos && c.desgloseBarberos.length > 0 ? `
          <div class="mt-3 pt-3 border-t border-brand-border/60">
            <span class="text-[11px] uppercase tracking-wider font-bold text-gray-400 block mb-2">Liquidación de barberos este día:</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              ${c.desgloseBarberos.filter(b => b.cortes > 0).map(b => `
                <div class="p-2 bg-brand-dark rounded-lg flex items-center justify-between">
                  <span class="font-semibold text-white">${b.nombre} (${b.cortes} cortes):</span>
                  <span class="font-bold text-emerald-400">${formatCurrency(b.gananciaBarbero)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function limpiarFiltroFechaHistorial() {
  document.getElementById('filtroFechaHistorial').value = '';
  renderHistorialCierres();
}

// ============================================================
// TAB: CIERRE SEMANAL (LUNES A SÁBADO - DUEÑOS)
// ============================================================

// Renderizar la pestaña de Cierre Semanal
function renderTabSemanal() {
  const session = StorageService.getSession();
  if (session && session.role !== 'dueno') {
    return;
  }

  const selectSemana = document.getElementById('selectSemanaLaboral');
  if (!selectSemana) return;

  // Poblar selector si está vacío
  if (selectSemana.options.length === 0) {
    const semanas = getListaSemanasLaborales(10);
    selectSemana.innerHTML = semanas.map(s => `
      <option value="${s.id}" data-inicio="${s.fechaInicio}" data-fin="${s.fechaFin}">
        ${s.label}
      </option>
    `).join('');
  }

  const selectedOpt = selectSemana.options[selectSemana.selectedIndex] || selectSemana.options[0];
  if (!selectedOpt) return;

  const fechaInicio = selectedOpt.dataset.inicio || selectedOpt.getAttribute('data-inicio');
  const fechaFin = selectedOpt.dataset.fin || selectedOpt.getAttribute('data-fin');
  const semanaId = selectedOpt.value;

  // Filtrar cortes realizados dentro del rango Lunes a Sábado inclusive
  const todosCortes = StorageService.getAllCortes();
  const cortesSemana = todosCortes.filter(c => c.fecha >= fechaInicio && c.fecha <= fechaFin);

  let totalGeneral = 0;
  let totalEfectivo = 0;
  let totalMP = 0;

  cortesSemana.forEach(c => {
    const m = Number(c.monto) || 0;
    totalGeneral += m;
    if (c.metodoPago === 'EFECTIVO') {
      totalEfectivo += m;
    } else {
      totalMP += m;
    }
  });

  // Lista de Barberos (dinámica: todos los configurados + los que figuren en cortes)
  const barberosConfig = StorageService.getBarberos();
  const barberosMap = new Map();

  barberosConfig.forEach(b => {
    barberosMap.set(b.nombre.toLowerCase().trim(), {
      id: b.id,
      nombre: b.nombre,
      foto: b.foto || 'img/laureano.jpg'
    });
  });

  cortesSemana.forEach(c => {
    if (c.barberoNombre) {
      const key = c.barberoNombre.toLowerCase().trim();
      if (!barberosMap.has(key)) {
        barberosMap.set(key, {
          id: c.barberoId || ('b_' + key),
          nombre: c.barberoNombre,
          foto: 'img/laureano.jpg'
        });
      }
    }
  });

  // Calcular métricas individuales y división 50% / 50%
  const desgloseBarberos = Array.from(barberosMap.values()).map(b => {
    const key = b.nombre.toLowerCase().trim();
    const cortesB = cortesSemana.filter(c => {
      const cKey = (c.barberoNombre || '').toLowerCase().trim();
      return (c.barberoId && c.barberoId === b.id) || (cKey === key);
    });

    let totB = 0;
    let efB = 0;
    let mpB = 0;

    cortesB.forEach(c => {
      const m = Number(c.monto) || 0;
      totB += m;
      if (c.metodoPago === 'EFECTIVO') {
        efB += m;
      } else {
        mpB += m;
      }
    });

    // 50% Barbero y 50% para la Barbería Cero y Medio
    const gananciaBarbero = Math.round(totB * 0.5);
    const gananciaLocal = totB - gananciaBarbero;

    return {
      id: b.id,
      nombre: b.nombre,
      foto: b.foto,
      cortes: cortesB.length,
      totalFacturado: totB,
      totalEfectivo: efB,
      totalMercadoPago: mpB,
      gananciaBarbero: gananciaBarbero,
      gananciaLocal: gananciaLocal
    };
  });

  // Totales de reparto
  const totalBarberos = desgloseBarberos.reduce((acc, b) => acc + b.gananciaBarbero, 0);
  const totalCeroYMedio = desgloseBarberos.reduce((acc, b) => acc + b.gananciaLocal, 0);
  const totalCortes = cortesSemana.length;

  // Actualizar KPIs en el DOM
  const kpiTotal = document.getElementById('kpiSemanaTotalGeneral');
  const kpiEf = document.getElementById('kpiSemanaEfectivo');
  const kpiMP = document.getElementById('kpiSemanaMP');
  const kpiCeroYMedio = document.getElementById('kpiSemanaCeroYMedio');
  const kpiBarberos = document.getElementById('kpiSemanaBarberos');
  const kpiCortes = document.getElementById('kpiSemanaCortes');

  if (kpiTotal) kpiTotal.textContent = formatCurrency(totalGeneral);
  if (kpiEf) kpiEf.textContent = formatCurrency(totalEfectivo);
  if (kpiMP) kpiMP.textContent = formatCurrency(totalMP);
  if (kpiCeroYMedio) kpiCeroYMedio.textContent = formatCurrency(totalCeroYMedio);
  if (kpiBarberos) kpiBarberos.textContent = formatCurrency(totalBarberos);
  if (kpiCortes) kpiCortes.textContent = totalCortes;

  // Estado del cierre (Guardado o Pendiente)
  const cierresSemanales = StorageService.getAllCierresSemanales();
  const cierreGuardado = cierresSemanales.find(c => c.semanaId === semanaId || (c.semanaInicio === fechaInicio && c.semanaFin === fechaFin));
  const badgeEl = document.getElementById('semanaStatusBadge');

  if (badgeEl) {
    if (cierreGuardado) {
      badgeEl.className = 'text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 font-bold';
      badgeEl.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Archivado (${cierreGuardado.guardadoEl || 'Guardado'})`;
    } else {
      badgeEl.className = 'text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 border border-brand-gold/30 text-brand-gold flex items-center gap-1.5 font-medium';
      badgeEl.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5"></i> En curso / Pendiente`;
    }
  }

  // Renderizar tarjetas por Barbero
  const desgloseContainer = document.getElementById('desgloseSemanalBarberos');
  if (desgloseContainer) {
    const barberosConActividad = desgloseBarberos.filter(b => b.cortes > 0 || b.totalFacturado > 0);

    if (barberosConActividad.length === 0) {
      desgloseContainer.innerHTML = `
        <div class="col-span-full p-8 bg-brand-dark rounded-xl border border-brand-border text-center text-gray-400">
          <i data-lucide="scissors" class="w-8 h-8 mx-auto mb-2 opacity-30 text-brand-gold"></i>
          <p class="text-sm font-semibold text-white">No hay cortes registrados en esta semana laboral</p>
          <p class="text-xs text-gray-500 mt-1">Período: ${selectedOpt.textContent.trim()} (Lunes a Sábado)</p>
        </div>
      `;
    } else {
      desgloseContainer.innerHTML = barberosConActividad.map(b => `
        <div class="bg-brand-dark rounded-xl border border-brand-border p-4.5 flex flex-col justify-between shadow-md hover:border-brand-gold/40 transition-all">
          <div>
            <!-- Header barbero -->
            <div class="flex items-center justify-between pb-3 border-b border-brand-border/70 mb-3">
              <div class="flex items-center gap-2.5">
                <div class="w-10 h-10 rounded-xl overflow-hidden border border-brand-border flex-shrink-0 bg-brand-card">
                  <img src="${b.foto}" alt="${b.nombre}" class="w-full h-full object-cover object-top" onerror="this.src='img/laureano.jpg'">
                </div>
                <div>
                  <h4 class="text-sm font-bold text-white leading-tight">${b.nombre}</h4>
                  <span class="text-[11px] text-gray-400">Barbero Oficial</span>
                </div>
              </div>
              <span class="text-xs px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 font-bold border border-purple-500/20 flex items-center gap-1">
                <i data-lucide="scissors" class="w-3 h-3"></i> ${b.cortes} ${b.cortes === 1 ? 'corte' : 'cortes'}
              </span>
            </div>

            <!-- Total recaudado por sus cortes -->
            <div class="mb-3 p-2.5 bg-brand-card rounded-lg border border-brand-border">
              <div class="flex justify-between items-center text-xs text-gray-400 mb-1">
                <span>Total Facturado:</span>
                <span class="font-bold text-white text-sm">${formatCurrency(b.totalFacturado)}</span>
              </div>
              <div class="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-brand-border/50">
                <span>💵 Ef: <b class="text-emerald-400 font-medium">${formatCurrency(b.totalEfectivo)}</b></span>
                <span><img src="img/mercadopago.jpg" class="w-3 h-3 rounded inline-block bg-white"> MP: <b class="text-sky-400 font-medium">${formatCurrency(b.totalMercadoPago)}</b></span>
              </div>
            </div>

            <!-- Reparto 50% / 50% -->
            <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div class="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <span class="text-[10px] uppercase tracking-wider font-bold text-emerald-400 block mb-0.5">Sueldo Barbero (50%)</span>
                <span class="text-base font-black text-emerald-400">${formatCurrency(b.gananciaBarbero)}</span>
              </div>
              <div class="p-2.5 rounded-lg bg-amber-500/10 border border-brand-gold/30">
                <span class="text-[10px] uppercase tracking-wider font-bold text-brand-gold block mb-0.5">Cero y Medio (50%)</span>
                <span class="text-base font-black text-brand-gold">${formatCurrency(b.gananciaLocal)}</span>
              </div>
            </div>
          </div>

          <!-- Botón Enviar WhatsApp al Barbero -->
          <button onclick="compartirWhatsAppLiquidacionBarbero('${b.nombre.replace(/'/g, "\\'")}')" class="w-full py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 mt-2">
            <i data-lucide="send" class="w-3.5 h-3.5"></i>
            <span>Enviar Liquidación WhatsApp</span>
          </button>
        </div>
      `).join('');
    }
  }

  // Renderizar historial de Cierres Semanales guardados
  renderHistorialCierresSemanales();

  if (window.lucide) lucide.createIcons();
}

// Renderizar la lista de cierres semanales previamente guardados
function renderHistorialCierresSemanales() {
  const container = document.getElementById('historialCierresSemanalesContainer');
  if (!container) return;

  const cierres = StorageService.getAllCierresSemanales();

  if (cierres.length === 0) {
    container.innerHTML = `
      <div class="p-6 bg-brand-dark rounded-xl border border-brand-border text-center text-gray-500">
        <i data-lucide="archive" class="w-8 h-8 mx-auto mb-2 opacity-30 text-gray-400"></i>
        <p class="text-xs font-semibold text-gray-300">Aún no hay cierres semanales archivados.</p>
        <p class="text-[11px] text-gray-500 mt-0.5">Al presionar "Guardar Cierre Semanal", quedará asentado aquí para control histórico de José y Diego.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = cierres.map(c => `
    <div class="p-4 bg-brand-dark rounded-xl border border-brand-border flex flex-col gap-3 shadow-md hover:border-brand-gold/30 transition-all">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-brand-border">
        <div class="flex items-center gap-2">
          <span class="p-1.5 rounded-lg bg-brand-gold/10 text-brand-gold">
            <i data-lucide="calendar-check" class="w-4 h-4"></i>
          </span>
          <div>
            <h4 class="text-sm font-bold text-white">${c.semanaLabel || `${c.semanaInicio} al ${c.semanaFin}`}</h4>
            <p class="text-[11px] text-gray-400">Guardado el ${c.guardadoEl || 'Fecha N/D'} • Por ${c.cerradoPor || 'Dueño'}</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="compartirWhatsAppCierreSemanal('${c.id}')" class="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-all flex items-center gap-1" title="Reenviar WhatsApp">
            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">WhatsApp</span>
          </button>
          <button onclick="eliminarCierreSemanal('${c.id}')" class="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium transition-all flex items-center gap-1" title="Eliminar registro">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Eliminar</span>
          </button>
        </div>
      </div>

      <!-- Resumen de números del cierre archivado -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div class="p-2 rounded-lg bg-brand-card border border-brand-border">
          <span class="text-[10px] text-gray-400 uppercase font-semibold block">Facturado Total</span>
          <span class="text-sm font-bold text-white">${formatCurrency(c.totalGeneral)}</span>
        </div>
        <div class="p-2 rounded-lg bg-amber-500/10 border border-brand-gold/20">
          <span class="text-[10px] text-brand-gold uppercase font-bold block">💈 Cero y Medio (50%)</span>
          <span class="text-sm font-bold text-brand-gold">${formatCurrency(c.totalCeroYMedio)}</span>
        </div>
        <div class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <span class="text-[10px] text-emerald-400 uppercase font-bold block">👥 Barberos (50%)</span>
          <span class="text-sm font-bold text-emerald-400">${formatCurrency(c.totalBarberos)}</span>
        </div>
        <div class="p-2 rounded-lg bg-brand-card border border-brand-border">
          <span class="text-[10px] text-gray-400 uppercase font-semibold block">✂️ Total Cortes</span>
          <span class="text-sm font-bold text-white">${c.totalCortes || 0}</span>
        </div>
      </div>

      <!-- Desglose por Barbero en el cierre archivado -->
      ${c.desgloseBarberos && c.desgloseBarberos.length > 0 ? `
        <div class="pt-2 border-t border-brand-border/60">
          <span class="text-[10px] text-gray-400 uppercase font-bold tracking-wider block mb-1.5">Liquidación por Barbero:</span>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            ${c.desgloseBarberos.filter(b => b.cortes > 0 || b.totalFacturado > 0).map(b => `
              <div class="p-2 rounded-lg bg-brand-card border border-brand-border/60 flex items-center justify-between">
                <div>
                  <span class="font-bold text-white block">${b.nombre}</span>
                  <span class="text-[11px] text-gray-400">${b.cortes} cortes • Facturado: ${formatCurrency(b.totalFacturado)}</span>
                </div>
                <div class="text-right">
                  <span class="text-[10px] text-gray-400 block">Sueldo 50%:</span>
                  <span class="font-black text-emerald-400">${formatCurrency(b.gananciaBarbero)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// Guardar y confirmar el Cierre Semanal actual
async function guardarCierreSemanalActual() {
  const session = StorageService.getSession();
  if (session && session.role !== 'dueno') {
    showToast('Solo los dueños pueden archivar el cierre semanal.', 'error');
    return;
  }

  const selectSemana = document.getElementById('selectSemanaLaboral');
  if (!selectSemana) return;

  const selectedOpt = selectSemana.options[selectSemana.selectedIndex];
  if (!selectedOpt) return;

  const fechaInicio = selectedOpt.dataset.inicio || selectedOpt.getAttribute('data-inicio');
  const fechaFin = selectedOpt.dataset.fin || selectedOpt.getAttribute('data-fin');
  const semanaId = selectedOpt.value;
  const semanaLabel = selectedOpt.textContent.trim();

  // Calcular cortes y métricas
  const todosCortes = StorageService.getAllCortes();
  const cortesSemana = todosCortes.filter(c => c.fecha >= fechaInicio && c.fecha <= fechaFin);

  let totalGeneral = 0;
  let totalEfectivo = 0;
  let totalMP = 0;

  cortesSemana.forEach(c => {
    const m = Number(c.monto) || 0;
    totalGeneral += m;
    if (c.metodoPago === 'EFECTIVO') totalEfectivo += m;
    else totalMP += m;
  });

  const barberosConfig = StorageService.getBarberos();
  const barberosMap = new Map();
  barberosConfig.forEach(b => {
    barberosMap.set(b.nombre.toLowerCase().trim(), { id: b.id, nombre: b.nombre, foto: b.foto || 'img/laureano.jpg' });
  });
  cortesSemana.forEach(c => {
    if (c.barberoNombre) {
      const k = c.barberoNombre.toLowerCase().trim();
      if (!barberosMap.has(k)) {
        barberosMap.set(k, { id: c.barberoId || ('b_' + k), nombre: c.barberoNombre, foto: 'img/laureano.jpg' });
      }
    }
  });

  const desgloseBarberos = Array.from(barberosMap.values()).map(b => {
    const k = b.nombre.toLowerCase().trim();
    const cortesB = cortesSemana.filter(c => (c.barberoId && c.barberoId === b.id) || ((c.barberoNombre || '').toLowerCase().trim() === k));
    let totB = 0;
    let efB = 0;
    let mpB = 0;
    cortesB.forEach(c => {
      const m = Number(c.monto) || 0;
      totB += m;
      if (c.metodoPago === 'EFECTIVO') efB += m;
      else mpB += m;
    });
    const gananciaBarbero = Math.round(totB * 0.5);
    const gananciaLocal = totB - gananciaBarbero;
    return {
      id: b.id,
      nombre: b.nombre,
      foto: b.foto,
      cortes: cortesB.length,
      totalFacturado: totB,
      totalEfectivo: efB,
      totalMercadoPago: mpB,
      gananciaBarbero,
      gananciaLocal
    };
  });

  const totalBarberos = desgloseBarberos.reduce((acc, b) => acc + b.gananciaBarbero, 0);
  const totalCeroYMedio = desgloseBarberos.reduce((acc, b) => acc + b.gananciaLocal, 0);

  const confirmacion = confirm(`¿Deseas guardar y archivar el Cierre Semanal?\n\n📅 ${semanaLabel}\n💰 Total Facturado: ${formatCurrency(totalGeneral)}\n💈 Neto Barbería Cero y Medio (50%): ${formatCurrency(totalCeroYMedio)}\n👥 Total a Barberos (50%): ${formatCurrency(totalBarberos)}\n✂️ Total Cortes: ${cortesSemana.length}`);

  if (!confirmacion) return;

  const cierreData = {
    id: 'cierre_sem_' + semanaId,
    semanaId: semanaId,
    semanaInicio: fechaInicio,
    semanaFin: fechaFin,
    semanaLabel: semanaLabel,
    totalGeneral,
    totalEfectivo,
    totalMercadoPago: totalMP,
    totalCortes: cortesSemana.length,
    totalCeroYMedio,
    totalBarberos,
    desgloseBarberos,
    cerradoPor: session ? session.name : 'Dueño',
    guardadoEl: new Date().toLocaleDateString('es-AR') + ' ' + getCurrentTime(),
    timestamp: Date.now()
  };

  await StorageService.guardarCierreSemanal(cierreData);
  showToast('¡Cierre semanal archivado exitosamente!', 'success');
  renderTabSemanal();
}

// Compartir resumen de cierre semanal completo por WhatsApp
function compartirWhatsAppCierreSemanal(cierreId = null) {
  let cierre = null;

  if (cierreId) {
    const list = StorageService.getAllCierresSemanales();
    cierre = list.find(c => c.id === cierreId);
  }

  if (!cierre) {
    // Tomar los datos de la semana actualmente seleccionada
    const selectSemana = document.getElementById('selectSemanaLaboral');
    if (!selectSemana) return;
    const selectedOpt = selectSemana.options[selectSemana.selectedIndex];
    if (!selectedOpt) return;

    const fechaInicio = selectedOpt.dataset.inicio || selectedOpt.getAttribute('data-inicio');
    const fechaFin = selectedOpt.dataset.fin || selectedOpt.getAttribute('data-fin');
    const todosCortes = StorageService.getAllCortes();
    const cortesSemana = todosCortes.filter(c => c.fecha >= fechaInicio && c.fecha <= fechaFin);

    let totalGeneral = 0;
    let totalEfectivo = 0;
    let totalMP = 0;
    cortesSemana.forEach(c => {
      const m = Number(c.monto) || 0;
      totalGeneral += m;
      if (c.metodoPago === 'EFECTIVO') totalEfectivo += m;
      else totalMP += m;
    });

    const barberosConfig = StorageService.getBarberos();
    const barberosMap = new Map();
    barberosConfig.forEach(b => barberosMap.set(b.nombre.toLowerCase().trim(), b.nombre));
    cortesSemana.forEach(c => {
      if (c.barberoNombre) barberosMap.set(c.barberoNombre.toLowerCase().trim(), c.barberoNombre);
    });

    const desglose = Array.from(barberosMap.values()).map(nombre => {
      const k = nombre.toLowerCase().trim();
      const cortesB = cortesSemana.filter(c => (c.barberoNombre || '').toLowerCase().trim() === k);
      const totB = cortesB.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
      const gananciaB = Math.round(totB * 0.5);
      return {
        nombre,
        cortes: cortesB.length,
        totalFacturado: totB,
        gananciaBarbero: gananciaB,
        gananciaLocal: totB - gananciaB
      };
    });

    cierre = {
      semanaLabel: selectedOpt.textContent.trim(),
      totalGeneral,
      totalEfectivo,
      totalMercadoPago: totalMP,
      totalCortes: cortesSemana.length,
      totalCeroYMedio: desglose.reduce((acc, b) => acc + b.gananciaLocal, 0),
      totalBarberos: desglose.reduce((acc, b) => acc + b.gananciaBarbero, 0),
      desgloseBarberos: desglose
    };
  }

  let msg = `💈 *BARBERÍA CERO Y MEDIO* 💈\n`;
  msg += `📋 *CIERRE SEMANAL (Lunes a Sábado)*\n`;
  msg += `📅 *Período:* ${cierre.semanaLabel}\n\n`;
  msg += `💰 *Total Facturado:* ${formatCurrency(cierre.totalGeneral)}\n`;
  msg += `💵 *Efectivo:* ${formatCurrency(cierre.totalEfectivo)}\n`;
  msg += `📱 *Mercado Pago:* ${formatCurrency(cierre.totalMercadoPago)}\n`;
  msg += `✂️ *Cortes Totales:* ${cierre.totalCortes}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💈 *NETO CERO Y MEDIO (50%):* ${formatCurrency(cierre.totalCeroYMedio)}\n`;
  msg += `👥 *A PAGAR BARBEROS (50%):* ${formatCurrency(cierre.totalBarberos)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `✂️ *LIQUIDACIÓN POR BARBERO:*\n`;

  const activos = (cierre.desgloseBarberos || []).filter(b => b.cortes > 0 || b.totalFacturado > 0);
  if (activos.length === 0) {
    msg += `(Sin cortes en el período)\n`;
  } else {
    activos.forEach(b => {
      msg += `• *${b.nombre}:* ${b.cortes} cortes\n`;
      msg += `   - Facturado: ${formatCurrency(b.totalFacturado)}\n`;
      msg += `   - Sueldo Barbero (50%): ${formatCurrency(b.gananciaBarbero)}\n`;
      msg += `   - Ganancia Barbería (50%): ${formatCurrency(b.gananciaLocal || b.gananciaBarbero)}\n\n`;
    });
  }

  msg += `_Sistema Barbería Cero y Medio_`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}

// Compartir liquidación individual de un barbero por WhatsApp
function compartirWhatsAppLiquidacionBarbero(barberoNombre) {
  const selectSemana = document.getElementById('selectSemanaLaboral');
  if (!selectSemana) return;
  const selectedOpt = selectSemana.options[selectSemana.selectedIndex];
  if (!selectedOpt) return;

  const fechaInicio = selectedOpt.dataset.inicio || selectedOpt.getAttribute('data-inicio');
  const fechaFin = selectedOpt.dataset.fin || selectedOpt.getAttribute('data-fin');

  const todosCortes = StorageService.getAllCortes();
  const k = barberoNombre.toLowerCase().trim();
  const cortesB = todosCortes.filter(c => {
    const matchFecha = c.fecha >= fechaInicio && c.fecha <= fechaFin;
    const matchBarbero = (c.barberoNombre || '').toLowerCase().trim() === k;
    return matchFecha && matchBarbero;
  });

  let totB = 0;
  let efB = 0;
  let mpB = 0;
  cortesB.forEach(c => {
    const m = Number(c.monto) || 0;
    totB += m;
    if (c.metodoPago === 'EFECTIVO') efB += m;
    else mpB += m;
  });

  const sueldo50 = Math.round(totB * 0.5);
  const aporteLocal = totB - sueldo50;

  let msg = `💈 *BARBERÍA CERO Y MEDIO* 💈\n`;
  msg += `📋 *LIQUIDACIÓN SEMANAL DE CORTE*\n`;
  msg += `👤 *Barbero:* ${barberoNombre}\n`;
  msg += `📅 *Período:* ${selectedOpt.textContent.trim()}\n\n`;
  msg += `✂️ *Cortes Realizados:* ${cortesB.length}\n`;
  msg += `💰 *Total Facturado:* ${formatCurrency(totB)}\n`;
  msg += `   • Efectivo: ${formatCurrency(efB)}\n`;
  msg += `   • Mercado Pago: ${formatCurrency(mpB)}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💵 *SUELDO A COBRAR (50%):* ${formatCurrency(sueldo50)}\n`;
  msg += `💈 *Aporte Barbería Cero y Medio (50%):* ${formatCurrency(aporteLocal)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `¡Excelente trabajo esta semana!\n`;
  msg += `_Sistema Barbería Cero y Medio_`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}

// Eliminar un cierre semanal guardado
async function eliminarCierreSemanal(id) {
  const confirmacion = confirm('¿Deseas eliminar este registro de Cierre Semanal archivado?');
  if (!confirmacion) return;

  await StorageService.deleteCierreSemanal(id);
  showToast('Cierre semanal eliminado', 'info');
  renderTabSemanal();
}

// ============================================================
// TAB 5: CONFIGURACIÓN
// ============================================================
function renderConfigTab() {
  renderConfigBarberos();
  renderConfigServicios();
}

function renderConfigBarberos() {
  const container = document.getElementById('listaConfigBarberos');
  if (!container) return;
  const barberos = StorageService.getBarberos();

  container.innerHTML = barberos.map(b => `
    <div class="p-3 bg-brand-dark rounded-xl border border-brand-border flex items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <div class="w-10 h-10 rounded-xl overflow-hidden border border-brand-border flex-shrink-0 bg-brand-card">
          <img src="${b.foto || 'img/laureano.jpg'}" alt="${b.nombre}" class="w-full h-full object-cover object-top">
        </div>
        <div>
          <span class="text-sm font-bold text-white block">${b.nombre}</span>
          <span class="text-xs text-gray-400">Barbero</span>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button onclick="editarBarbero('${b.id}')" class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-brand-card transition-colors">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
        <button onclick="eliminarBarbero('${b.id}')" class="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function renderConfigServicios() {
  const container = document.getElementById('listaConfigServicios');
  if (!container) return;
  const servicios = StorageService.getServicios();

  container.innerHTML = servicios.map(s => `
    <div class="p-3 bg-brand-dark rounded-xl border border-brand-border flex items-center justify-between gap-3">
      <div>
        <span class="text-sm font-bold text-white block">${s.nombre}</span>
        <span class="text-xs text-brand-gold font-semibold">${formatCurrency(s.precio)}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button onclick="editarServicio('${s.id}')" class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-brand-card transition-colors">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
        <button onclick="eliminarServicio('${s.id}')" class="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// MODAL BARBERO
function openModalNuevoBarbero() {
  document.getElementById('modalBarberoTitle').textContent = 'Nuevo Barbero';
  document.getElementById('barberoEditId').value = '';
  document.getElementById('inputBarberoNombre').value = '';
  document.getElementById('inputBarberoComision').value = 50;
  document.getElementById('modalBarbero').classList.remove('hidden');
}

function editarBarbero(id) {
  const b = StorageService.getBarberos().find(item => item.id === id);
  if (!b) return;
  document.getElementById('modalBarberoTitle').textContent = 'Editar Barbero';
  document.getElementById('barberoEditId').value = b.id;
  document.getElementById('inputBarberoNombre').value = b.nombre;
  document.getElementById('inputBarberoComision').value = b.comision || 50;
  document.getElementById('modalBarbero').classList.remove('hidden');
}

function closeModalBarbero() {
  document.getElementById('modalBarbero').classList.add('hidden');
}

function guardarBarbero(event) {
  event.preventDefault();
  const id = document.getElementById('barberoEditId').value;
  const nombre = document.getElementById('inputBarberoNombre').value.trim();
  const comision = parseInt(document.getElementById('inputBarberoComision').value) || 50;

  if (!nombre) return;

  StorageService.upsertBarbero({ id: id || undefined, nombre, comision });
  closeModalBarbero();
  showToast('Barbero guardado con éxito.', 'success');
  renderAllViews();
}

function eliminarBarbero(id) {
  if (confirm('¿Deseas eliminar este barbero? Sus cortes anteriores se mantendrán.')) {
    StorageService.deleteBarbero(id);
    showToast('Barbero eliminado.', 'info');
    renderAllViews();
  }
}

// MODAL SERVICIO
function openModalNuevoServicio() {
  document.getElementById('modalServicioTitle').textContent = 'Nuevo Servicio';
  document.getElementById('servicioEditId').value = '';
  document.getElementById('inputServicioNombre').value = '';
  document.getElementById('inputServicioPrecio').value = '';
  document.getElementById('modalServicio').classList.remove('hidden');
}

function editarServicio(id) {
  const s = StorageService.getServicios().find(item => item.id === id);
  if (!s) return;
  document.getElementById('modalServicioTitle').textContent = 'Editar Servicio';
  document.getElementById('servicioEditId').value = s.id;
  document.getElementById('inputServicioNombre').value = s.nombre;
  document.getElementById('inputServicioPrecio').value = s.precio;
  document.getElementById('modalServicio').classList.remove('hidden');
}

function closeModalServicio() {
  document.getElementById('modalServicio').classList.add('hidden');
}

function guardarServicio(event) {
  event.preventDefault();
  const id = document.getElementById('servicioEditId').value;
  const nombre = document.getElementById('inputServicioNombre').value.trim();
  const precio = parseFloat(document.getElementById('inputServicioPrecio').value);

  if (!nombre || isNaN(precio)) return;

  StorageService.upsertServicio({ id: id || undefined, nombre, precio });
  closeModalServicio();
  showToast('Servicio guardado con éxito.', 'success');
  renderAllViews();
}

function eliminarServicio(id) {
  if (confirm('¿Deseas eliminar este servicio de la lista de opciones?')) {
    StorageService.deleteServicio(id);
    showToast('Servicio eliminado.', 'info');
    renderAllViews();
  }
}

// ============================================================
// TAB: CORTES ADEUDADOS (CUENTAS CORRIENTES / FIADOS)
// ============================================================

function actualizarBadgeAdeudados() {
  const badge = document.getElementById('badgeAdeudadosCount');
  if (!badge) return;
  const count = StorageService.getAdeudados().length;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function openModalNuevoAdeudado() {
  const modal = document.getElementById('modalNuevoAdeudado');
  const selBarbero = document.getElementById('inputAdeudadoBarbero');
  const selServicio = document.getElementById('inputAdeudadoServicio');
  const inputMonto = document.getElementById('inputAdeudadoMonto');
  const inputFecha = document.getElementById('inputAdeudadoFecha');
  const inputHora = document.getElementById('inputAdeudadoHora');
  const inputNombre = document.getElementById('inputAdeudadoClienteNombre');
  const inputNotas = document.getElementById('inputAdeudadoNotas');

  const barberos = StorageService.getBarberos().filter(b => b.activo !== false);
  const servicios = StorageService.getServicios();

  if (selBarbero) {
    selBarbero.innerHTML = barberos.map(b => `<option value="${b.id}">${b.nombre}</option>`).join('');
  }
  if (selServicio) {
    selServicio.innerHTML = servicios.map(s => `<option value="${s.id}" data-precio="${s.precio}">${s.nombre} - ${formatCurrency(s.precio)}</option>`).join('');
  }

  if (servicios.length > 0 && inputMonto) {
    inputMonto.value = servicios[0].precio;
  }

  if (inputFecha) inputFecha.value = getTodayISO();
  if (inputHora) inputHora.value = getCurrentTime();
  if (inputNombre) inputNombre.value = '';
  if (inputNotas) inputNotas.value = '';

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (inputNombre) inputNombre.focus();
  }
  if (window.lucide) lucide.createIcons();
}

function closeModalNuevoAdeudado() {
  const modal = document.getElementById('modalNuevoAdeudado');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function actualizarMontoNuevoAdeudado() {
  const selServicio = document.getElementById('inputAdeudadoServicio');
  const inputMonto = document.getElementById('inputAdeudadoMonto');
  if (selServicio && inputMonto) {
    const opt = selServicio.options[selServicio.selectedIndex];
    if (opt && opt.dataset.precio) {
      inputMonto.value = opt.dataset.precio;
    }
  }
}

async function guardarNuevoAdeudado(event) {
  event.preventDefault();
  const inputNombre = document.getElementById('inputAdeudadoClienteNombre');
  const selBarbero = document.getElementById('inputAdeudadoBarbero');
  const selServicio = document.getElementById('inputAdeudadoServicio');
  const inputMonto = document.getElementById('inputAdeudadoMonto');
  const inputFecha = document.getElementById('inputAdeudadoFecha');
  const inputHora = document.getElementById('inputAdeudadoHora');
  const inputNotas = document.getElementById('inputAdeudadoNotas');

  const nombre = inputNombre ? inputNombre.value.trim() : '';
  const monto = parseFloat(inputMonto ? inputMonto.value : 0);

  if (!nombre) {
    showToast('Ingresa el nombre de la persona que se cortó.', 'error');
    return;
  }

  if (isNaN(monto) || monto <= 0) {
    showToast('Ingresa un monto adeudado válido.', 'error');
    return;
  }

  const barberos = StorageService.getBarberos();
  const barbero = barberos.find(b => b.id === (selBarbero ? selBarbero.value : '')) || barberos[0] || { id: 'barbero-1', nombre: 'Laureano' };

  const servicios = StorageService.getServicios();
  const servicio = servicios.find(s => s.id === (selServicio ? selServicio.value : '')) || { nombre: 'Corte' };

  await StorageService.agregarAdeudado({
    clienteNombre: nombre,
    barberoId: barbero.id,
    barberoNombre: barbero.nombre,
    servicioNombre: servicio.nombre,
    monto: monto,
    fecha: inputFecha && inputFecha.value ? inputFecha.value : getTodayISO(),
    hora: inputHora && inputHora.value ? inputHora.value : getCurrentTime(),
    notas: inputNotas ? inputNotas.value.trim() : ''
  });

  closeModalNuevoAdeudado();
  actualizarBadgeAdeudados();
  renderTabAdeudados();
  showToast(`Corte adeudado anotado para ${nombre} ($${monto.toLocaleString('es-AR')}). NO suma a caja hasta el pago.`, 'info');
}

function iniciarCobroAdeudado(id) {
  const adeudados = StorageService.getAdeudados();
  const adeudado = adeudados.find(a => a.id === id);
  if (!adeudado) {
    showToast('Corte adeudado no encontrado.', 'error');
    return;
  }

  const modal = document.getElementById('modalCobrarAdeudado');
  const hiddenId = document.getElementById('cobroAdeudadoId');
  const txtCliente = document.getElementById('cobroAdeudadoClienteText');
  const txtBarbero = document.getElementById('cobroAdeudadoBarberoText');
  const txtServicio = document.getElementById('cobroAdeudadoServicioText');
  const inputMonto = document.getElementById('inputCobroAdeudadoMonto');

  if (hiddenId) hiddenId.value = adeudado.id;
  if (txtCliente) txtCliente.textContent = adeudado.clienteNombre;
  if (txtBarbero) txtBarbero.textContent = adeudado.barberoNombre;
  if (txtServicio) txtServicio.textContent = `${adeudado.servicioNombre || 'Corte'} • ${adeudado.fecha} ${adeudado.hora}`;
  if (inputMonto) inputMonto.value = adeudado.monto;

  // Seleccionar efectivo por defecto
  const radioEfectivo = document.querySelector('input[name="cobroAdeudadoMetodo"][value="EFECTIVO"]');
  if (radioEfectivo) radioEfectivo.checked = true;

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
  if (window.lucide) lucide.createIcons();
}

function closeModalCobrarAdeudado() {
  const modal = document.getElementById('modalCobrarAdeudado');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function confirmarCobroAdeudado(event) {
  event.preventDefault();

  const id = document.getElementById('cobroAdeudadoId').value;
  const inputMonto = document.getElementById('inputCobroAdeudadoMonto');
  const monto = parseFloat(inputMonto ? inputMonto.value : 0);
  const metodoPago = document.querySelector('input[name="cobroAdeudadoMetodo"]:checked')?.value || 'EFECTIVO';

  if (isNaN(monto) || monto <= 0) {
    showToast('Ingresa un monto cobrado válido.', 'error');
    return;
  }

  // Si la caja de hoy está cerrada, consultar para reabrirla
  const cierreHoy = StorageService.getCierreHoy();
  if (cierreHoy) {
    const continuar = confirm(`La caja de hoy figura cerrada.\n\n¿Deseas abrir la caja ahora para registrar el cobro de este corte adeudado y continuar?`);
    if (!continuar) return;
    await StorageService.reabrirCajaHoy();
    checkCajaStatus();
  }

  const adeudados = StorageService.getAdeudados();
  const adeudado = adeudados.find(a => a.id === id);
  const clienteNombre = adeudado ? adeudado.clienteNombre : 'Cliente';

  await StorageService.marcarAdeudadoPagado(id, {
    monto: monto,
    metodoPago: metodoPago,
    fecha: getTodayISO(),
    hora: getCurrentTime()
  });

  closeModalCobrarAdeudado();

  if (window.confetti) {
    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10B981', '#D4AF37', '#009EE3']
    });
  }

  showToast(`¡Pago de $${monto.toLocaleString('es-AR')} recibido de ${clienteNombre}! Ingresó a caja (${metodoPago}).`, 'success');

  renderAllViews();
  renderTabAdeudados();
}

async function eliminarAdeudadoConfirm(id) {
  const adeudados = StorageService.getAdeudados();
  const adeudado = adeudados.find(a => a.id === id);
  const clienteNombre = adeudado ? adeudado.clienteNombre : 'este corte';

  if (!confirm(`¿Estás seguro de que deseas anular/eliminar el corte adeudado de "${clienteNombre}"?`)) {
    return;
  }

  await StorageService.deleteAdeudado(id);
  actualizarBadgeAdeudados();
  renderTabAdeudados();
  showToast(`Corte adeudado de ${clienteNombre} eliminado.`, 'info');
}

function renderTabAdeudados() {
  actualizarBadgeAdeudados();

  const container = document.getElementById('gridAdeudadosContainer');
  const kpiMonto = document.getElementById('kpiAdeudadosTotalMonto');
  const kpiCount = document.getElementById('kpiAdeudadosCount');
  const kpiPromedio = document.getElementById('kpiAdeudadosPromedio');
  const searchInput = document.getElementById('inputBuscarAdeudado');
  const filtroBarbero = document.getElementById('filtroBarberoAdeudado');

  const adeudados = StorageService.getAdeudados();

  // Popular filtro de barberos si no está inicializado
  if (filtroBarbero && filtroBarbero.options.length <= 1) {
    const barberos = StorageService.getBarberos();
    barberos.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.nombre;
      filtroBarbero.appendChild(opt);
    });
  }

  // KPIs
  const totalMonto = adeudados.reduce((acc, a) => acc + (Number(a.monto) || 0), 0);
  const totalCount = adeudados.length;
  const promedio = totalCount > 0 ? Math.round(totalMonto / totalCount) : 0;

  if (kpiMonto) kpiMonto.textContent = formatCurrency(totalMonto);
  if (kpiCount) kpiCount.textContent = totalCount;
  if (kpiPromedio) kpiPromedio.textContent = formatCurrency(promedio);

  if (!container) return;

  // Filtrado
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const barberoFilter = filtroBarbero ? filtroBarbero.value : 'todos';

  let filtrados = adeudados;
  if (query) {
    filtrados = filtrados.filter(a =>
      (a.clienteNombre && a.clienteNombre.toLowerCase().includes(query)) ||
      (a.notas && a.notas.toLowerCase().includes(query)) ||
      (a.servicioNombre && a.servicioNombre.toLowerCase().includes(query))
    );
  }

  if (barberoFilter !== 'todos') {
    filtrados = filtrados.filter(a => a.barberoId === barberoFilter);
  }

  if (filtrados.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-brand-card p-10 rounded-2xl border border-brand-border text-center text-gray-400">
        <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <i data-lucide="clipboard-check" class="w-8 h-8 opacity-60"></i>
        </div>
        <h3 class="text-base font-bold text-white mb-1">No hay cortes adeudados ${query || barberoFilter !== 'todos' ? 'que coincidan con la búsqueda' : 'pendientes'}</h3>
        <p class="text-xs text-gray-500 mb-4">${query || barberoFilter !== 'todos' ? 'Intenta modificar el filtro o término de búsqueda.' : '¡Excelente! Todas las cuentas de cortes están al día.'}</p>
        <button onclick="openModalNuevoAdeudado()" class="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold rounded-xl text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer">
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          <span>Anotar Corte Adeudado</span>
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = filtrados.map(a => {
    // Antigüedad de la deuda para dar tranquilidad de que se conserva día tras día
    let antiguedadLabel = 'Anotado hoy';
    let antiguedadColor = 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    if (a.fecha) {
      const hoy = getTodayISO();
      if (a.fecha !== hoy) {
        const d1 = new Date(a.fecha + 'T00:00:00');
        const d2 = new Date(hoy + 'T00:00:00');
        const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          antiguedadLabel = 'Anotado ayer';
          antiguedadColor = 'text-orange-400 bg-orange-500/15 border-orange-500/30';
        } else if (diffDays > 1) {
          antiguedadLabel = `Pendiente hace ${diffDays} días`;
          antiguedadColor = 'text-amber-300 bg-amber-500/20 border-amber-500/40';
        }
      }
    }

    return `
      <div class="bg-brand-card rounded-2xl border border-amber-500/30 p-5 shadow-xl flex flex-col justify-between space-y-4 hover:border-amber-500/50 transition-all">
        <!-- Encabezado de la Tarjeta -->
        <div>
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/30 flex-shrink-0">
                ${getInitials(a.clienteNombre)}
              </div>
              <div class="overflow-hidden">
                <h4 class="text-base font-bold text-white truncate">${a.clienteNombre}</h4>
                <div class="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  <span class="text-brand-gold font-medium">✂️ ${a.barberoNombre || 'Laureano'}</span>
                  <span>•</span>
                  <span>${a.servicioNombre || 'Corte'}</span>
                </div>
              </div>
            </div>

            <!-- Botón Eliminar / Anular -->
            <button onclick="eliminarAdeudadoConfirm('${a.id}')" title="Anular o eliminar deuda" class="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- Monto y Estado con Antigüedad -->
          <div class="mt-4 p-3.5 bg-brand-dark rounded-xl border border-brand-border flex items-center justify-between">
            <div>
              <span class="text-[11px] text-gray-400 uppercase tracking-wider block">Deuda Pendiente</span>
              <span class="text-xl font-black text-amber-400">${formatCurrency(a.monto)}</span>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                Pendiente
              </span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${antiguedadColor}">
                <i data-lucide="clock" class="w-3 h-3"></i> ${antiguedadLabel}
              </span>
            </div>
          </div>

          <!-- Detalle de Fecha, Hora y Notas -->
          <div class="mt-3 space-y-1 text-xs text-gray-400">
            <div class="flex items-center gap-1.5">
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-gray-500"></i>
              <span>Cortado el: <strong>${a.fecha || '--'}</strong> a las ${a.hora || '--:--'} hs</span>
            </div>
            ${a.notas ? `
              <div class="flex items-start gap-1.5 text-gray-400 bg-brand-dark/50 p-2 rounded-lg border border-brand-border/60 mt-1.5">
                <i data-lucide="file-text" class="w-3.5 h-3.5 text-amber-400/80 mt-0.5 flex-shrink-0"></i>
                <span class="italic text-[11px] leading-tight">${a.notas}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Botón de Acción Principal: Pago Recibido -->
        <div class="pt-2 border-t border-brand-border/60">
          <button type="button" onclick="iniciarCobroAdeudado('${a.id}')"
            class="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/35 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95">
            <i data-lucide="check-circle-2" class="w-4 h-4"></i>
            <span>Pago Recibido</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ============================================================
// TAB: CLIENTES & MEMBRESÍAS
// ============================================================
function renderTabClientes() {
  const container = document.getElementById('gridClientesContainer');
  if (!container) return;

  const clientes = StorageService.getClientes();
  const searchInput = document.getElementById('inputBuscarCliente');
  const filtroEstado = document.getElementById('filtroEstadoCliente');

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const estado = filtroEstado ? filtroEstado.value : 'todos';

  // KPIs
  const totalClientes = clientes.length;
  const membresiasActivas = clientes.filter(c => {
    const dias = c.membresia && c.membresia.fechaVencimiento ? getDiasRestantes(c.membresia.fechaVencimiento) : -1;
    return c.membresia && c.membresia.activa && dias >= 0;
  }).length;

  const totalCortesMembresia = clientes.reduce((acc, c) => acc + ((c.cortes && c.cortes.length) || 0), 0);

  const kpiTotal = document.getElementById('kpiTotalClientes');
  const kpiActivas = document.getElementById('kpiMembresiasActivas');
  const kpiCortes = document.getElementById('kpiCortesMembresiaTotal');

  if (kpiTotal) kpiTotal.textContent = totalClientes;
  if (kpiActivas) kpiActivas.textContent = membresiasActivas;
  if (kpiCortes) kpiCortes.textContent = totalCortesMembresia;

  // Filtrar
  let filtrados = clientes;
  if (query) {
    filtrados = filtrados.filter(c => 
      c.nombre.toLowerCase().includes(query) || 
      (c.telefono && c.telefono.toLowerCase().includes(query))
    );
  }

  if (estado === 'activas') {
    filtrados = filtrados.filter(c => {
      const dias = c.membresia && c.membresia.fechaVencimiento ? getDiasRestantes(c.membresia.fechaVencimiento) : -1;
      return c.membresia && c.membresia.activa && dias >= 0;
    });
  } else if (estado === 'vencidas') {
    filtrados = filtrados.filter(c => {
      const dias = c.membresia && c.membresia.fechaVencimiento ? getDiasRestantes(c.membresia.fechaVencimiento) : -1;
      return !c.membresia || !c.membresia.activa || dias < 0;
    });
  }

  if (filtrados.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-brand-card p-10 rounded-2xl border border-brand-border text-center text-gray-400">
        <i data-lucide="users" class="w-12 h-12 mx-auto mb-3 opacity-30 text-brand-gold"></i>
        <h3 class="text-base font-bold text-white mb-1">No se encontraron clientes</h3>
        <p class="text-xs text-gray-500 mb-4">${query || estado !== 'todos' ? 'Intenta cambiar el término de búsqueda o el filtro.' : 'Empieza agregando tu primer cliente con membresía.'}</p>
        <button onclick="openModalNuevoCliente()" class="px-4 py-2 bg-brand-gold hover:bg-brand-goldHover text-black font-bold rounded-xl text-xs inline-flex items-center gap-1.5 transition-all">
          <i data-lucide="user-plus" class="w-4 h-4"></i>
          <span>Agregar Cliente</span>
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = filtrados.map(c => {
    const dias = c.membresia && c.membresia.fechaVencimiento ? getDiasRestantes(c.membresia.fechaVencimiento) : -1;
    const tieneMembresiaActiva = c.membresia && c.membresia.activa && dias >= 0;
    const cortesCount = (c.cortes && c.cortes.length) || 0;
    const ultimoPago = c.pagos && c.pagos.length > 0 ? c.pagos[0] : null;

    let badgeEstado = '';
    if (tieneMembresiaActiva) {
      badgeEstado = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Activa • ${dias} días restantes
        </span>
      `;
    } else if (c.membresia && c.membresia.fechaVencimiento) {
      badgeEstado = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
          <span class="w-2 h-2 rounded-full bg-red-400"></span>
          Vencida hace ${Math.abs(dias)} días
        </span>
      `;
    } else {
      badgeEstado = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/15 text-gray-400 border border-gray-500/30">
          Sin Membresía Activa
        </span>
      `;
    }

    // Teléfono / WhatsApp limpio para enlace
    let whatsappBtn = '';
    if (c.telefono) {
      const numLimpio = c.telefono.replace(/\D/g, '');
      const waUrl = `https://wa.me/549${numLimpio}`;
      whatsappBtn = `
        <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 font-medium">
          <i data-lucide="message-circle" class="w-3 h-3"></i>
          <span>${c.telefono}</span>
        </a>
      `;
    } else {
      whatsappBtn = `<span class="text-[11px] text-gray-500">Sin teléfono</span>`;
    }

    return `
      <div class="bg-brand-card rounded-2xl border ${tieneMembresiaActiva ? 'border-brand-gold/40 shadow-brand-gold/5' : 'border-brand-border'} p-5 shadow-xl flex flex-col justify-between space-y-4">
        
        <!-- Header de la tarjeta -->
        <div>
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-gold/20 to-brand-gold/5 border border-brand-gold/30 text-brand-gold font-black flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                ${getInitials(c.nombre)}
              </div>
              <div class="overflow-hidden">
                <h3 class="text-base font-bold text-white truncate">${c.nombre}</h3>
                <div class="mt-0.5">${whatsappBtn}</div>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="openModalEditarCliente('${c.id}')" class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-brand-dark transition-colors" title="Editar datos">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="eliminarClienteConfirm('${c.id}')" class="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Dar de baja cliente VIP">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <div class="mt-3.5">
            ${badgeEstado}
          </div>
        </div>

        <!-- Métricas / Datos del Cliente -->
        <div class="bg-brand-dark/70 rounded-xl p-3 border border-brand-border space-y-2 text-xs">
          <div class="flex items-center justify-between text-gray-400">
            <span class="flex items-center gap-1.5"><i data-lucide="scissors" class="w-3.5 h-3.5 text-brand-gold"></i> Cortes realizados:</span>
            <span class="font-bold text-white">${cortesCount} cortes</span>
          </div>

          <div class="flex items-center justify-between text-gray-400">
            <span class="flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5 text-sky-400"></i> Vencimiento:</span>
            <span class="font-semibold ${tieneMembresiaActiva ? 'text-emerald-400' : 'text-gray-400'}">
              ${c.membresia && c.membresia.fechaVencimiento ? formatDateReadable(c.membresia.fechaVencimiento) : 'No definida'}
            </span>
          </div>

          ${ultimoPago ? `
            <div class="flex items-center justify-between pt-1.5 border-t border-brand-border/60 text-[11px] text-gray-400">
              <span>Último cobro:</span>
              <span class="font-bold text-brand-gold">${formatCurrency(ultimoPago.monto)} (${ultimoPago.metodoPago === 'MERCADOPAGO' ? 'Mercado Pago' : 'Efectivo'})</span>
            </div>
          ` : ''}

          ${c.notas ? `
            <div class="pt-1.5 border-t border-brand-border/60 text-[11px] text-gray-400 italic truncate">
              "${c.notas}"
            </div>
          ` : ''}
        </div>

        <!-- Acciones Rápidas -->
        <div class="space-y-2 pt-1">
          <div class="grid grid-cols-2 gap-2">
            <button onclick="openModalCorteMembresia('${c.id}')" class="py-2 px-3 bg-brand-dark hover:bg-brand-cardHover border border-brand-border text-gray-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5">
              <i data-lucide="scissors" class="w-3.5 h-3.5 text-brand-gold"></i>
              <span>Cargar Corte</span>
            </button>

            <button onclick="openModalPagoMembresia('${c.id}')" class="py-2 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5">
              <i data-lucide="credit-card" class="w-3.5 h-3.5"></i>
              <span>Cobrar Cuota</span>
            </button>
          </div>

          <button onclick="openModalHistorialCliente('${c.id}')" class="w-full py-2 bg-brand-dark/50 hover:bg-brand-dark border border-brand-border text-gray-400 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            <span>Ver Historial de Cortes y Pagos</span>
          </button>
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// MODAL ALTA / EDICIÓN CLIENTE
function openModalNuevoCliente() {
  document.getElementById('modalClienteTitle').textContent = 'Nuevo Cliente VIP';
  document.getElementById('clienteEditId').value = '';
  document.getElementById('inputClienteNombre').value = '';
  document.getElementById('inputClienteTelefono').value = '';
  document.getElementById('inputClientePrecioMembresia').value = '25000';
  document.getElementById('inputClienteNotas').value = '';
  document.getElementById('modalCliente').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function openModalEditarCliente(id) {
  const cliente = StorageService.getClienteById(id);
  if (!cliente) return;

  document.getElementById('modalClienteTitle').textContent = 'Editar Cliente';
  document.getElementById('clienteEditId').value = cliente.id;
  document.getElementById('inputClienteNombre').value = cliente.nombre;
  document.getElementById('inputClienteTelefono').value = cliente.telefono || '';
  document.getElementById('inputClientePrecioMembresia').value = (cliente.membresia && cliente.membresia.precioMensual) || 25000;
  document.getElementById('inputClienteNotas').value = cliente.notas || '';
  document.getElementById('modalCliente').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeModalCliente() {
  document.getElementById('modalCliente').classList.add('hidden');
}

async function guardarCliente(event) {
  event.preventDefault();
  const id = document.getElementById('clienteEditId').value;
  const nombre = document.getElementById('inputClienteNombre').value.trim();
  const telefono = document.getElementById('inputClienteTelefono').value.trim();
  const precioMensual = parseFloat(document.getElementById('inputClientePrecioMembresia').value) || 25000;
  const notas = document.getElementById('inputClienteNotas').value.trim();

  if (!nombre) {
    showToast('Por favor ingresa el nombre del cliente.', 'error');
    return;
  }

  let clienteExistente = id ? StorageService.getClienteById(id) : null;
  const membresiaActual = clienteExistente && clienteExistente.membresia ? clienteExistente.membresia : {
    activa: false,
    precioMensual: precioMensual,
    fechaInicio: null,
    fechaVencimiento: null,
    cortesIncluidos: 'ilimitado'
  };
  membresiaActual.precioMensual = precioMensual;

  const dataCliente = {
    id: id || undefined,
    nombre,
    telefono,
    notas,
    membresia: membresiaActual
  };

  await StorageService.upsertCliente(dataCliente);
  closeModalCliente();
  showToast(`Cliente ${id ? 'actualizado' : 'dado de alta'} con éxito.`, 'success');
  renderAllViews();
}

async function eliminarClienteConfirm(id) {
  const cliente = StorageService.getClienteById(id);
  if (!cliente) return;

  if (confirm(`¿Estás seguro de que deseas dar de baja a ${cliente.nombre} de los clientes VIP?`)) {
    await StorageService.deleteCliente(id);
    showToast(`Cliente ${cliente.nombre} dado de baja con éxito.`, 'info');
    renderAllViews();
  }
}

// MODAL COBRO DE MEMBRESÍA
function openModalPagoMembresia(clienteId) {
  const cliente = StorageService.getClienteById(clienteId);
  if (!cliente) return;

  document.getElementById('pagoClienteId').value = cliente.id;
  document.getElementById('pagoClienteNombreText').textContent = cliente.nombre;
  document.getElementById('inputPagoMonto').value = (cliente.membresia && cliente.membresia.precioMensual) || 25000;
  document.getElementById('inputPagoFecha').value = getTodayISO();
  document.getElementById('inputPagoDias').value = 30;
  document.getElementById('checkRegistrarPagoEnCaja').checked = true;

  document.getElementById('modalPagoMembresia').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeModalPagoMembresia() {
  document.getElementById('modalPagoMembresia').classList.add('hidden');
}

async function ejecutarCobroMembresia(event) {
  event.preventDefault();

  const clienteId = document.getElementById('pagoClienteId').value;
  const monto = parseFloat(document.getElementById('inputPagoMonto').value);
  const metodoPago = document.querySelector('input[name="pagoMetodo"]:checked')?.value || 'EFECTIVO';
  const fecha = document.getElementById('inputPagoFecha').value || getTodayISO();
  const diasValidez = parseInt(document.getElementById('inputPagoDias').value, 10) || 30;
  const registrarEnCaja = document.getElementById('checkRegistrarPagoEnCaja').checked;

  if (isNaN(monto) || monto <= 0) {
    showToast('Por favor ingresa un monto válido.', 'error');
    return;
  }

  const cliente = await StorageService.registrarPagoMembresia(clienteId, {
    monto,
    metodoPago,
    fecha,
    hora: getCurrentTime(),
    diasValidez,
    registrarEnCaja
  });

  closeModalPagoMembresia();

  if (window.confetti) {
    confetti({
      particleCount: 35,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#10B981', '#D4AF37', '#009EE3']
    });
  }

  showToast(`¡Membresía cobrada y activada para ${cliente ? cliente.nombre : 'el cliente'}!`, 'success');
  renderAllViews();
}

// MODAL REGISTRO DIRECTO DE CORTE CON MEMBRESÍA
function openModalCorteMembresia(clienteId) {
  const cliente = StorageService.getClienteById(clienteId);
  if (!cliente) return;

  document.getElementById('corteMembresiaClienteId').value = cliente.id;
  document.getElementById('corteMembresiaClienteNombre').textContent = cliente.nombre;
  document.getElementById('corteMembresiaFecha').value = getTodayISO();
  document.getElementById('corteMembresiaHora').value = getCurrentTime();

  document.getElementById('modalCorteMembresia').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeModalCorteMembresia() {
  document.getElementById('modalCorteMembresia').classList.add('hidden');
}

async function ejecutarCorteMembresia(event) {
  event.preventDefault();

  const clienteId = document.getElementById('corteMembresiaClienteId').value;
  const barberoId = document.getElementById('corteMembresiaBarberoId').value || 'barbero-1';
  const barberos = StorageService.getBarberos();
  const barbero = barberos.find(b => b.id === barberoId) || { id: 'barbero-1', nombre: 'Laureano' };
  const servicioNombre = document.getElementById('corteMembresiaServicioSelect').value || 'Corte';
  const fecha = document.getElementById('corteMembresiaFecha').value || getTodayISO();
  const hora = document.getElementById('corteMembresiaHora').value || getCurrentTime();

  const cliente = await StorageService.registrarCorteMembresia(clienteId, {
    barberoId: barbero.id,
    barberoNombre: barbero.nombre,
    servicioNombre,
    fecha,
    hora
  });

  closeModalCorteMembresia();

  if (window.confetti) {
    confetti({
      particleCount: 25,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#D4AF37', '#10B981']
    });
  }

  showToast(`¡Corte registrado a la membresía de ${cliente ? cliente.nombre : 'el cliente'}!`, 'success');
  renderAllViews();
}

// MODAL HISTORIAL COMPLETO DEL CLIENTE
function openModalHistorialCliente(clienteId) {
  const cliente = StorageService.getClienteById(clienteId);
  if (!cliente) return;

  document.getElementById('historialClienteNombre').textContent = cliente.nombre;
  document.getElementById('historialClienteTelefono').textContent = cliente.telefono ? `Tel / WA: ${cliente.telefono}` : 'Sin teléfono cargado';

  const dias = cliente.membresia && cliente.membresia.fechaVencimiento ? getDiasRestantes(cliente.membresia.fechaVencimiento) : -1;
  const estaActiva = cliente.membresia && cliente.membresia.activa && dias >= 0;

  const containerResumen = document.getElementById('historialClienteResumenMembresia');
  if (containerResumen) {
    if (estaActiva) {
      containerResumen.className = 'p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs';
      containerResumen.innerHTML = `
        <div class="flex items-center justify-between font-bold text-emerald-400 mb-1">
          <span class="flex items-center gap-1.5"><i data-lucide="shield-check" class="w-4 h-4"></i> Membresía Activa</span>
          <span>${dias} días restantes</span>
        </div>
        <p class="text-gray-300">Vence el <strong>${formatDateReadable(cliente.membresia.fechaVencimiento)}</strong>. Cuota mensual: ${formatCurrency(cliente.membresia.precioMensual || 0)}.</p>
      `;
    } else {
      containerResumen.className = 'p-3.5 rounded-xl border bg-red-500/10 border-red-500/30 text-xs';
      containerResumen.innerHTML = `
        <div class="flex items-center justify-between font-bold text-red-400 mb-1">
          <span class="flex items-center gap-1.5"><i data-lucide="alert-circle" class="w-4 h-4"></i> Membresía Vencida / Inactiva</span>
          <span>${dias < 0 ? 'Venció hace ' + Math.abs(dias) + ' días' : 'Sin pagos'}</span>
        </div>
        <p class="text-gray-300">Puedes cobrar la cuota mensual para renovar 30 días de vigencia.</p>
      `;
    }
  }

  // Lista de Cortes
  const cortes = cliente.cortes || [];
  document.getElementById('historialClienteTotalCortes').textContent = cortes.length;
  const containerCortes = document.getElementById('historialClienteListaCortes');
  if (containerCortes) {
    if (cortes.length === 0) {
      containerCortes.innerHTML = `<p class="text-xs text-gray-500 py-3 text-center">No hay cortes registrados para este cliente aún.</p>`;
    } else {
      containerCortes.innerHTML = cortes.map(c => `
        <div class="p-2.5 bg-brand-dark rounded-lg border border-brand-border flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-white block">${c.servicioNombre || 'Corte'}</span>
            <span class="text-[11px] text-gray-400">${formatDateReadable(c.fecha)} • ${c.hora} hs</span>
          </div>
          <div class="text-right">
            <span class="text-emerald-400 font-bold block">$0 (Membresía)</span>
            <span class="text-[10px] text-gray-500">Por ${c.barberoNombre || 'Laureano'}</span>
          </div>
        </div>
      `).join('');
    }
  }

  // Lista de Pagos
  const pagos = cliente.pagos || [];
  document.getElementById('historialClienteTotalPagos').textContent = pagos.length;
  const containerPagos = document.getElementById('historialClienteListaPagos');
  if (containerPagos) {
    if (pagos.length === 0) {
      containerPagos.innerHTML = `<p class="text-xs text-gray-500 py-3 text-center">No hay pagos registrados para este cliente aún.</p>`;
    } else {
      containerPagos.innerHTML = pagos.map(p => `
        <div class="p-2.5 bg-brand-dark rounded-lg border border-brand-border flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-white block">${formatDateReadable(p.fecha)} (${p.hora || '--:--'} hs)</span>
            <span class="text-[11px] text-gray-400">Vigencia hasta: ${formatDateReadable(p.fechaVencimiento)} (${p.diasValidez || 30} días)</span>
          </div>
          <div class="text-right">
            <span class="text-brand-gold font-bold block text-sm">${formatCurrency(p.monto)}</span>
            <span class="text-[10px] ${p.metodoPago === 'MERCADOPAGO' ? 'text-sky-400' : 'text-emerald-400'} font-semibold">
              ${p.metodoPago === 'MERCADOPAGO' ? 'Mercado Pago' : 'Efectivo'}
            </span>
          </div>
        </div>
      `).join('');
    }
  }

  document.getElementById('modalHistorialCliente').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeModalHistorialCliente() {
  document.getElementById('modalHistorialCliente').classList.add('hidden');
}

// BACKUP & RESTORE
function descargarCopiaSeguridad() {
  const json = StorageService.exportBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_barbercontrol_${getTodayISO()}.json`;
  a.click();
  showToast('Copia de seguridad descargada.', 'success');
}

function restaurarCopiaSeguridad(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const success = StorageService.importBackup(e.target.result);
    if (success) {
      showToast('¡Copia de seguridad restaurada con éxito!', 'success');
      renderAllViews();
    } else {
      showToast('Error al procesar el archivo de copia de seguridad.', 'error');
    }
  };
  reader.readAsText(file);
}

function confirmarBorradoDatos() {
  if (confirm('⚠️ ATENCIÓN: Esto borrará todos los cortes, barberos y cierres de caja cargados y volverá a los datos de fábrica. ¿Estás seguro?')) {
    StorageService.resetAll();
    initDefaultsIfEmpty();
    showToast('Datos restablecidos a valores de fábrica.', 'info');
    renderAllViews();
  }
}

// TOAST NOTIFICATIONS
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  let bgClass = 'bg-brand-card border-brand-border text-white';
  let icon = 'info';

  if (type === 'success') {
    bgClass = 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200';
    icon = 'check-circle';
  } else if (type === 'error') {
    bgClass = 'bg-red-950/90 border-red-500/40 text-red-200';
    icon = 'alert-circle';
  }

  toast.className = `p-3.5 rounded-xl border shadow-xl flex items-center gap-3 text-xs font-semibold animate-slideIn ${bgClass}`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
// CONTROL DE ACCESO, PERFILES Y AUTENTICACIÓN (BARBERO VS DUEÑO)
// ============================================================

// Estado local de la pantalla de login
let authLoginState = {
  selectedRole: 'barbero' // 'barbero' | 'dueno'
};

// Inicializar autenticación al cargar el sistema
function initAuth() {
  const session = StorageService.getSession();
  const loginScreen = document.getElementById('loginScreen');
  const pinInput = document.getElementById('loginPinInput');

  // Configurar detector de teclas en el campo PIN
  if (pinInput && !pinInput.dataset.listenerAttached) {
    pinInput.dataset.listenerAttached = 'true';
    pinInput.addEventListener('input', () => {
      hideLoginError();
      if (pinInput.value.length === 4) {
        setTimeout(submitLoginAuth, 120);
      }
    });
  }

  if (!session || !session.role) {
    // Si no hay sesión activa: mostrar pantalla de login
    if (loginScreen) {
      loginScreen.classList.remove('hidden');
      loginScreen.style.display = 'flex';
    }
    seleccionarPerfilLogin('barbero');
    renderUserHeader(null);
  } else {
    // Sesión activa existente: desbloquear interfaz
    if (loginScreen) {
      loginScreen.classList.add('hidden');
      loginScreen.style.display = 'none';
    }
    renderUserHeader(session);
    applyRolePermissions(session.role);
  }
}

// Seleccionar perfil en la pantalla de login
function seleccionarPerfilLogin(role) {
  authLoginState.selectedRole = role;

  const cardBarbero = document.getElementById('loginCardBarbero');
  const cardDueno = document.getElementById('loginCardDueno');
  const cardDiego = document.getElementById('loginCardDiego');
  const checkBarbero = document.getElementById('checkBarbero');
  const checkDueno = document.getElementById('checkDueno');
  const checkDiego = document.getElementById('checkDiego');
  const pinLabel = document.getElementById('loginPinLabel');
  const pinInput = document.getElementById('loginPinInput');

  hideLoginError();

  const profile = AUTH_PROFILES[role];
  const activeClass = 'p-3 rounded-2xl border-2 transition-all flex flex-col items-center text-center gap-1.5 relative group border-brand-gold bg-brand-gold/10 text-white shadow-lg shadow-brand-gold/10';
  const inactiveClass = 'p-3 rounded-2xl border-2 transition-all flex flex-col items-center text-center gap-1.5 relative group border-brand-border bg-brand-dark/60 text-gray-300 hover:border-gray-600';

  if (cardBarbero) cardBarbero.className = role === 'barbero' ? activeClass : inactiveClass;
  if (cardDueno) cardDueno.className = role === 'dueno' ? activeClass : inactiveClass;
  if (cardDiego) cardDiego.className = role === 'diego' ? activeClass : inactiveClass;

  if (checkBarbero) checkBarbero.classList.toggle('hidden', role !== 'barbero');
  if (checkDueno) checkDueno.classList.toggle('hidden', role !== 'dueno');
  if (checkDiego) checkDiego.classList.toggle('hidden', role !== 'diego');

  if (pinLabel && profile) {
    const icon = profile.role === 'barbero' ? 'scissors' : 'crown';
    const color = profile.role === 'barbero' ? 'text-brand-gold' : 'text-amber-400';
    pinLabel.innerHTML = `<i data-lucide="${icon}" class="w-3.5 h-3.5 ${color}"></i> <span>Ingresa el PIN de ${profile.nombre}${profile.role === 'dueno' ? ' (Dueño)' : ''}</span>`;
  }

  if (pinInput) {
    pinInput.value = '';
    pinInput.focus();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Teclado numérico: agregar dígito
function keypadAddDigit(digit) {
  const pinInput = document.getElementById('loginPinInput');
  if (!pinInput) return;
  hideLoginError();

  if (pinInput.value.length < 6) {
    pinInput.value += digit;
    if (pinInput.value.length === 4) {
      setTimeout(submitLoginAuth, 120);
    }
  }
}

// Teclado numérico: limpiar campo
function keypadClear() {
  const pinInput = document.getElementById('loginPinInput');
  if (pinInput) pinInput.value = '';
  hideLoginError();
}

// Teclado numérico: borrar último carácter
function keypadBackspace() {
  const pinInput = document.getElementById('loginPinInput');
  if (pinInput && pinInput.value.length > 0) {
    pinInput.value = pinInput.value.slice(0, -1);
  }
  hideLoginError();
}

// Ocultar mensaje de error
function hideLoginError() {
  const errBox = document.getElementById('loginErrorMsg');
  if (errBox) errBox.classList.add('hidden');
}

// Mostrar mensaje de error con vibración / shake
function showLoginError(msg) {
  const errBox = document.getElementById('loginErrorMsg');
  const errText = document.getElementById('loginErrorText');
  const card = document.getElementById('loginCardContainer');

  if (errText) errText.textContent = msg;
  if (errBox) errBox.classList.remove('hidden');

  if (card) {
    card.classList.remove('animate-shake');
    void card.offsetWidth; // Forzar reflow para reiniciar animación
    card.classList.add('animate-shake');
  }

  const pinInput = document.getElementById('loginPinInput');
  if (pinInput) {
    pinInput.value = '';
    pinInput.focus();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Validar y enviar credenciales
function submitLoginAuth() {
  const pinInput = document.getElementById('loginPinInput');
  if (!pinInput) return;
  const pin = pinInput.value.trim();

  const selectedRole = authLoginState.selectedRole;
  const profile = AUTH_PROFILES[selectedRole];

  if (!profile) {
    showLoginError('Perfil no válido.');
    return;
  }

  if (pin === profile.pin) {
    // Autenticación exitosa
    const session = {
      role: profile.role,
      name: profile.nombre,
      loginAt: new Date().toISOString()
    };
    StorageService.saveSession(session);

    // Ocultar pantalla de acceso de forma inmediata
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) {
      loginScreen.classList.add('hidden');
      loginScreen.style.display = 'none';
    }

    // Actualizar interfaz según perfil
    renderUserHeader(session);
    applyRolePermissions(session.role);

    // Animación y toast de bienvenida
    if (window.confetti) {
      confetti({
        particleCount: 45,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#D4AF37', '#10B981', '#ffffff']
      });
    }

    showToast(`¡Bienvenido al sistema, ${profile.nombre}!`, 'success');
    pinInput.value = '';
    hideLoginError();
  } else {
    // Clave incorrecta
    showLoginError(`Clave incorrecta para ${profile.nombre}. Intenta nuevamente.`);
  }
}

// Renderizar usuario activo en la barra superior (Header)
function renderUserHeader(session) {
  const badgeContainer = document.getElementById('userProfileBadge');
  const avatarContainer = document.getElementById('userProfileAvatarContainer');
  const nameEl = document.getElementById('userProfileName');
  const tagEl = document.getElementById('userProfileTag');

  const brandBadgeGroup = document.getElementById('headerBrandBadgeGroup');
  const brandIcon = document.getElementById('headerBrandIcon');
  const brandName = document.getElementById('headerBrandName');
  const brandRole = document.getElementById('headerBrandRole');

  if (!session) {
    if (badgeContainer) badgeContainer.classList.add('hidden');
    if (brandBadgeGroup) brandBadgeGroup.classList.add('hidden');
    return;
  }
  if (badgeContainer) badgeContainer.classList.remove('hidden');
  if (brandBadgeGroup) brandBadgeGroup.classList.remove('hidden');

  const displayName = session.name || (session.role === 'barbero' ? 'Laureano' : 'Dueño');

  if (session.role === 'barbero') {
    if (avatarContainer) {
      avatarContainer.innerHTML = `<img src="img/laureano.jpg" alt="Laureano" class="w-full h-full object-cover object-top">`;
    }
    if (nameEl) nameEl.textContent = displayName;
    if (tagEl) {
      tagEl.textContent = 'Barbero';
      tagEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold border border-brand-gold/30 font-semibold';
    }

    if (brandIcon) brandIcon.innerHTML = `<img src="img/laureano.jpg" alt="Laureano" class="w-3.5 h-3.5 rounded-full object-cover inline-block">`;
    if (brandName) brandName.textContent = displayName;
    if (brandRole) {
      brandRole.textContent = 'Barbero';
      brandRole.className = 'text-[10px] px-1.5 py-0.2 rounded bg-brand-gold/20 text-brand-gold font-bold';
    }
  } else {
    // Dueño (José o Diego)
    if (avatarContainer) {
      avatarContainer.innerHTML = `<span class="text-sm leading-none">👑</span>`;
    }
    if (nameEl) nameEl.textContent = displayName;
    if (tagEl) {
      tagEl.textContent = 'Dueño';
      tagEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold';
    }

    if (brandIcon) brandIcon.textContent = '👑';
    if (brandName) brandName.textContent = displayName;
    if (brandRole) {
      brandRole.textContent = 'Dueño';
      brandRole.className = 'text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold';
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Aplicar permisos según el rol del usuario conectado
function applyRolePermissions(role) {
  const btnHistorial = document.getElementById('btn-tab-historial');
  const btnConfig = document.getElementById('btn-tab-config');
  const btnSemanal = document.getElementById('btn-tab-semanal');
  const btnCierreTab1 = document.getElementById('btnCierreCajaTab1');
  const btnCierreTabDiario = document.getElementById('btnCierreCajaTabDiario');

  // Permitir cierre y apertura de caja tanto al Barbero como al Dueño
  if (btnCierreTab1) btnCierreTab1.classList.remove('hidden');
  if (btnCierreTabDiario) btnCierreTabDiario.classList.remove('hidden');

  if (role === 'barbero') {
    // Laureano (Barbero):
    // Permitido: Cargar Cortes, Abrir y Cerrar Caja, Clientes & Membresías VIP (alta, cobro, baja), Barberos
    // Ocultar Configuración avanzada, Historial previo y Cierre Semanal (exclusivo dueños)
    if (btnHistorial) btnHistorial.classList.add('hidden');
    if (btnConfig) btnConfig.classList.add('hidden');
    if (btnSemanal) btnSemanal.classList.add('hidden');

    // Si estaba parado en pestañas protegidas, moverlo a Cargar Corte
    if (appState.currentTab === 'tab-config' || appState.currentTab === 'tab-historial' || appState.currentTab === 'tab-semanal') {
      switchTab('tab-registro');
    }
  } else {
    // Dueños (José y Diego): Acceso total y completo
    if (btnHistorial) btnHistorial.classList.remove('hidden');
    if (btnConfig) btnConfig.classList.remove('hidden');
    if (btnSemanal) btnSemanal.classList.remove('hidden');
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Cerrar sesión activa y regresar a la pantalla de claves
function cerrarSesion() {
  const prevSession = StorageService.getSession();
  // Sugerir el otro perfil para agilizar el cambio de sesión
  const nextRole = (prevSession && prevSession.role === 'barbero') ? 'dueno' : 'barbero';

  StorageService.clearSession();

  // Mostrar pantalla de acceso de forma inequívoca
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) {
    loginScreen.classList.remove('hidden');
    loginScreen.style.display = 'flex';
  }

  // Pre-seleccionar perfil y preparar campo de PIN limpio
  seleccionarPerfilLogin(nextRole);

  // Ocultar indicadores mientras no haya sesión activa
  renderUserHeader(null);

  // Cambiar a pestaña de mostrador
  switchTab('tab-registro');
  showToast('Sesión cerrada. Selecciona el perfil e ingresa el PIN.', 'info');
}

// ============================================================
// SISTEMA DE TURNOS Y RESERVAS ONLINE (CLIENTES & MOSTRADOR)
// ============================================================

let turnosState = {
  filtroTipo: 'hoy', // 'hoy', 'manana', 'semana', 'todos', 'custom'
  filtroFechaCustom: ''
};

// Actualizar indicador de turnos pendientes en la barra de navegación
function actualizarBadgeTurnos() {
  const badge = document.getElementById('badgeTurnosPendientes');
  if (!badge) return;
  const turnos = StorageService.getTurnos();
  const today = getTodayISO();
  const pendientesHoy = turnos.filter(t => t.fecha === today && t.estado === 'pendiente').length;

  if (pendientesHoy > 0) {
    badge.textContent = pendientesHoy;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Calcular hora de finalización (+45 minutos)
function calcularHoraFin(horaInicio) {
  if (!horaInicio) return '';
  const [h, m] = horaInicio.split(':').map(Number);
  const total = h * 60 + m + 45;
  const finH = String(Math.floor(total / 60)).padStart(2, '0');
  const finM = String(total % 60).padStart(2, '0');
  return `${finH}:${finM}`;
}

// Filtros de fecha de la agenda de turnos
function setFiltroFechaTurnos(tipo) {
  turnosState.filtroTipo = tipo;
  turnosState.filtroFechaCustom = '';
  const inputDate = document.getElementById('filtroFechaTurnosInput');
  if (inputDate) inputDate.value = '';

  const btns = {
    hoy: document.getElementById('btnFiltroTurnosHoy'),
    manana: document.getElementById('btnFiltroTurnosManana'),
    semana: document.getElementById('btnFiltroTurnosSemana'),
    todos: document.getElementById('btnFiltroTurnosTodos')
  };

  Object.keys(btns).forEach(key => {
    if (btns[key]) {
      if (key === tipo) {
        btns[key].className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-brand-gold text-black';
      } else {
        btns[key].className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-300 bg-brand-dark hover:bg-brand-cardHover border border-brand-border';
      }
    }
  });

  renderTabTurnos();
}

function setFiltroFechaTurnosCustom(val) {
  if (!val) return;
  turnosState.filtroTipo = 'custom';
  turnosState.filtroFechaCustom = val;

  ['btnFiltroTurnosHoy', 'btnFiltroTurnosManana', 'btnFiltroTurnosSemana', 'btnFiltroTurnosTodos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-300 bg-brand-dark hover:bg-brand-cardHover border border-brand-border';
  });

  renderTabTurnos();
}

// Obtener enlace para clientes accesible desde celulares con 4G o WiFi
function obtenerLinkTurnosPublico() {
  const info = StorageService.getServerInfo() || {};
  // 1. Si la web ya está abierta en un dominio público real (no localhost), usar ese
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin + window.location.pathname.replace('index.html', '').replace(/\/$/, '') + '/turnos.html';
  }
  // 2. Si hay túnel público activo de Cloudflare
  if (info.publicUrl) {
    return info.publicUrl.replace(/\/$/, '') + '/turnos.html';
  }
  // 3. Si no hay túnel, usar la IP de la red WiFi local
  if (info.localIp && info.localIp !== '127.0.0.1' && info.localIp !== 'localhost') {
    return `http://${info.localIp}:${info.port || 3000}/turnos.html`;
  }
  // 4. Fallback estándar
  return window.location.origin + window.location.pathname.replace('index.html', '').replace(/\/$/, '') + '/turnos.html';
}

function obtenerLinkTurnosLocal() {
  const info = StorageService.getServerInfo() || {};
  if (info.localIp && info.localIp !== '127.0.0.1' && info.localIp !== 'localhost') {
    return `http://${info.localIp}:${info.port || 3000}/turnos.html`;
  }
  return `http://localhost:${info.port || 3000}/turnos.html`;
}

// Renderizar la pestaña de Turnos
function renderTabTurnos() {
  actualizarBadgeTurnos();

  // Actualizar enlaces para clientes (Público Internet y Red Local WiFi)
  const linkDisplay = document.getElementById('publicLinkDisplay');
  const localLinkDisplay = document.getElementById('localLinkDisplay');
  const fullPublicUrl = obtenerLinkTurnosPublico();
  const fullLocalUrl = obtenerLinkTurnosLocal();

  if (linkDisplay) {
    linkDisplay.textContent = fullPublicUrl;
    linkDisplay.title = 'Toca o copia este enlace para tus clientes (funciona con 4G o WiFi en cualquier celular)';
  }
  if (localLinkDisplay) {
    localLinkDisplay.textContent = fullLocalUrl;
  }

  // Cargar lista de barberos en filtro si está solo la opción por defecto
  const selectBarbero = document.getElementById('filtroBarberoTurnos');
  if (selectBarbero && selectBarbero.options.length <= 1) {
    const barberos = StorageService.getBarberos();
    barberos.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.nombre;
      selectBarbero.appendChild(opt);
    });
  }

  const turnos = StorageService.getTurnos();
  const today = getTodayISO();

  // Métricas y KPIs
  const turnosHoy = turnos.filter(t => t.fecha === today && t.estado !== 'cancelado');
  const pendientesTotal = turnos.filter(t => t.estado === 'pendiente');
  const pendientesHoy = turnosHoy.filter(t => t.estado === 'pendiente');
  const completadosHoy = turnosHoy.filter(t => t.estado === 'completado');

  const elHoy = document.getElementById('kpiTurnosHoy');
  const elPendientes = document.getElementById('kpiTurnosPendientes');
  const elCompletados = document.getElementById('kpiTurnosCompletados');
  const elProxHora = document.getElementById('kpiProximoTurnoHora');
  const elProxCli = document.getElementById('kpiProximoTurnoCliente');

  if (elHoy) elHoy.textContent = turnosHoy.length;
  if (elPendientes) elPendientes.textContent = pendientesHoy.length;
  if (elCompletados) elCompletados.textContent = completadosHoy.length;

  // Próximo turno hoy
  const nowHora = getCurrentTime();
  const proximo = pendientesHoy
    .filter(t => t.hora >= nowHora)
    .sort((a, b) => a.hora.localeCompare(b.hora))[0] || pendientesHoy[0];

  if (proximo && elProxHora && elProxCli) {
    elProxHora.textContent = `${proximo.hora} hs (${proximo.barberoNombre})`;
    elProxCli.textContent = `${proximo.clienteNombre} • ${proximo.servicioNombre}`;
  } else if (elProxHora && elProxCli) {
    elProxHora.textContent = '--:--';
    elProxCli.textContent = 'Sin turnos pendientes hoy';
  }

  // Filtrado
  const filtroBarberoVal = selectBarbero ? selectBarbero.value : 'todos';
  const filtroEstadoEl = document.getElementById('filtroEstadoTurnos');
  const filtroEstadoVal = filtroEstadoEl ? filtroEstadoEl.value : 'pendiente';

  const dToday = new Date();
  const dManana = new Date(dToday);
  dManana.setDate(dToday.getDate() + 1);
  const mananaISO = dManana.toISOString().split('T')[0];

  const dSemana = new Date(dToday);
  dSemana.setDate(dToday.getDate() + 7);
  const semanaISO = dSemana.toISOString().split('T')[0];

  let lista = turnos.slice();

  // Filtro por fecha
  if (turnosState.filtroTipo === 'hoy') {
    lista = lista.filter(t => t.fecha === today);
  } else if (turnosState.filtroTipo === 'manana') {
    lista = lista.filter(t => t.fecha === mananaISO);
  } else if (turnosState.filtroTipo === 'semana') {
    lista = lista.filter(t => t.fecha >= today && t.fecha <= semanaISO);
  } else if (turnosState.filtroTipo === 'custom' && turnosState.filtroFechaCustom) {
    lista = lista.filter(t => t.fecha === turnosState.filtroFechaCustom);
  }

  // Filtro por barbero
  if (filtroBarberoVal !== 'todos') {
    lista = lista.filter(t => t.barberoId === filtroBarberoVal);
  }

  // Filtro por estado
  if (filtroEstadoVal !== 'todos') {
    lista = lista.filter(t => t.estado === filtroEstadoVal);
  }

  // Ordenar por fecha y horario
  lista.sort((a, b) => (a.fecha + ' ' + a.hora).localeCompare(b.fecha + ' ' + b.hora));

  const container = document.getElementById('turnosContainer');
  if (!container) return;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="bg-brand-card rounded-2xl border border-brand-border p-10 text-center space-y-3">
        <div class="w-14 h-14 rounded-full bg-brand-gold/10 text-brand-gold border border-brand-gold/20 flex items-center justify-center mx-auto">
          <i data-lucide="calendar" class="w-7 h-7"></i>
        </div>
        <h4 class="text-base font-bold text-white">No hay turnos para los filtros seleccionados</h4>
        <p class="text-xs text-gray-400 max-w-sm mx-auto">
          Podés agendar un turno manual o compartir el link con tus clientes para que reserven desde su celular.
        </p>
        <div class="pt-2 flex items-center justify-center gap-2">
          <button onclick="abrirModalNuevoTurnoManual()" class="px-4 py-2 bg-brand-gold hover:bg-brand-goldHover text-black font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Agendar Turno
          </button>
          <button onclick="copiarLinkTurnos()" class="px-4 py-2 bg-brand-dark hover:bg-brand-cardHover border border-brand-border text-gray-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer">
            <i data-lucide="copy" class="w-3.5 h-3.5 text-brand-gold"></i> Copiar Link
          </button>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = lista.map(t => {
    const isHoy = t.fecha === today;
    const badgeFecha = isHoy 
      ? '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-brand-gold/20 text-brand-gold border border-brand-gold/30">Hoy</span>'
      : `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-800 text-gray-300 border border-gray-700">${t.fecha}</span>`;

    let statusBadge = '';
    if (t.estado === 'pendiente') {
      statusBadge = '<span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> Pendiente</span>';
    } else if (t.estado === 'completado') {
      statusBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><i data-lucide="check" class="w-3 h-3"></i> Atendido</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30"><i data-lucide="x" class="w-3 h-3"></i> Cancelado</span>';
    }

    const telLimpio = (t.clienteTelefono || '').replace(/[^0-9]/g, '');
    const waLink = telLimpio ? `https://wa.me/${telLimpio.length <= 10 ? '549' + telLimpio : telLimpio}?text=${encodeURIComponent(`Hola ${t.clienteNombre}, te escribimos de la barbería Cero y Medio por tu turno del día ${t.fecha} a las ${t.hora} hs.`)}` : '#';

    return `
      <div class="bg-brand-card rounded-2xl border border-brand-border p-4 sm:p-5 hover:border-brand-gold/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        
        <!-- Info Principal -->
        <div class="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
          <div class="text-center bg-brand-dark px-3.5 py-2.5 rounded-xl border border-brand-border flex-shrink-0 min-w-[72px]">
            <span class="block text-base sm:text-lg font-black text-brand-gold font-mono leading-tight">${t.hora}</span>
            <span class="text-[10px] text-gray-500 font-semibold block">${t.horaFin || calcularHoraFin(t.hora)} hs</span>
          </div>

          <div class="space-y-1 min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="text-sm sm:text-base font-bold text-white truncate">${t.clienteNombre}</h4>
              ${badgeFecha}
              ${statusBadge}
            </div>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <span class="flex items-center gap-1 text-gray-300">
                <i data-lucide="scissors" class="w-3.5 h-3.5 text-brand-gold"></i>
                <strong class="text-white">${t.servicioNombre}</strong> (${formatCurrency(t.precio)})
              </span>
              <span class="flex items-center gap-1">
                <i data-lucide="user" class="w-3.5 h-3.5 text-gray-400"></i>
                <span>Barbero: <strong class="text-gray-200">${t.barberoNombre}</strong></span>
              </span>
              ${t.clienteTelefono ? `
                <a href="${waLink}" target="_blank" class="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium transition-colors" title="Chatear en WhatsApp">
                  <i data-lucide="phone" class="w-3.5 h-3.5"></i>
                  <span>${t.clienteTelefono}</span>
                </a>
              ` : ''}
            </div>

            ${t.notas ? `
              <p class="text-[11px] text-gray-400 italic bg-brand-dark/60 px-2.5 py-1 rounded-lg border border-brand-border/40 inline-block mt-1">
                "${t.notas}"
              </p>
            ` : ''}
          </div>
        </div>

        <!-- Botones de Acción -->
        <div class="flex flex-wrap items-center gap-2 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-brand-border/60">
          ${t.estado === 'pendiente' ? `
            <button onclick="convertirTurnoACorte('${t.id}')" class="flex-1 sm:flex-initial px-3.5 py-2 bg-gradient-to-r from-brand-gold to-yellow-500 hover:from-brand-goldHover hover:to-yellow-600 text-black font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-brand-gold/20 active:scale-95 cursor-pointer" title="Registrar este corte en la caja y marcarlo como atendido">
              <i data-lucide="scissors" class="w-3.5 h-3.5 stroke-[2.5]"></i>
              <span>Cobrar Corte</span>
            </button>
            <a href="${waLink}" target="_blank" class="px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5" title="Abrir chat en WhatsApp">
              <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">WhatsApp</span>
            </a>
            <button onclick="cancelarTurnoConfirm('${t.id}')" class="px-2.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer" title="Cancelar este turno">
              <i data-lucide="ban" class="w-3.5 h-3.5"></i>
            </button>
          ` : t.estado === 'completado' ? `
            <span class="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Corte Registrado
            </span>
            <button onclick="eliminarTurnoConfirm('${t.id}')" class="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-brand-dark transition-all cursor-pointer" title="Eliminar del registro">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          ` : `
            <span class="text-xs text-red-400 font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <i data-lucide="x-circle" class="w-3.5 h-3.5"></i> Cancelado
            </span>
            <button onclick="eliminarTurnoConfirm('${t.id}')" class="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-brand-dark transition-all cursor-pointer" title="Eliminar definitivamente">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          `}
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// Convertir un turno directamente a corte registrado en la caja diaria
async function convertirTurnoACorte(turnoId) {
  const turnos = StorageService.getTurnos();
  const turno = turnos.find(t => t.id === turnoId);
  if (!turno) return;

  // Si la caja de hoy está cerrada, consultar reapertura
  const cierreHoy = StorageService.getCierreHoy();
  if (cierreHoy) {
    const continuar = confirm(`La caja de hoy figura cerrada.\n¿Deseas reabrirla para cobrar el turno de ${turno.clienteNombre}?`);
    if (!continuar) return;
    await StorageService.reabrirCajaHoy();
    checkCajaStatus();
  }

  // Preguntar medio de pago
  const opcionMp = confirm(`Cobrar turno de ${turno.clienteNombre} (${formatCurrency(turno.precio)}):\n\n¿El cliente abonó con MERCADO PAGO?\n\n• [Aceptar] = MERCADO PAGO\n• [Cancelar] = EFECTIVO`);
  const metodoPago = opcionMp ? 'MERCADOPAGO' : 'EFECTIVO';

  // Registrar corte en la caja
  StorageService.addCorte({
    barberoId: turno.barberoId,
    barberoNombre: turno.barberoNombre,
    servicioNombre: `${turno.servicioNombre} (${turno.clienteNombre})`,
    monto: turno.precio,
    metodoPago: metodoPago,
    fecha: getTodayISO(),
    hora: getCurrentTime()
  });

  // Marcar turno como completado
  await StorageService.completarTurno(turnoId);

  // Confetti
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 }
    });
  }

  renderAllViews();
  renderTabTurnos();
  showToast(`¡Corte cobrado! $${Number(turno.precio).toLocaleString('es-AR')} ingresados a caja (${metodoPago}).`, 'success');
}

// Copiar link de turnos al portapapeles
function copiarLinkTurnos() {
  const fullUrl = obtenerLinkTurnosPublico();
  navigator.clipboard.writeText(fullUrl).then(() => {
    const btnText = document.getElementById('btnCopiarLinkText');
    if (btnText) {
      const orig = btnText.textContent;
      btnText.textContent = '¡Copiado!';
      setTimeout(() => btnText.textContent = orig, 2000);
    }
    showToast('¡Link de reservas copiado! Listo para enviar a tus clientes.', 'success');
  }).catch(() => {
    prompt('Copia este enlace para enviarlo a tus clientes:', fullUrl);
  });
}

// Compartir link de turnos por WhatsApp
function compartirLinkWhatsApp() {
  const fullUrl = obtenerLinkTurnosPublico();
  const mensaje = encodeURIComponent(
    `💈 ¡Hola! Reservá tu turno en Cero y Medio Barbería directamente desde acá:\n\n` +
    `👉 ${fullUrl}\n\n` +
    `Elegí tu barbero, servicio y el horario que más te convenga (turnos cada 45 min de Lun a Sáb de 09:00 a 20:00 hs). ¡Te esperamos!`
  );
  window.open(`https://wa.me/?text=${mensaje}`, '_blank');
}

// Abrir modal de nuevo turno manual
function abrirModalNuevoTurnoManual() {
  const modal = document.getElementById('modalNuevoTurno');
  const selBarbero = document.getElementById('inputTurnoManualBarbero');
  const selServicio = document.getElementById('inputTurnoManualServicio');
  const inputFecha = document.getElementById('inputTurnoManualFecha');

  const barberos = StorageService.getBarberos().filter(b => b.activo !== false);
  const servicios = StorageService.getServicios();

  if (selBarbero) {
    selBarbero.innerHTML = barberos.map(b => `<option value="${b.id}">${b.nombre}</option>`).join('');
  }
  if (selServicio) {
    selServicio.innerHTML = servicios.map(s => `<option value="${s.id}" data-precio="${s.precio}">${s.nombre} - ${formatCurrency(s.precio)}</option>`).join('');
  }

  const todayStr = getTodayISO();
  if (inputFecha) {
    inputFecha.min = todayStr;
    inputFecha.value = todayStr;
  }

  actualizarSlotsTurnoManual();

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
  if (window.lucide) lucide.createIcons();
}

function closeModalNuevoTurno() {
  const modal = document.getElementById('modalNuevoTurno');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Actualizar horarios disponibles en modal manual
function actualizarSlotsTurnoManual() {
  const selBarbero = document.getElementById('inputTurnoManualBarbero');
  const inputFecha = document.getElementById('inputTurnoManualFecha');
  const selHora = document.getElementById('inputTurnoManualHora');

  if (!selBarbero || !inputFecha || !selHora) return;

  const barberoId = selBarbero.value;
  const fecha = inputFecha.value;

  const slots = [
    '09:00', '09:45', '10:30', '11:15',
    '12:00', '12:45', '13:30', '14:15',
    '15:00', '15:45', '16:30', '17:15',
    '18:00', '18:45', '19:15'
  ];

  const ocupados = StorageService.getTurnosOcupados(fecha, barberoId);

  selHora.innerHTML = slots.map(s => {
    const isOccupied = ocupados.includes(s);
    return `<option value="${s}" ${isOccupied ? 'disabled style="color:#ef4444;"' : ''}>${s} hs ${isOccupied ? '(Ocupado)' : '(Disponible)'}</option>`;
  }).join('');
}

// Guardar turno manual
async function guardarTurnoManual(event) {
  event.preventDefault();
  const selBarbero = document.getElementById('inputTurnoManualBarbero');
  const selServicio = document.getElementById('inputTurnoManualServicio');
  const inputFecha = document.getElementById('inputTurnoManualFecha');
  const selHora = document.getElementById('inputTurnoManualHora');
  const inputNombre = document.getElementById('inputTurnoManualNombre');
  const inputTelefono = document.getElementById('inputTurnoManualTelefono');
  const inputNotas = document.getElementById('inputTurnoManualNotas');

  const barbero = StorageService.getBarberos().find(b => b.id === selBarbero.value);
  const servicio = StorageService.getServicios().find(s => s.id === selServicio.value);

  if (!barbero || !servicio) {
    showToast('Selecciona barbero y servicio válidos.', 'error');
    return;
  }

  const hora = selHora.value;
  const horaFin = calcularHoraFin(hora);

  try {
    await StorageService.agregarTurno({
      fecha: inputFecha.value,
      hora: hora,
      horaFin: horaFin,
      barberoId: barbero.id,
      barberoNombre: barbero.nombre,
      servicioId: servicio.id,
      servicioNombre: servicio.nombre,
      precio: servicio.precio,
      clienteNombre: inputNombre.value.trim(),
      clienteTelefono: inputTelefono.value.trim(),
      notas: inputNotas ? inputNotas.value.trim() : '',
      estado: 'pendiente'
    });

    closeModalNuevoTurno();
    renderTabTurnos();
    showToast(`Turno agendado para ${inputNombre.value.trim()} el ${inputFecha.value} a las ${hora} hs.`, 'success');
  } catch (e) {
    alert(e.message || 'Error al agendar el turno');
  }
}

// Cancelar turno
async function cancelarTurnoConfirm(turnoId) {
  if (!confirm('¿Estás seguro de que deseas cancelar este turno? El horario quedará liberado para otros clientes.')) {
    return;
  }
  await StorageService.cancelarTurno(turnoId);
  renderTabTurnos();
  showToast('Turno cancelado exitosamente.', 'info');
}

// Eliminar turno
async function eliminarTurnoConfirm(turnoId) {
  if (!confirm('¿Deseas eliminar definitivamente este turno del historial?')) {
    return;
  }
  await StorageService.deleteTurno(turnoId);
  renderTabTurnos();
  showToast('Turno eliminado.', 'info');
}

// ============================================================
// TURSO CLOUD BLINDAJE & ESTADO EN VIVO
// ============================================================
function actualizarBadgeTurso() {
  const cloud = StorageService.getCloudStatus ? StorageService.getCloudStatus() : null;
  const isCloud = cloud && (cloud.active === true || cloud.status === 'connected');

  const headerBadge = document.getElementById('tursoStatusBadge');
  const headerDot = document.getElementById('tursoStatusDot');
  const headerText = document.getElementById('tursoStatusText');

  if (headerBadge) {
    if (isCloud) {
      headerBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 flex items-center gap-1.5 transition-all cursor-pointer';
      if (headerDot) headerDot.className = 'w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse';
      if (headerText) headerText.innerHTML = '☁️ Turso Cloud <span class="text-[10px] text-emerald-400 font-bold ml-0.5">● Blindado</span>';
      headerBadge.title = 'Base de datos en la nube Turso Cloud activa. Cada corte, deuda y cliente queda blindado de por vida.';
    } else {
      headerBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer';
      if (headerDot) headerDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
      if (headerText) headerText.innerHTML = '💾 Disco Local';
      headerBadge.title = 'Almacenamiento local en PC. Toca para ver cómo activar Turso Cloud 24/7.';
    }
  }

  // En tab-config si existe
  const configLabel = document.getElementById('configTursoStatusLabel');
  const configDot = document.getElementById('configTursoDot');
  const configBlindaje = document.getElementById('configTursoBlindajeStatus');
  const configHost = document.getElementById('configTursoHost');

  if (configLabel) {
    if (isCloud) {
      configLabel.textContent = 'Conectado a Turso Cloud';
      configLabel.className = 'text-cyan-300 font-bold';
      if (configDot) configDot.className = 'w-2 h-2 rounded-full bg-cyan-400 animate-pulse';
      if (configBlindaje) configBlindaje.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4 text-emerald-400"></i> Blindado de por vida';
      if (configHost) configHost.textContent = cloud.host || 'Turso Cloud (24/7)';
    } else {
      configLabel.textContent = 'Modo Local (PC)';
      configLabel.className = 'text-amber-400 font-bold';
      if (configDot) configDot.className = 'w-2 h-2 rounded-full bg-amber-400';
      if (configBlindaje) configBlindaje.innerHTML = '<i data-lucide="hard-drive" class="w-4 h-4 text-amber-400"></i> Local en disco PC';
      if (configHost) configHost.textContent = 'PC Local (datos_barberia.json)';
    }
  }
}

function mostrarInfoTursoModal() {
  const cloud = StorageService.getCloudStatus ? StorageService.getCloudStatus() : null;
  const isCloud = cloud && (cloud.active === true || cloud.status === 'connected');

  const modal = document.getElementById('modalInfoTurso');
  const modalSubtitle = document.getElementById('modalTursoSubtitle');
  const modalConexion = document.getElementById('modalTursoConexion');
  const modalTipo = document.getElementById('modalTursoTipo');
  const modalHost = document.getElementById('modalTursoHost');
  const modalExplanation = document.getElementById('modalTursoExplanation');

  if (isCloud) {
    if (modalSubtitle) modalSubtitle.textContent = 'Datos Blindados de por Vida en la Nube';
    if (modalConexion) modalConexion.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Activo y Sincronizado';
    if (modalTipo) modalTipo.textContent = 'libSQL Cloud Database (Turso)';
    if (modalHost) modalHost.textContent = cloud.host || 'turso.io';
    if (modalExplanation) {
      modalExplanation.textContent = 'Cada corte, corte adeudado, cliente, membresía, barbero y balance de caja se envía directamente a tu base de datos en la nube Turso Cloud. Aunque el servidor se reinicie, se actualice o se apague la PC, tus datos permanecen protegidos 24/7 los 365 días del año.';
    }
  } else {
    if (modalSubtitle) modalSubtitle.textContent = 'Operando en Modo Local (PC)';
    if (modalConexion) modalConexion.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Disco Local de la PC';
    if (modalTipo) modalTipo.textContent = 'JSON Local + Auto-Backup';
    if (modalHost) modalHost.textContent = 'datos_barberia.json';
    if (modalExplanation) {
      modalExplanation.textContent = 'Tus datos se están guardando localmente en la computadora. Para conectar Turso Cloud y blindar todo de por vida 24/7 al igual que en Skynet, ejecuta "configurar_turso.bat" o añade TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en Render.';
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeModalInfoTurso() {
  const modal = document.getElementById('modalInfoTurso');
  if (modal) modal.classList.add('hidden');
}


