import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer id="contact">
      <div className="footer-top">
        <Link className="brand footer-brand" to="/">
          <img className="brand-logo" src="/mec-logo.png" alt="" />
          <span className="brand-name">MEC Resource Library<small>MYMENSINGH ENGINEERING COLLEGE</small></span>
        </Link>
        <Link to="/#campus" className="footer-contact">Explore the campus <span aria-hidden="true">↗</span></Link>
      </div>
      <div className="footer-bottom">
        <span>INDEPENDENT STUDENT RESOURCE PORTAL</span>
        <span>BUILT WITH A SENSE OF PLACE</span>
        <Link to="/">BACK TO TOP ↑</Link>
      </div>
    </footer>
  );
}
