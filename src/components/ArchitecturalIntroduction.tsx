import { useState } from 'react';

const campusPhotos = [
  {
    src: '/campus-reference.png',
    alt: 'Panoramic view across the red-brick college buildings and green courtyard',
    caption: 'COURTYARD VIEW',
  },
  {
    src: '/campus-hero.jpg',
    alt: 'Campus buildings and gardens beneath a colorful evening sky',
    caption: 'CAMPUS AT DUSK',
  },
];

export function ArchitecturalIntroduction() {
  const [activePhoto, setActivePhoto] = useState(0);
  const photo = campusPhotos[activePhoto];

  const changePhoto = (direction: number) => {
    setActivePhoto((current) => (current + direction + campusPhotos.length) % campusPhotos.length);
  };

  return (
    <section className="intro" id="campus" aria-labelledby="intro-title">
      <div className="section-kicker">01 <span>—</span> THE CAMPUS</div>
      <div className="intro-grid">
        <div className="intro-heading">
          <h2 id="intro-title">A campus of<br /><em>Red Brick.</em></h2>
          <span className="heading-rule" />
        </div>
        <div className="intro-text">
          <p className="intro-lede">Red brick. Open sky. Place to think.</p>
          <p>Our campus brings together the warmth of familiar materials and the energy of an engineering community. Walkways connect the buildings; trees soften the edges; every view has a little room to breathe.</p>
        </div>
      </div>
      <div className="photo-band campus-gallery" aria-label="Campus photo gallery">
        <img className="campus-gallery-backdrop" src={photo.src} alt="" aria-hidden="true" />
        <img className="campus-gallery-photo" key={photo.src} src={photo.src} alt={photo.alt} />
        <div className="photo-overlay">
          <span>{photo.caption}</span>
          <span aria-live="polite">{String(activePhoto + 1).padStart(2, '0')} &nbsp; / &nbsp; {String(campusPhotos.length).padStart(2, '0')}</span>
        </div>
        <div className="gallery-controls" aria-label="Gallery controls">
          <button type="button" aria-label="Previous campus photo" onClick={() => changePhoto(-1)}>←</button>
          <button type="button" aria-label="Next campus photo" onClick={() => changePhoto(1)}>→</button>
        </div>
      </div>
    </section>
  );
}
