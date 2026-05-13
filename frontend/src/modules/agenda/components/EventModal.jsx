import React, { useState } from 'react'
import { createEvent, updateEvent, deleteEvent } from '../../../api.js'
import InlineNotice from '../../../components/InlineNotice.jsx'
import {
  EVENT_COLORS,
  RECURRENCE_OPTIONS,
  defaultColor,
  recurrencePresetFromRule,
  parseInputAsDate,
  emptyForm,
} from './agendaUtils.js'

function fmtDateInput(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function recurrenceRuleFromPreset(value) {
  if (value === 'daily') return 'FREQ=DAILY'
  if (value === 'weekly') return 'FREQ=WEEKLY'
  if (value === 'monthly') return 'FREQ=MONTHLY'
  return ''
}

export default function EventModal({ mode, event, onSave, onDelete, onClose, saving, deleting }) {
  const [form, setForm] = useState(() => {
    if (mode === 'edit' && event) {
      return {
        title: event.title || '',
        description: event.description || '',
        location: event.location || '',
        start_datetime: fmtDateInput(event.start_datetime),
        end_datetime: fmtDateInput(event.end_datetime),
        all_day: event.all_day || false,
        color: event.color || defaultColor(),
        recurrence: recurrencePresetFromRule(event.recurrence_rule),
      }
    }
    return emptyForm(event)
  })
  const [submitError, setSubmitError] = useState(null)

  function set(field) {
    return (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setSubmitError(null)
      setForm((current) => ({ ...current, [field]: value }))
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const start = parseInputAsDate(form.all_day ? form.start_datetime.slice(0, 10) : form.start_datetime, form.all_day, false)
    const end = parseInputAsDate(form.all_day ? form.end_datetime.slice(0, 10) : form.end_datetime, form.all_day, true)

    if (!form.title.trim()) {
      setSubmitError('El evento necesita un título.')
      return
    }

    if (!start || !end || end < start) {
      setSubmitError('La fecha de fin debe ser posterior a la de inicio.')
      return
    }

    onSave({
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim(),
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      all_day: form.all_day,
      color: form.color,
      recurrence_rule: recurrenceRuleFromPreset(form.recurrence),
    })
  }

  return (
    <div className="agenda-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="agenda-modal" role="dialog" aria-modal="true" aria-labelledby="agenda-event-title">
        <div className="agenda-modal__hero">
          <div>
            <span className="agenda-modal__eyebrow">{mode === 'edit' ? 'Editar evento' : 'Nuevo evento'}</span>
            <h2 id="agenda-event-title">{mode === 'edit' ? 'Actualizá la agenda del equipo' : 'Creá una nueva instancia en agenda'}</h2>
            <p>Definí horario, contexto y recordatorio visual para que el workspace mantenga una lectura clara.</p>
          </div>
          <button type="button" className="agenda-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <form className="agenda-modal__body" onSubmit={handleSubmit}>
          {submitError ? (
            <InlineNotice
              tone="error"
              title="Revisá los datos del evento"
              description={submitError}
              compact
            />
          ) : null}

          <div className="agenda-modal__preview">
            <span className="agenda-modal__preview-dot" style={{ background: form.color }} />
            <div>
              <strong>{form.title.trim() || 'Evento sin título'}</strong>
              <small>{form.all_day ? 'Todo el día' : `${form.start_datetime.slice(0, 16).replace('T', ' · ')} hs`}</small>
            </div>
          </div>

          <div className="agenda-field">
            <label>Título *</label>
            <input
              className="agenda-input"
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="Nombre del evento"
              autoFocus
            />
          </div>

          <div className="agenda-field-row">
            <div className="agenda-field">
              <label>Inicio</label>
              <input
                className="agenda-input"
                type={form.all_day ? 'date' : 'datetime-local'}
                value={form.all_day ? form.start_datetime.slice(0, 10) : form.start_datetime}
                onChange={set('start_datetime')}
              />
            </div>
            <div className="agenda-field">
              <label>Fin</label>
              <input
                className="agenda-input"
                type={form.all_day ? 'date' : 'datetime-local'}
                value={form.all_day ? form.end_datetime.slice(0, 10) : form.end_datetime}
                onChange={set('end_datetime')}
              />
            </div>
          </div>

          <div className="agenda-field-row agenda-field-row--meta">
            <label className="agenda-checkbox-label">
              <input type="checkbox" checked={form.all_day} onChange={set('all_day')} />
              <span>Todo el día</span>
            </label>

            <div className="agenda-field">
              <label>Repetición</label>
              <select className="agenda-input" value={form.recurrence} onChange={set('recurrence')}>
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="agenda-field">
            <label>Ubicación</label>
            <input
              className="agenda-input"
              type="text"
              value={form.location}
              onChange={set('location')}
              placeholder="Dirección, sala o enlace de reunión"
            />
          </div>

          <div className="agenda-field">
            <label>Descripción</label>
            <textarea
              className="agenda-input agenda-textarea"
              rows={4}
              value={form.description}
              onChange={set('description')}
              placeholder="Notas, contexto o próximos pasos"
            />
          </div>

          <div className="agenda-field">
            <label>Color</label>
            <div className="agenda-color-picker">
              {EVENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`agenda-color-swatch${form.color === color.value ? ' is-selected' : ''}`}
                  style={{ background: color.value }}
                  title={color.label}
                  onClick={() => setForm((current) => ({ ...current, color: color.value }))}
                />
              ))}
            </div>
          </div>

          <div className="agenda-modal__footer">
            {mode === 'edit' ? (
              <button
                type="button"
                className="btn btn-secondary agenda-btn-delete"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            ) : <span />}

            <div className="agenda-modal__footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : mode === 'edit' ? 'Guardar cambios' : 'Crear evento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
