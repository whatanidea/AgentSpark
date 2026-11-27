import Cowork from "./cowork";
import Dots from "./dots";
import Grok from "./grok";
import Openbot from "./openbot";
import Solutions from "./solutions";
import Brief from "./claim-intake";
import "./Documents.css";

const content: Record<string, typeof Cowork> = {cowork: Cowork, dots: Dots, grok: Grok, openbot: Openbot, solutions: Solutions, "claim-intake": Brief};
export function DocumentPage({path}: {path: string}) {
  const slug = path.slice(path.lastIndexOf("/") + 1, -5);
  const Content = content[slug];
  return <article id="top" className={`ks-document ${slug}`}><Content/></article>;
}
