// Administration : statistiques et erreurs de collecte (admins), comptes et rôles (super admin)
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client.js'
import PageHead from '../../components/PageHead.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../i18n/index.jsx'

const ROLES = ['user', 'admin']
const NAMES = { velib_status: 'Vélib’', elevators: 'hazard.ascenseur' }

export default function Admin() {
  const { t, err } = useI18n()
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [collect, setCollect] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.admin.stats().then(setStats).catch((x) => setError(err(x.code)))
    api.admin.collect().then(setCollect).catch(() => {})
  }, [err])

  return (
    <>
      <PageHead title={t('admin.title')} />
      <main id="contenu" className="app-main app-main--wide">
        {error && <p className="field__error" role="alert">{error}</p>}
        {stats && (
          <section className="card" aria-labelledby="stats-title">
            <h2 id="stats-title">{t('admin.users')}</h2>
            <p className="kpi">{t('admin.total', { n: stats.users })}</p>
            <p className="card__meta">{t('admin.with_profile', { n: stats.with_profile })}</p>
            <ul className="tags">
              {Object.entries(stats.roles).map(([role, n]) => <li key={role} className="badge badge--info">{t(`admin.role_${role}`)} · {n}</li>)}
            </ul>
          </section>
        )}

        {collect && (
          <section className="card" aria-labelledby="collect-title">
            <h2 id="collect-title">{t('admin.collect')}</h2>
            <ul className="list">
              {Object.entries(collect).map(([source, s]) => (
                <li key={source} className="list__item">
                  <strong>{NAMES[source]?.startsWith('hazard') ? t(NAMES[source]) : NAMES[source] || source}</strong>
                  <span className="card__meta">{s.last_error ? <code>{s.last_error}</code> : t('admin.no_error')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {user.role === 'superadmin' && <Users />}
      </main>
    </>
  )
}

function Users() {
  const { t, err, date } = useI18n()
  const [q, setQ] = useState('')
  const [data, setData] = useState({ total: 0, items: [] })
  const [error, setError] = useState('')

  const load = useCallback((skip = 0) => {
    api.admin.users(q, skip)
      .then((r) => setData((d) => ({ total: r.total, items: skip ? [...d.items, ...r.items] : r.items })))
      .catch((x) => setError(err(x.code)))
  }, [q, err])

  useEffect(() => {
    const id = setTimeout(() => load(0), 300) // attend la fin de la frappe
    return () => clearTimeout(id)
  }, [load])

  const setRole = (u, role) => api.admin.setRole(u.id, role)
    .then((nu) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === nu.id ? nu : x)) })))
    .catch((x) => setError(err(x.code)))

  const remove = (u) => {
    if (!window.confirm(t('admin.delete_confirm', { email: u.email }))) return
    api.admin.remove(u.id)
      .then(() => setData((d) => ({ total: d.total - 1, items: d.items.filter((x) => x.id !== u.id) })))
      .catch((x) => setError(err(x.code)))
  }

  return (
    <section className="card" aria-labelledby="users-title">
      <h2 id="users-title">{t('admin.users')}</h2>
      {error && <p className="field__error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="admin-q">{t('admin.search')}</label>
        <input id="admin-q" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="card__meta" role="status">{t('admin.total', { n: data.total })}</p>
      <ul className="list">
        {data.items.map((u) => (
          <li key={u.id} className="list__item admin-user">
            <strong>{u.email}</strong>
            <span className="card__meta">{u.created_at ? t('admin.created', { date: date(u.created_at) }) : ''}</span>
            {u.role === 'superadmin' ? (
              <span className="badge badge--ok">{t('admin.role_superadmin')}</span>
            ) : (
              <div className="admin-user__actions">
                <select className="input" aria-label={t('admin.role', { email: u.email })} value={u.role}
                  onChange={(e) => setRole(u, e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{t(`admin.role_${r}`)}</option>)}
                </select>
                <button type="button" className="btn btn--danger" onClick={() => remove(u)}>{t('admin.delete', { email: u.email })}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data.items.length < data.total && (
        <button type="button" className="btn btn--ghost btn--block" onClick={() => load(data.items.length)}>{t('admin.more')}</button>
      )}
    </section>
  )
}
