export function ArchitecturalIntroduction() {
  return (
    <section className="intro" id="campus" aria-labelledby="intro-title">
      <div className="section-kicker">01 <span>—</span> THE CAMPUS</div>
      <div className="intro-grid">
        <div className="intro-heading">
          <h2 id="intro-title">A campus with<br /><em>character.</em></h2>
          <span className="heading-rule" />
        </div>
        <div className="intro-text">
          <p className="intro-lede">Red brick. Open sky. Room to think.</p>
          <p>Our campus brings together the warmth of familiar materials and the energy of an engineering community. Walkways connect the buildings; trees soften the edges; every view has a little room to breathe.</p>
          <a href="#spaces" className="inline-link">Take a closer look <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div className="photo-band">
        <img src="/campus-reference.png" alt="View across the red-brick college buildings, green courtyard and concrete paths beneath a cloudy sky" />
        <div className="photo-overlay"><span>THE CAMPUS, AS IT IS</span><span>COURTYARD VIEW &nbsp; / &nbsp; 01</span></div>
      </div>
    </section>
  );
}
