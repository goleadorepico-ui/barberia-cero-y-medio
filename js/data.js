/**
 * Data inicial y utilidades para BarberControl
 */

// Barberos iniciales si no existen en localStorage
const DEFAULT_BARBEROS = [
  { id: 'barbero-1', nombre: 'Laureano', foto: 'img/laureano.jpg', comision: 50, activo: true }
];

// Servicios iniciales con precios sugeridos
const DEFAULT_SERVICIOS = [
  { id: 'srv-1', nombre: 'Corte', precio: 15000 },
  { id: 'srv-2', nombre: 'Corte y Barba', precio: 18000 }
];

// Perfiles de usuario y claves PIN de acceso
const AUTH_PROFILES = {
  barbero: {
    role: 'barbero',
    nombre: 'Laureano',
    pin: '1313',
    titulo: 'Barbero',
    badgeText: 'Barbero',
    badgeIcon: 'scissors',
    foto: 'img/laureano.jpg'
  },
  dueno: {
    role: 'dueno',
    nombre: 'José',
    pin: '1812',
    titulo: 'Dueño / Admin',
    badgeText: 'Dueño',
    badgeIcon: 'crown',
    foto: null
  },
  diego: {
    role: 'dueno',
    nombre: 'Diego',
    pin: '2626',
    titulo: 'Dueño / Admin',
    badgeText: 'Dueño',
    badgeIcon: 'crown',
    foto: null
  }
};

// Formateador de moneda (ej: $ 8.000)
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return '$' + num.toLocaleString('es-AR');
}

// Obtener fecha actual en formato YYYY-MM-DD
function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Obtener hora actual en formato HH:MM
function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Formatear fecha legible
function formatDateReadable(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// Generador de IDs únicos
function generateUUID() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

// Obtener iniciales de un nombre
function getInitials(name) {
  if (!name) return 'B';
  return name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// Sumar días a una fecha en formato YYYY-MM-DD
function addDaysToDate(dateStr, days) {
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() + Number(days));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Calcular días restantes de una membresía respecto a hoy
function getDiasRestantes(fechaVencimiento) {
  if (!fechaVencimiento) return 0;
  const [hy, hm, hd] = getTodayISO().split('-');
  const hoy = new Date(Number(hy), Number(hm) - 1, Number(hd));
  const [y, m, d] = fechaVencimiento.split('-');
  const venc = new Date(Number(y), Number(m) - 1, Number(d));
  const diffTime = venc.getTime() - hoy.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}
