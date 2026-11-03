// Barres groupées « aujourd'hui / scénarios » : un groupe par seuil, une barre par scénario.
// Chaque barre porte son nom et sa valeur en toutes lettres : la couleur (rampe chaude, du clair au foncé) ne fait que
// renforcer l'ordre des scénarios, elle n'est jamais la seule façon de les distinguer (RGAA 3.1, daltonisme).
// groups : [{ label, rows: [{ label, value }] }] ; format(valeur) : texte affiché au bout de la barre.
export default function ScenarioBars({ groups, format, title }) {
  const max = Math.max(1, ...groups.flatMap((g) => g.rows.map((r) => r.value ?? 0)))
  return (
    <figure className="scenario-bars">
      <figcaption className="scenario-bars__title">{title}</figcaption>
      {groups.map((g) => (
        <section key={g.label} className="scenario-bars__group" aria-label={g.label}>
          <h3 className="scenario-bars__group-title">{g.label}</h3>
          <ul className="hbars">
            {g.rows.map((r, i) => (
              <li key={r.label} className="hbars__row">
                <span className="hbars__label">{r.label}</span>
                <span className="hbars__track" aria-hidden="true">
                  <span className={`hbars__bar hbars__bar--step${i}`} style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
                </span>
                <span className="hbars__value">{format(r.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </figure>
  )
}
