const manifest = {
  id: 'acm-core',
  name: 'Creador de ACMs',
  description: 'Gestión completa del flujo de tasaciones: carga, comparables, ponderadores y resultados.',
  icon: 'acm',
  version: '1.0.0',
  category: 'core',
  dependencies: [],
  routes: [
    { path: '/acm/tipo', element: () => import('./pages/TipoACM.jsx') },
    { path: '/acm/new', element: () => import('./pages/NuevaTasacion.jsx') },
    { path: '/acm/:id/comparables', element: () => import('./pages/AgregarComparables.jsx') },
    { path: '/acm/:id/ponderadores', element: () => import('./pages/AplicarPonderadores.jsx') },
    { path: '/acm/:id/resultados', element: () => import('./pages/ResultadosDashboard.jsx') },
    { path: '/acm/:id/exportar', element: () => import('./pages/ExportarPDF.jsx') },
  ],
  navItems: [
    { key: 'pipeline', label: 'Pipeline', icon: 'pipeline', to: '/pipeline', requireRole: null },
  ],
}

export default manifest
