import policies from '../../shared/legal-policies.json';
import '../pages/legal-page.css';
export default function LegalLinks(){return <nav className="legal-links" aria-label="Account policies">{policies.documents.map(d=><a key={d.id} href={`#${d.id}`}>{d.title}</a>)}</nav>;}
