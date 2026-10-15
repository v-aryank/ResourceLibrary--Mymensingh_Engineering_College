export function CampusScene() {
  return (
    <div className="scene-wrap" aria-label="Animated campus courtyard illustration">
      <div className="scene-image-frame">
        <img
          className="scene-image"
          src="/campus-hero.jpg"
          alt="Red-brick college buildings around a green courtyard, with trees, walkways, and a cloudy sky"
          fetchPriority="high"
        />
      </div>
      <div className="scene-label"><span>01 / 03</span><span>CAMPUS STUDY</span></div>
      <div className="scene-caption"><span className="caption-mark">N</span><span>COURTYARD<br /><small>A CAMPUS VIEW</small></span></div>
      <div className="scene-index">[ 01 — ARCHITECTURE ]</div>
    </div>
  );
}
