const manifest = {
  id: 'agenda',
  name: 'Agenda',
  description: 'Calendario de eventos con soporte de recurrencia e integración con Google Calendar.',
  icon: 'agenda',
  version: '1.0.0',
  category: 'productivity',
  dependencies: [],
  routes: [
    { path: '/agenda', element: () => import('./pages/Agenda.jsx') },
  ],
  navItems: [
    { key: 'agenda', label: 'Agenda', icon: 'agenda', to: '/agenda', requireRole: null },
  ],
}

export default manifest
