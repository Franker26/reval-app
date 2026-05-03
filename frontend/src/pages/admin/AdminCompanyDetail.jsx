import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  adminChangeUserPassword,
  adminCreateUser,
  adminDeleteUser,
  adminGetCompany,
  adminListAcms,
  adminListUsers,
  adminUpdateCompany,
  adminUpdateUser,
} from '../../adminApi.js'
import { LoadingState } from '../../components/StatusState.jsx'
import { useConfirm } from '../../App.jsx'
import InlineNotice from '../../components/InlineNotice.jsx'

function UsersSection({ companyId }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false, is_approver: false, needs_approval: false })
  const [adding, setAdding] = useState(false)
  const [pwdEdit, setPwdEdit] = useState({})
  const [savingPwd, setSavingPwd] = useState({})
  const confirm = useConfirm()

  useEffect(() => {
    adminListUsers(companyId).then(setUsers).catch((e) => setError(e.message))
  }, [companyId])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newUser.username || !newUser.password) return
    setAdding(true)
    setError(null)
    try {
      const created = await adminCreateUser(companyId, newUser)
      setUsers((prev) => [...prev, created])
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
      title: 'Se va a quitar este usuario de la empresa',
      description: 'El acceso quedará inhabilitado para este workspace.',
      confirmLabel: 'Eliminar usuario',
      cancelLabel: 'Mantener usuario',
    })
    if (!accepted) return

    setError(null)
    try {
      await adminDeleteUser(companyId, id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggle(user, field, checked) {
    const next = { [field]: checked }
    if (field === 'is_approver' && checked) next.is_admin = true
    if (field === 'is_admin' && !checked) next.is_approver = false
    setError(null)
    try {
      const updated = await adminUpdateUser(companyId, user.id, next)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)))
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
      await adminChangeUserPassword(companyId, id, pwd)
      setPwdEdit((prev) => ({ ...prev, [id]: '' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingPwd((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Usuarios ({users.length})</h2>
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setShowAdd(true)}>
          + Nuevo usuario
        </button>
      </div>

      {error && <InlineNotice tone="error" title="No pudimos actualizar los usuarios" description={error} className="notice--spaced" />}

      {showAdd && (
        <form onSubmit={handleAdd} className="admin-inline-form admin-inline-form--block">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              className="admin-input"
              type="text"
              placeholder="Usuario"
              value={newUser.username}
              autoFocus
              onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
              style={{ width: 180 }}
            />
            <input
              className="admin-input"
              type="password"
              placeholder="Contraseña"
              value={newUser.password}
              onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              style={{ width: 180 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {['is_admin', 'is_approver', 'needs_approval'].map((field) => (
              <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={newUser[field]}
                  onChange={(e) => setNewUser((p) => ({ ...p, [field]: e.target.checked }))}
                />
                {field === 'is_admin' ? 'Admin' : field === 'is_approver' ? 'Approver' : 'Nec. aprobación'}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="admin-btn admin-btn--primary admin-btn--sm" disabled={adding}>
              {adding ? 'Creando...' : 'Crear'}
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setShowAdd(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {users.length === 0 ? (
        <p className="admin-muted">Sin usuarios.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Admin</th>
              <th>Approver</th>
              <th>Nec. aprob.</th>
              <th>Nueva contraseña</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.username}</strong></td>
                <td>
                  <input type="checkbox" checked={user.is_admin}
                    onChange={(e) => handleToggle(user, 'is_admin', e.target.checked)} />
                </td>
                <td>
                  <input type="checkbox" checked={user.is_approver}
                    onChange={(e) => handleToggle(user, 'is_approver', e.target.checked)} />
                </td>
                <td>
                  <input type="checkbox" checked={user.needs_approval}
                    onChange={(e) => handleToggle(user, 'needs_approval', e.target.checked)} />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="admin-input admin-input--sm"
                      type="password"
                      placeholder="Nueva contraseña"
                      value={pwdEdit[user.id] || ''}
                      onChange={(e) => setPwdEdit((p) => ({ ...p, [user.id]: e.target.value }))}
                    />
                    <button
                      className="admin-btn admin-btn--sm"
                      onClick={() => handleChangePwd(user.id)}
                      disabled={!pwdEdit[user.id] || pwdEdit[user.id].length < 4 || savingPwd[user.id]}
                    >
                      {savingPwd[user.id] ? '...' : 'Guardar'}
                    </button>
                  </div>
                </td>
                <td>
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => handleDelete(user.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function AcmsSection({ companyId }) {
  const [acms, setAcms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminListAcms(companyId)
      .then(setAcms)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [companyId])

  if (loading) {
    return (
      <LoadingState
        eyebrow="Admin"
        title="Estamos cargando las tasaciones"
        subtitle="Traemos la actividad de la empresa para completar el detalle operativo."
        messages={['Cargando tasaciones...', 'Ordenando actividad...', 'Preparando detalle...']}
        mode="inline"
      />
    )
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Tasaciones ({acms.length})</h2>
      </div>
      {acms.length === 0 ? (
        <p className="admin-muted">Sin tasaciones.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Dirección</th>
              <th>Estado</th>
              <th>Owner</th>
              <th>Comparables</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {acms.map((acm) => (
              <tr key={acm.id}>
                <td className="admin-muted">{acm.id}</td>
                <td>{acm.nombre}</td>
                <td className="admin-muted">{acm.direccion}</td>
                <td><span className="admin-badge">{acm.stage}</span></td>
                <td className="admin-muted">{acm.owner_username || '—'}</td>
                <td>{acm.cantidad_comparables}</td>
                <td className="admin-muted">{new Date(acm.fecha_creacion).toLocaleDateString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function AdminCompanyDetail() {
  const { id } = useParams()
  const companyId = parseInt(id, 10)
  const [company, setCompany] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    adminGetCompany(companyId)
      .then((co) => { setCompany(co); setEditName(co.name) })
      .catch((e) => setError(e.message))
  }, [companyId])

  async function handleRename(e) {
    e.preventDefault()
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const updated = await adminUpdateCompany(companyId, { name: editName.trim() })
      setCompany((prev) => ({ ...prev, name: updated.name }))
      setEditing(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!company && !error) {
    return (
      <div className="admin-page">
        <LoadingState
          eyebrow="Admin"
          title="Estamos cargando la empresa"
          subtitle="Recuperamos usuarios, permisos y actividad para que puedas administrarla sin perder contexto."
          messages={['Cargando empresa...', 'Sincronizando usuarios...', 'Preparando panel...']}
          mode="page"
        />
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/admin/companies" className="admin-link">← Empresas</Link>
          <span style={{ color: '#94a3b8' }}>/</span>
          {editing ? (
            <form onSubmit={handleRename} style={{ display: 'flex', gap: 8 }}>
              <input
                className="admin-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                style={{ width: 220 }}
              />
              <button type="submit" className="admin-btn admin-btn--primary admin-btn--sm" disabled={saving}>
                {saving ? '...' : 'Guardar'}
              </button>
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </form>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>{company?.name}</h1>
              <button className="admin-btn admin-btn--sm" onClick={() => setEditing(true)}>
                Renombrar
              </button>
            </span>
          )}
        </div>
      </div>

      {error && <InlineNotice tone="error" title="No pudimos actualizar la empresa" description={error} className="notice--spaced" />}

      <UsersSection companyId={companyId} />
      <AcmsSection companyId={companyId} />
    </div>
  )
}
