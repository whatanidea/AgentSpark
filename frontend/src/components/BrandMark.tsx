import "./Kaisersol.css";
export default function BrandMark() {
  return <img src="/brand/kaisersol-icon-dark.svg" width="28" height="28" alt="" />;
}
export function Wordmark() {
  return <span className="ks-wordmark"><img className="ks-on-light" src="/brand/kaisersol-wordmark-on-light.svg" alt="Kaisersol"/>
    <img className="ks-on-dark" src="/brand/kaisersol-wordmark-on-dark.svg" alt="Kaisersol"/></span>;
}
