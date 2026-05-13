import React from 'react'

export default function AgendaEmptyState() {
  return (
    <div className="agenda-empty-state">
      <span className="agenda-empty-state__eyebrow">Sin actividad visible</span>
      <h3>No hay eventos para este rango</h3>
      <p>Podés crear un nuevo evento, cambiar de vista o moverte a otra fecha para revisar la agenda del equipo.</p>
    </div>
  )
}
