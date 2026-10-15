const spaces = [
  { number: '01', name: 'Learning spaces', description: 'A place to focus and explore' },
  { number: '02', name: 'Shared courtyards', description: 'Room to pause, meet, and connect' },
  { number: '03', name: 'Places to make', description: 'Space for ideas to take shape' },
];

export function CampusHighlights() {
  return (
    <section className="spaces" id="spaces" aria-labelledby="spaces-title">
      <div className="section-kicker">02 <span>—</span> A SENSE OF PLACE</div>
      <div className="spaces-head">
        <h2 id="spaces-title">Made for the<br /><em>everyday.</em></h2>
        <p>Somewhere to focus, to meet, to make a start. The details of campus life begin with the spaces we share.</p>
      </div>
      <div className="spaces-list">
        {spaces.map((space) => (
          <article key={space.number}>
            <span className="space-no">{space.number}</span>
            <span className="space-name">{space.name}</span>
            <span className="space-detail">{space.description}</span>
            <span className="space-arrow" aria-hidden="true">↗</span>
          </article>
        ))}
      </div>
      <div className="spaces-foot"><span>MORE TO DISCOVER</span><span className="foot-line" /><span>01 — 03</span></div>
    </section>
  );
}
