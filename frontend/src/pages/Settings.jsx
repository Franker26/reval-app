import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useConfirm } from '../App.jsx'
import InlineNotice from '../components/InlineNotice.jsx'
import {
  changePassword,
  createModifier,
  createUser,
  deleteModifier,
  deleteUser,
  getBrandingSettings,
  getIntegrationStatus,
  getSystemParams,
  listModifiers,
  listUsers,
  updateBrandingSettings,
  updateModifier,
  updateUser,
} from '../api.js'
import { LoadingState } from '../components/StatusState.jsx'
import { applyTheme, getCachedBrandingPayload, syncBranding } from '../theme.js'
import { avatarColor, initials } from '../utils/avatars.js'

// ── Shared helpers ────────────────────────────────────────────────────────────

function RoleBadges({ user }) {
  return (
    <div className="settings-badges">
      {user.is_admin && <span className="settings-badge settings-badge--admin">Admin</span>}
      {user.is_approver && <span className="settings-badge settings-badge--approver">Approver</span>}
      {!user.is_admin && <span className="settings-badge">Usuario</span>}
      {user.needs_approval && <span className="settings-badge settings-badge--warning">Requiere aprobación</span>}
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="settings-main-title">{children}</h2>
}

function primaryRoleLabel(user) {
  if (user.is_approver) return 'Approver'
  if (user.is_admin) return 'Admin'
  return 'Usuario'
}

// ── Panel: Equipo (users) ─────────────────────────────────────────────────────

function UsersPanel({ currentUser, onCurrentUserUpdated, isMobile = false }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false, is_approver: false, needs_approval: false })
  const [adding, setAdding] = useState(false)
  const [pwdEdit, setPwdEdit] = useState({})
  const [savingPwd, setSavingPwd] = useState({})
  const [savingRoleId, setSavingRoleId] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const confirm = useConfirm()

  useEffect(() => {
    listUsers()
      .then((data) => {
        setUsers(data)
        setSelectedUserId((current) => current || data[0]?.id || null)
      })
      .catch((e) => setError(e.message))
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newUser.username || !newUser.password) return
    setAdding(true)
    setError(null)
    try {
      const created = await createUser(newUser)
      setUsers((prev) => [...prev, created])
      setSelectedUserId(created.id)
      setNewUser({ username: '', password: '', is_admin: false, is_approver: false, needs_approval: false })
      setShowAdd(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id) {
    const accepted = await confirm({
      tone: 'danger',
      eyebrow: 'Eliminar usuario',
      title: 'Se va a quitar este usuario del workspace',
      description: 'El acceso quedará inhabilitado para esta persona. Si querés conservar el usuario, podés ajustar sus permisos en lugar de eliminarlo.',
      confirmLabel: 'Eliminar usuario',
      cancelLabel: 'Mantener usuario',
    })
    if (!accepted) return

    setError(null)
    try {
      await deleteUser(id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
      setSelectedUserId((current) => {
        if (current !== id) return current
        const remaining = users.filter((u) => u.id !== id)
        return remaining[0]?.id || null
      })
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleChangePwd(id) {
    const pwd = pwdEdit[id]
    if (!pwd || pwd.length < 4) return
    setSavingPwd((prev) => ({ ...prev, [id]: true }))
    setError(null)
    try {
      await changePassword(id, pwd)
      setPwdEdit((prev) => ({ ...prev, [id]: '' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingPwd((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function handleToggle(user, field, checked) {
    const next = { [field]: checked }
    if (field === 'is_approver' && checked) next.is_admin = true
    if (field === 'is_admin' && !checked) next.is_approver = false
    setSavingRoleId(user.id)
    setError(null)
    try {
      const updated = await updateUser(user.id, next)
      setUsers((prev) => prev.map((item) => (item.id === user.id ? updated : item)))
      if (updated.id === currentUser.id) await onCurrentUserUpdated()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingRoleId(null)
    }
  }

  const selectedUser = users.find((user) => user.id === selectedUserId) || null

  if (isMobile) {
    return (
      <div>
        <SectionTitle>Equipo</SectionTitle>
        {error && <InlineNotice tone="error" title="No pudimos actualizar el equipo" description={error} className="notice--spaced" />}

        <div className="settings-group settings-group--mobile-users">
          <div className="settings-group-header">
            <span>Usuarios del workspace</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((value) => !value)}>
              {showAdd ? 'Cerrar' : '+ Nuevo usuario'}
            </button>
          </div>

          {showAdd && (
            <form onSubmit={handleAdd} className="settings-inline-form settings-inline-form--mobile">
              <div className="settings-inline-fields">
                <input
                  type="text"
                  placeholder="Usuario"
                  value={newUser.username}
                  autoFocus
                  onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={newUser.password}
                  onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
              <div className="settings-toggle-row">
                <label className="settings-toggle">
                  <input type="checkbox" checked={newUser.is_admin}
                    onChange={(e) => setNewUser((p) => ({ ...p, is_admin: e.target.checked, is_approver: e.target.checked ? p.is_approver : false }))} />
                  <span>Admin</span>
                </label>
                <label className="settings-toggle">
                  <input type="checkbox" checked={newUser.is_approver}
                    onChange={(e) => setNewUser((p) => ({ ...p, is_approver: e.target.checked, is_admin: e.target.checked ? true : p.is_admin }))} />
                  <span>Approver</span>
                </label>
                <label className="settings-toggle">
                  <input type="checkbox" checked={newUser.needs_approval}
                    onChange={(e) => setNewUser((p) => ({ ...p, needs_approval: e.target.checked }))} />
                  <span>Necesita aprobación</span>
                </label>
              </div>
              <div className="settings-actions-row">
                <button type="submit" className="btn btn-primary btn-sm" disabled={adding}>
                  {adding ? <span className="spinner" /> : 'Crear'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="settings-mobile-users-list" role="list" aria-label="Usuarios del workspace">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`settings-mobile-user-row${selectedUserId === user.id ? ' is-active' : ''}`}
                onClick={() => setSelectedUserId(user.id)}
                role="listitem"
              >
                <strong>
                  {user.username}
                  {user.username === currentUser.username ? <span className="settings-user-self">(vos)</span> : null}
                </strong>
                <span>{primaryRoleLabel(user)}</span>
              </button>
            ))}
          </div>
        </div>

        {selectedUser && (
          <div className="settings-group settings-group--mobile-users-detail">
            <div className="settings-group-header">
              <span>Detalle de usuario</span>
            </div>
            <div className="settings-mobile-user-detail">
              <div className="settings-mobile-user-detail__head">
                <div>
                  <strong>{selectedUser.username}</strong>
                  <div className="settings-mobile-user-detail__role">{primaryRoleLabel(selectedUser)}</div>
                </div>
                <RoleBadges user={selectedUser} />
              </div>

              <div className="settings-toggle-list">
                <label className="settings-toggle">
                  <input type="checkbox" checked={selectedUser.is_admin} disabled={savingRoleId === selectedUser.id}
                    onChange={(e) => handleToggle(selectedUser, 'is_admin', e.target.checked)} />
                  <span>Admin</span>
                </label>
                <label className="settings-toggle">
                  <input type="checkbox" checked={selectedUser.is_approver} disabled={savingRoleId === selectedUser.id}
                    onChange={(e) => handleToggle(selectedUser, 'is_approver', e.target.checked)} />
                  <span>Approver</span>
                </label>
                <label className="settings-toggle">
                  <input type="checkbox" checked={selectedUser.needs_approval} disabled={savingRoleId === selectedUser.id}
                    onChange={(e) => handleToggle(selectedUser, 'needs_approval', e.target.checked)} />
                  <span>Necesita aprobación</span>
                </label>
              </div>

              <div className="settings-password-row settings-password-row--mobile">
                <input
                  type="password"
                  placeholder="Nueva contraseña"
                  value={pwdEdit[selectedUser.id] || ''}
                  onChange={(e) => setPwdEdit((p) => ({ ...p, [selectedUser.id]: e.target.value }))}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleChangePwd(selectedUser.id)}
                  disabled={!pwdEdit[selectedUser.id] || pwdEdit[selectedUser.id].length < 4 || savingPwd[selectedUser.id]}
                >
                  {savingPwd[selectedUser.id] ? <span className="spinner" /> : 'Guardar contraseña'}
                </button>
              </div>

              {selectedUser.username !== currentUser.username && (
                <div className="settings-actions-row">
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedUser.id)}>
                    Eliminar usuario
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <SectionTitle>Equipo</SectionTitle>
      {error && <InlineNotice tone="error" title="No pudimos actualizar el equipo" description={error} className="notice--spaced" />}

      <div className="settings-group">
        <div className="settings-group-header">
          <span>Usuarios del workspace</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Nuevo usuario
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd} className="settings-inline-form" style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
            <div className="settings-inline-fields">
              <input
                type="text"
                placeholder="Usuario"
                value={newUser.username}
                autoFocus
                onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                style={{ fontSize: 13, padding: '6px 8px', width: 170 }}
              />
              <input
                type="password"
                placeholder="Contraseña"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              />
            </div>
            <div className="settings-toggle-row">
              <label className="settings-toggle">
                <input type="checkbox" checked={newUser.is_admin}
                  onChange={(e) => setNewUser((p) => ({ ...p, is_admin: e.target.checked, is_approver: e.target.checked ? p.is_approver : false }))} />
                <span>Admin</span>
              </label>
              <label className="settings-toggle">
                <input type="checkbox" checked={newUser.is_approver}
                  onChange={(e) => setNewUser((p) => ({ ...p, is_approver: e.target.checked, is_admin: e.target.checked ? true : p.is_admin }))} />
                <span>Approver</span>
              </label>
              <label className="settings-toggle">
                <input type="checkbox" checked={newUser.needs_approval}
                  onChange={(e) => setNewUser((p) => ({ ...p, needs_approval: e.target.checked }))} />
                <span>Necesita aprobación</span>
              </label>
            </div>
            <div className="settings-actions-row">
              <button type="submit" className="btn btn-primary btn-sm" disabled={adding}>
                {adding ? <span className="spinner" /> : 'Crear'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="table-wrapper">
          <table className="settings-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Roles</th>
                <th>Permisos</th>
                <th>Nueva contraseña</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="settings-user-cell">
                    <strong>{user.username}</strong>
                    {user.username === currentUser.username && (
                      <span className="settings-user-self">(vos)</span>
                    )}
                  </td>
                  <td><RoleBadges user={user} /></td>
                  <td>
                    <div className="settings-toggle-list">
                      <label className="settings-toggle">
                        <input type="checkbox" checked={user.is_admin} disabled={savingRoleId === user.id}
                          onChange={(e) => handleToggle(user, 'is_admin', e.target.checked)} />
                        <span>Admin</span>
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={user.is_approver} disabled={savingRoleId === user.id}
                          onChange={(e) => handleToggle(user, 'is_approver', e.target.checked)} />
                        <span>Approver</span>
                      </label>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={user.needs_approval} disabled={savingRoleId === user.id}
                          onChange={(e) => handleToggle(user, 'needs_approval', e.target.checked)} />
                        <span>Necesita aprobación</span>
                      </label>
                    </div>
                  </td>
                  <td>
                    <div className="settings-password-row">
                      <input
                        type="password"
                        placeholder="Nueva contraseña"
                        value={pwdEdit[user.id] || ''}
                        onChange={(e) => setPwdEdit((p) => ({ ...p, [user.id]: e.target.value }))}
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleChangePwd(user.id)}
                        disabled={!pwdEdit[user.id] || pwdEdit[user.id].length < 4 || savingPwd[user.id]}
                      >
                        {savingPwd[user.id] ? <span className="spinner" /> : 'Guardar'}
                      </button>
                    </div>
                  </td>
                  <td className="settings-table__actions">
                    {user.username !== currentUser.username && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(user.id)}>
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Panel: Personalización (branding) ─────────────────────────────────────────

function ThemePanel() {
  const [branding, setBranding] = useState(() => getCachedBrandingPayload())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getBrandingSettings().then(setBranding).catch((e) => setError(e.message))
  }, [])

  function handleColorChange(e) {
    const color = e.target.value
    setBranding((prev) => ({ ...prev, primary_color: color }))
    applyTheme(color)
  }

  function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setBranding((prev) => ({ ...prev, logo_data_url: ev.target.result }))
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const saved = await updateBrandingSettings(branding)
      setBranding(saved)
      syncBranding(saved)
      window.dispatchEvent(new Event('acm_theme_changed'))
      setMessage('Branding actualizado.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionTitle>Personalización</SectionTitle>
      {error && <InlineNotice tone="error" title="No pudimos guardar la marca" description={error} className="notice--spaced" />}
      {message && <div className="alert alert-success" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="settings-group">
        <div className="settings-group-header">Nombre de la aplicación</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: 13 }}>
            Se refleja en el header, la pantalla de login y el PDF exportado.
          </p>
          <input
            type="text"
            value={branding.app_name || ''}
            onChange={(e) => setBranding((prev) => ({ ...prev, app_name: e.target.value }))}
            style={{ maxWidth: 320 }}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">Color principal</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            Actualiza el tono dominante de toda la interfaz en tiempo real.
          </p>
          <div className="settings-color-row">
            <input
              type="color"
              value={branding.primary_color || '#1a3a5c'}
              onChange={handleColorChange}
              className="settings-color-picker"
            />
            <span className="settings-color-value">{branding.primary_color}</span>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">Logotipo</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            Mantené la misma línea visual entre la landing, el workspace y el reporte.
          </p>
          {branding.logo_data_url && (
            <div className="settings-logo-preview" style={{ marginBottom: 12 }}>
              <img src={branding.logo_data_url} alt="Logo actual" className="settings-logo-preview__image" />
            </div>
          )}
          <div className="settings-actions-row">
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              {branding.logo_data_url ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {branding.logo_data_url && (
              <button className="btn btn-danger btn-sm"
                onClick={() => setBranding((prev) => ({ ...prev, logo_data_url: null }))}>
                Quitar logo
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
        </div>
      </div>

      <div style={{ padding: '0 0 8px' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving && <span className="spinner" />}
          Guardar branding
        </button>
      </div>
    </div>
  )
}

// ── Panel: OpenStreetMap ──────────────────────────────────────────────────────

const OSM_KEY = 'acm_osm_enabled'

function MapPanel() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(OSM_KEY) !== 'false')

  function toggle() {
    const next = !enabled
    localStorage.setItem(OSM_KEY, String(next))
    setEnabled(next)
  }

  return (
    <div>
      <SectionTitle>OpenStreetMap</SectionTitle>
      <div className="settings-group">
        <div className="settings-group-header">Autocompletar direcciones</div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
            Cuando está activo, los campos de dirección sugieren resultados usando OpenStreetMap Nominatim.
          </p>
          <div className="settings-switch-row">
            <button
              onClick={toggle}
              className={`settings-switch${enabled ? ' settings-switch--enabled' : ''}`}
              aria-pressed={enabled}
            >
              <span className="settings-switch__thumb" />
            </button>
            <span className="settings-switch__label">{enabled ? 'Activado' : 'Desactivado'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Panel: Estado de integraciones (solo lectura) ─────────────────────────────

function IntegrationStatusPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getIntegrationStatus().then(setData).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <SectionTitle>Estado de integraciones</SectionTitle>
      <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13 }}>
        La configuración de integraciones es administrada por el equipo de soporte.
      </p>
      {error && <InlineNotice tone="error" title="No pudimos revisar las integraciones" description={error} className="notice--spaced" />}

      {!data ? (
        <span className="spinner" />
      ) : (
        <div className="integration-status-grid">
          {data.sources.map((source) => (
            <div key={source.key} className="integration-card">
              <div className="integration-card__header">
                <span className={`integration-card__dot integration-card__dot--${source.available ? 'ok' : 'error'}`} />
                <span className="integration-card__name">{source.name}</span>
              </div>
              <div className="integration-card__detail">
                <span className={`integration-card__status-label integration-card__status-label--${source.available ? 'ok' : 'error'}`}>
                  {source.available ? 'Disponible' : 'No disponible'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Panel: Parámetros del sistema (debug) ─────────────────────────────────────

function SystemParamsPanel() {
  const [params, setParams] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSystemParams().then(setParams).catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <SectionTitle>Parámetros del sistema</SectionTitle>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
        Todos los valores almacenados en la tabla <code>app_settings</code>. Los valores sensibles aparecen enmascarados.
      </p>
      {error && <InlineNotice tone="error" title="No pudimos cargar los parámetros" description={error} className="notice--spaced" />}

      {!params ? (
        <span className="spinner" />
      ) : params.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No hay parámetros configurados aún.</p>
      ) : (
        <div className="settings-group" style={{ padding: 0 }}>
          <table className="params-table">
            <thead>
              <tr>
                <th>Clave</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.key}>
                  <td><code className="params-table__key">{p.key}</code></td>
                  <td className="params-table__value">{p.value || <em style={{ color: 'var(--text-muted)' }}>vacío</em>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ── Panel: Tabla maestra de modificadores ────────────────────────────────────

const FACTOR_KEY_LABELS = {
  antiguedad_por_decada:    'Antigüedad — por década de diferencia',
  estado_a_refaccionar:     'Estado — a refaccionar vs standard',
  calidad_superior:         'Calidad — superior (factor directo)',
  calidad_inferior:         'Calidad — inferior (factor directo)',
  superficie_por_decima:    'Superficie — por décima de ratio',
  piso_por_nivel:           'Piso — por nivel de diferencia',
  orientacion_sur_vs_norte: 'Orientación — sur vs norte',
  orientacion_interno:      'Orientación — interno',
  distribucion_mala:        'Distribución — regular vs buena',
  oferta_mas_de_un_anio:    'Oferta — más de 12 meses en mercado',
  oferta_menos_de_un_anio:  'Oferta — menos de 12 meses en mercado',
  oportunidad_mercado:      'Oportunidad de mercado',
  cochera:                  'Cochera',
  pileta:                   'Pileta',
}

const EMPTY_MODIFIER = { factor_key: 'calidad_superior', option_label: '', factor_value: '1.00' }

function ModifiersPanel() {
  const [modifiers, setModifiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_MODIFIER)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    listModifiers()
      .then(setModifiers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.option_label.trim()) return
    const payload = {
      factor_key: form.factor_key,
      option_label: form.option_label.trim(),
      factor_value: parseFloat(form.factor_value) || 1.0,
    }
    setSaving(true)
    setError(null)
    try {
      if (editId) {
        const updated = await updateModifier(editId, { option_label: payload.option_label, factor_value: payload.factor_value })
        setModifiers((prev) => prev.map((m) => (m.id === editId ? updated : m)))
      } else {
        const created = await createModifier(payload)
        setModifiers((prev) => [...prev, created])
      }
      setForm(EMPTY_MODIFIER)
      setEditId(null)
      setShowForm(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(m) {
    setForm({ factor_key: m.factor_key, option_label: m.option_label, factor_value: String(m.factor_value) })
    setEditId(m.id)
    setShowForm(true)
  }

  async function handleDelete(id) {
    const accepted = await confirm({
      tone: 'danger',
      eyebrow: 'Eliminar opción',
      title: 'Esta opción personalizada se va a eliminar',
      description: 'La configuración dejará de estar disponible para nuevas tasaciones y ajustes.',
      confirmLabel: 'Eliminar opción',
      cancelLabel: 'Mantener opción',
    })
    if (!accepted) return

    try {
      await deleteModifier(id)
      setModifiers((prev) => prev.filter((m) => m.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  function handleCancel() {
    setForm(EMPTY_MODIFIER)
    setEditId(null)
    setShowForm(false)
  }

  const grouped = Object.entries(FACTOR_KEY_LABELS).reduce((acc, [key, label]) => {
    const items = modifiers.filter((m) => m.factor_key === key)
    if (items.length) acc.push({ key, label, items })
    return acc
  }, [])
  // Include any modifiers whose key isn't in FACTOR_KEY_LABELS
  const knownKeys = new Set(Object.keys(FACTOR_KEY_LABELS))
  const ungrouped = modifiers.filter((m) => !knownKeys.has(m.factor_key))
  if (ungrouped.length) grouped.push({ key: '__other__', label: 'Otros', items: ungrouped })

  return (
    <div>
      <SectionTitle>Modificadores</SectionTitle>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13 }}>
        Configurá las opciones de calificación y sus factores de ajuste para cada campo. El valor <strong>1.00</strong> es la referencia neutral (0%).
      </p>
      {error && <InlineNotice tone="error" title="No pudimos actualizar las opciones" description={error} className="notice--spaced" />}

      <div className="settings-group-header" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Opciones configuradas</span>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            + Nueva opción
          </button>
        )}
      </div>

      {showForm && (
        <div className="settings-group" style={{ marginBottom: 16 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 120px', gap: 10, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Campo</label>
                <select
                  value={form.factor_key}
                  onChange={(e) => handleFormChange('factor_key', e.target.value)}
                  disabled={!!editId}
                >
                  {Object.entries(FACTOR_KEY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Etiqueta</label>
                <input
                  type="text"
                  value={form.option_label}
                  onChange={(e) => handleFormChange('option_label', e.target.value)}
                  placeholder="Ej: Superior"
                  required
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Factor</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.5"
                  max="2"
                  value={form.factor_value}
                  onChange={(e) => handleFormChange('factor_value', e.target.value)}
                />
              </div>
            </div>
            <div className="settings-actions-row" style={{ marginTop: 10 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? <span className="spinner" /> : editId ? 'Guardar cambios' : 'Crear opción'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <LoadingState
          eyebrow="Configuración"
          title="Estamos cargando los modificadores"
          subtitle="Recuperamos las opciones personalizadas para que puedas editarlas con contexto."
          messages={['Cargando opciones...', 'Ordenando modificadores...', 'Preparando edición...']}
          mode="inline"
        />
      ) : modifiers.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No hay opciones configuradas aún. Creá la primera con el botón de arriba.</p>
      ) : (
        <div className="settings-group" style={{ padding: 0 }}>
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Opción</th>
                <th>Factor</th>
                <th>%</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ key, label, items }) =>
                items.map((m, i) => (
                  <tr key={m.id}>
                    {i === 0 && (
                      <td rowSpan={items.length} style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: 12 }}>
                        {label}
                      </td>
                    )}
                    <td>{m.option_label}</td>
                    <td style={{ fontFamily: 'monospace' }}>{m.factor_value.toFixed(3)}</td>
                    <td className={m.factor_value > 1 ? 'factor-val--positive' : m.factor_value < 1 ? 'factor-val--negative' : ''}>
                      {m.factor_value > 1 ? '+' : ''}{Math.round((m.factor_value - 1) * 100)}%
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(m)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m.id)}>×</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const { user, refreshUser, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const debugMode = new URLSearchParams(location.search).get('debug') === '1'
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 820
  })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 820)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const topSections = [
    { key: 'config', label: 'Configuración general' },
    user?.is_admin ? { key: 'usuarios', label: 'Usuarios' } : null,
    (debugMode && user?.is_admin) ? { key: 'tecnico', label: 'Técnico' } : null,
  ].filter(Boolean)

  const sidebarMap = {
    config: [
      { key: 'mapa', label: 'OpenStreetMap' },
      user?.is_admin ? { key: 'personalizacion', label: 'Personalización' } : null,
      user?.is_admin ? { key: 'integraciones', label: 'Estado de integraciones' } : null,
      user?.is_admin ? { key: 'modificadores', label: 'Modificadores' } : null,
    ].filter(Boolean),
    usuarios: [
      { key: 'equipo', label: 'Equipo' },
    ],
    tecnico: [
      { key: 'params-sistema', label: 'Parámetros del sistema' },
    ],
  }

  const defaultSection = topSections[0]?.key || 'config'
  const [activeSection, setActiveSection] = useState(defaultSection)
  const [activeSidebarItem, setActiveSidebarItem] = useState(
    sidebarMap[defaultSection]?.[0]?.key
  )

  function handleSectionChange(sectionKey) {
    setActiveSection(sectionKey)
    setActiveSidebarItem(sidebarMap[sectionKey]?.[0]?.key)
  }

  function handleMobileNavigate(path) {
    setMobileDrawerOpen(false)
    navigate(path)
  }

  function handleMobileLogout() {
    setMobileDrawerOpen(false)
    logout()
    navigate('/login')
  }

  const sidebarItems = sidebarMap[activeSection] || []

  return (
    <div className={`settings-layout${isMobile ? ' settings-layout--mobile' : ''}`}>

      {isMobile && (
        <>
          <button
            type="button"
            className={`home-mobile-drawer-backdrop${mobileDrawerOpen ? ' is-open' : ''}`}
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="Cerrar panel lateral"
          />

          <aside className={`home-mobile-drawer${mobileDrawerOpen ? ' is-open' : ''}`} aria-hidden={!mobileDrawerOpen}>
            <div className="home-mobile-drawer__header">
              <div className="home-mobile-drawer__identity">
                <div className="home-mobile-drawer__avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
                  {initials(user?.username || 'Usuario')}
                </div>
                <div>
                  <strong>{user?.username || 'Usuario'}</strong>
                  <span>{user?.is_admin ? 'Administrador' : 'Workspace operativo'}</span>
                </div>
              </div>
              <button type="button" className="home-mobile-drawer__close" onClick={() => setMobileDrawerOpen(false)}>
                ×
              </button>
            </div>

            <div className="home-mobile-drawer__actions">
              <button type="button" className="settings-sidebar-item settings-sidebar-item--active" onClick={() => handleMobileNavigate('/settings')}>
                Configuración
              </button>
              <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/')}>
                Volver al dashboard
              </button>
              {user?.is_approver && (
                <button type="button" className="settings-sidebar-item" onClick={() => handleMobileNavigate('/approvals')}>
                  Aprobaciones
                </button>
              )}
              <button type="button" className="settings-sidebar-item" onClick={handleMobileLogout}>
                Cerrar sesión
              </button>
            </div>
          </aside>

          <section className="home-mobile-topband settings-mobile-topband">
            <header className="home-mobile-header">
              <button
                type="button"
                className="home-mobile-user-trigger"
                onClick={() => setMobileDrawerOpen(true)}
                aria-expanded={mobileDrawerOpen}
                aria-label="Abrir panel de usuario"
              >
                <span className="home-mobile-user-trigger__avatar" style={{ background: avatarColor(user?.username || 'Usuario') }}>
                  {initials(user?.username || 'Usuario')}
                </span>
                <span className="home-mobile-user-trigger__body">
                  <span className="home-mobile-user-trigger__name">{user?.username || 'Usuario'}</span>
                  <span className="home-mobile-user-trigger__meta">Workspace Reval</span>
                </span>
              </button>
              <div className="home-mobile-header__utilities">
                <button type="button" className="home-mobile-utility-pill" onClick={() => handleMobileNavigate('/')}>
                  Dashboard
                </button>
                <button type="button" className="home-mobile-utility-icon" onClick={() => setMobileDrawerOpen(true)} aria-label="Abrir perfil">
                  ≡
                </button>
              </div>
            </header>

            <section className="home-mobile-overview settings-mobile-overview">
              <span className="home-mobile-overview__eyebrow">Configuración</span>
              <h1>Accesos y parámetros</h1>
              <p>Ordenamos la configuración para celular con accesos claros, secciones compactas y detalle directo donde más importa.</p>
            </section>
          </section>
        </>
      )}

      {/* Top navigation bar */}
      <nav className="settings-topnav">
        <span className="settings-topnav-brand">Configuración</span>
        {topSections.map((s) => (
          <button
            key={s.key}
            className={`settings-topnav-item${activeSection === s.key ? ' settings-topnav-item--active' : ''}`}
            onClick={() => handleSectionChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Body: sidebar + content */}
      <div className="settings-body">
        <aside className="settings-sidebar">
          {sidebarItems.map((item) => (
            <button
              key={item.key}
              className={`settings-sidebar-item${activeSidebarItem === item.key ? ' settings-sidebar-item--active' : ''}`}
              onClick={() => setActiveSidebarItem(item.key)}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <div className="settings-main">
          {activeSidebarItem === 'mapa' && <MapPanel />}
          {activeSidebarItem === 'personalizacion' && <ThemePanel />}
          {activeSidebarItem === 'integraciones' && <IntegrationStatusPanel />}
          {activeSidebarItem === 'equipo' && user?.is_admin && (
            <UsersPanel currentUser={user} onCurrentUserUpdated={refreshUser} isMobile={isMobile} />
          )}
          {activeSidebarItem === 'params-sistema' && <SystemParamsPanel />}
          {activeSidebarItem === 'modificadores' && user?.is_admin && <ModifiersPanel />}
        </div>
      </div>
    </div>
  )
}
