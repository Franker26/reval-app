import React, { useEffect, useState } from 'react'
import { useConfirm } from '../../App.jsx'
import InlineNotice from '../../components/InlineNotice.jsx'
import { changePassword, createUser, deleteUser, listUsers, updateUser } from '../../api.js'
import { RoleBadges, SectionTitle, primaryRoleLabel } from './shared.jsx'

export default function UsersPanel({ currentUser, onCurrentUserUpdated, isMobile = false }) {
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
