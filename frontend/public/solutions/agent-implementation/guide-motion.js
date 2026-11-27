const figure = document.querySelector("figure");
const button = figure.querySelector("button");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
function play() {
  if (reduced.matches) return;
  figure.classList.remove("playing");
  void figure.offsetWidth;
  figure.classList.add("playing");
}
function sync() {
  button.hidden = reduced.matches;
  if (reduced.matches) figure.classList.remove("playing");
}
sync();
reduced.addEventListener("change", sync);
button.addEventListener("click", play);
const observer = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    play();
    observer.disconnect();
  }
}, {threshold: 0.2});
observer.observe(figure);
