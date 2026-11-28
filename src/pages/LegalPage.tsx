import LegalLinks from '../components/LegalLinks';
import {useEffect,useRef} from 'react';
import policies from '../../shared/legal-policies.json';
import {Wordmark} from './HomePage';
import './legal-page.css';
export type LegalView='terms'|'privacy'|'risk'|'funding-conditions';
export default function LegalPage({documentId}:{documentId:LegalView}){
 const document=policies.documents.find(d=>d.id===documentId)!;
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[documentId]);
 return <main className="legal-page"><header><a href="#" aria-label="Invemon home"><Wordmark/></a><a href="#signup">Create an account</a><button type="button" onClick={()=>window.print()}>Print policy</button></header><div className="legal-layout"><aside><span className="legal-eyebrow">CLEAR TERMS. INFORMED CHOICES.</span><LegalLinks/><a href="#support">Questions or privacy requests?</a></aside><article><p className="legal-eyebrow">INVEMON / ACCOUNT POLICIES</p><h1 ref={heading} tabIndex={-1}>{document.title}</h1><p className="legal-summary">{document.summary}</p><p>Published {policies.publishedDate} · Policy bundle version {policies.version}</p><div className="legal-review" role="note">{policies.reviewNotice}</div><nav className="legal-contents" aria-label="On this page"><strong>On this page</strong>{document.sections.map((s,i)=><a key={s.heading} href={`#${documentId}?section=${i+1}`} onClick={e=>{e.preventDefault();const target=window.document.getElementById(`legal-section-${i+1}`);target?.scrollIntoView({block:'start'});target?.focus({preventScroll:true});}}>{i+1}. {s.heading}</a>)}</nav>{document.sections.map((s,i)=><section key={s.heading} id={`legal-section-${i+1}`} tabIndex={-1}><h2>{i+1}. {s.heading}</h2><p>{s.text}</p></section>)}<footer><LegalLinks/><p>Registration records explicit acceptance of the displayed policy bundle; it does not activate funding, guarantee returns or prove reserves.</p><a href="#support">Contact account support</a> · <a href="#signup">Return to signup</a></footer></article></div></main>;
}
