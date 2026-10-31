import { useState } from "react";
import { Link } from "react-router-dom";

const slides = [
  { title: "Discover", heading: "Different roles. One business question.", text: "Bring the people doing the work into the conversation.", path: "/platform/discovery", link: "Explore discovery" },
  { title: "Prioritize", heading: "A shortlist with the reasoning visible.", text: "Compare explicit ratings and their supporting sources.", path: "/platform/prioritization", link: "Explore prioritization" },
  { title: "Assess", heading: "A clearer next step. Not a leap of faith.", text: "Review a selected hypothesis in a separate assessment.", path: "/platform/assessment", link: "Explore assessment" },
] as const;

export default function HomeSlides() {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  function move(direction: number) { setIndex(current => (current + direction + slides.length) % slides.length); }
  return <article className="home-slides" aria-label="Product preview" aria-roledescription="carousel" onKeyDown={event => {
    if (event.target instanceof HTMLButtonElement && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1);
    }
  }}>
    <div className="showcase-top"><span>FROM BUSINESS QUESTION TO NEXT STEP</span><span className="showcase-example">Fictional example</span></div>
    <div key={index} className="home-slide marketing-slide-enter" role="group" aria-roledescription="slide" aria-label={`${index + 1} of 3: ${slide.title}`}>
      <p className="landing-eyebrow">0{index + 1} / {slide.title}</p><h2>{slide.heading}</h2>
      <div className="home-slide-visual">
        {index === 0 && <div className="home-role-list">{["Business operator", "Process owner", "Technical owner"].map((role, number) =>
          <div key={role}><span aria-hidden="true">0{number + 1}</span><strong>{role}</strong><small>Structured perspective</small></div>)}</div>}
        {index === 1 && <div className="home-shortlist">
          <div><span>Duplicate invoice checks</span><strong>Review sources</strong></div>
          <div><span>Exception routing</span><strong>Unknowns remain</strong></div>
          <p>Value · Feasibility · Confidence · Risk · Effort</p>
        </div>}
        {index === 2 && <div className="home-handoff">
          <span>Reviewed hypothesis</span><span aria-hidden="true">↓</span><strong>Separate workflow assessment</strong><small>Sources carried forward as unverified</small>
        </div>}
      </div>
      <p>{slide.text}</p><Link to={slide.path}>{slide.link} <span aria-hidden="true">↗</span></Link>
    </div>
    <div className="home-slide-controls">
      <button aria-label="Previous product slide" onClick={() => move(-1)}>←</button>
      <div role="group" aria-label="Choose product slide">{slides.map((item, number) =>
        <button key={item.title} aria-label={`Show ${item.title} slide`} aria-pressed={index === number} onClick={() => setIndex(number)}>
          <span aria-hidden="true" />
        </button>)}</div>
      <button aria-label="Next product slide" onClick={() => move(1)}>→</button>
    </div>
    <p className="showcase-footer" role="status">Slide {index + 1} of 3: {slide.title}. Illustrative only; no records created.</p>
  </article>;
}
