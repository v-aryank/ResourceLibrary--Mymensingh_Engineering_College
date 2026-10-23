import { Link } from 'react-router-dom';

export function HeroSection() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <img
        className="hero-background"
        src="/campus-hero.jpg"
        alt="Panoramic view of the MEC campus buildings and courtyard"
        fetchPriority="high"
      />
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-rule" />MEC STUDENT DESK · RESOURCE LIBRARY</div>
        <h1 id="hero-title">Our Campus.<br />Our Resources.<br /><em>One Desk.</em></h1>
        <p className="hero-lede">Academic resources, assignment tools, printing services, and student communities — brought together for MEC students.</p>
        <div className="hero-actions">
          <Link className="button button-dark" to="/resources">Explore The Library<span aria-hidden="true">↗</span></Link>
          <a className="text-link" href="#student-tools">Student tools <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-note"><span className="note-dot" />All your needs are here<span className="note-line" /></div>
      </div>
      <div className="hero-bottom">
        <span>ENGINEERING, ROOTED IN PLACE</span>
        <span>23° 43′ N &nbsp; / &nbsp; CAMPUS VIEW</span>
      </div>
    </section>
  );
}
