const manifest = {
  id: 'acm-reviews',
  name: 'Revisiones de ACMs',
  description: 'Flujo de aprobación de tasaciones: revisores pueden aprobar o solicitar cambios.',
  icon: 'reviews',
  version: '1.0.0',
  category: 'core',
  dependencies: ['acm-core'],
  routes: [
    { path: '/approvals', element: () => import('./pages/Approvals.jsx') },
  ],
  navItems: [
    { key: 'approvals', label: 'Revisiones', icon: 'reviews', to: '/approvals', requireRole: 'approver' },
  ],
}

export default manifest
