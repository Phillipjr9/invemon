import { useEffect, useRef, useState } from 'react';
import { Wordmark } from './HomePage';
import './email-studio.css';
const templates = [
 {id:'welcome',label:'Welcome',category:'THE FIRST HELLO',title:'A considered beginning.',detail:'A short, pre-rendered 3D envelope animation welcomes a new account. The message stays clear even with images blocked.',motion:true},
 {id:'sign_in',label:'New sign-in',category:'ACCOUNT SECURITY',title:'Clarity comes first.',detail:'Security messages stay still. A clear timestamp and direct guidance matter more than decoration.',motion:false},
 {id:'password_changed',label:'Password changed',category:'PEACE OF MIND',title:'An important update.',detail:'A quiet, static security notice confirms a password change and explains that existing sessions were revoked.',motion:false},
 {id:'support_received',label:'Support received',category:'HERE TO HELP',title:'A message, acknowledged.',detail:'A concise acknowledgment with a support reference. No sensitive support content is repeated by email.',motion:false},
 {id:'workspace_saved',label:'Demo saved',category:'YOUR PROGRESS',title:'Ready when you return.',detail:'Confirms a cloud save without implying a real financial transaction or showing portfolio balances.',motion:false},
 {id:'preview',label:'Test notification',category:'A LITTLE PREVIEW',title:'Small details. A longer view.',detail:'The same letterpress-inspired palette and dimensional illustration, sent only when an account holder requests a preview.',motion:true},
];
export default function EmailStudio({onBack}:{onBack:()=>void}) {
 const [selected,setSelected] = useState('welcome'), [width,setWidth] = useState<'desktop'|'mobile'>('desktop');
 const item=templates.find(t=>t.id===selected)!;
 const previewRef = useRef<HTMLIFrameElement>(null);
 useEffect(() => {
  const frame = previewRef.current; if (!frame) return;
  let observer: ResizeObserver | undefined;
  const fit = () => {
   const doc = frame.contentDocument;
   if (!doc?.body || doc.URL === 'about:blank') return;
   observer?.disconnect();
   const resize = () => { frame.style.height = `${Math.ceil(doc.body.getBoundingClientRect().height) + 2}px`; };
   resize(); observer = new ResizeObserver(resize); observer.observe(doc.body);
  };
  frame.addEventListener('load', fit); fit();
  return () => { frame.removeEventListener('load', fit); observer?.disconnect(); };
 }, [item.id]);
 return <main className="email-studio"><header className="es-header"><button type="button" aria-label="Back to Invemon" onClick={onBack}><Wordmark /></button><span>THE CORRESPONDENCE COLLECTION</span><button type="button" onClick={onBack}>← Back to Invemon</button></header>
  <section className="es-intro"><span className="es-kicker">INVEMON / EMAIL STUDIO</span><h1>A little more<br /><em>personal.</em></h1><p>Useful updates. Quiet confidence. Thoughtfully crafted emails that keep your account in perspective.</p><span className="es-sample">FICTIONAL SAMPLES · NO EMAIL IS SENT FROM THIS PAGE</span></section>
  <div className="es-layout"><aside className="es-sidebar"><span className="es-kicker">CHOOSE A MOMENT</span><div className="es-template-list" role="group" aria-label="Email templates">{templates.map((template,index)=><button key={template.id} type="button" aria-pressed={item.id===template.id} onClick={()=>setSelected(template.id)}><small>0{index+1}</small><span>{template.label}</span><span aria-hidden="true">↗</span></button>)}</div>
   <div className="es-description" aria-live="polite"><span className="es-kicker">{item.category}</span><h2>{item.title}</h2><p>{item.detail}</p><span className="es-motion-label">{item.motion?'3D RENDER · ONE SHORT PLAY':'STATIC BY DESIGN'}</span></div>
   <div className="es-compat"><span>Designed for the real inbox.</span><p>Table-based HTML. Plain-text alternative. Static fallback for Outlook and reduced-motion support where the email app allows it. No scripts, interactive 3D, or WebGL.</p><a href={`/email-preview/${item.id}.txt`} target="_blank" rel="noreferrer">Read plain-text version ↗</a></div>
  </aside><section className="es-preview-area" aria-label="Email preview"><div className="es-toolbar"><span>INBOX PREVIEW</span><div role="group" aria-label="Preview width"><button type="button" aria-pressed={width==='desktop'} onClick={()=>setWidth('desktop')}>Desktop</button><button type="button" aria-pressed={width==='mobile'} onClick={()=>setWidth('mobile')}>Mobile</button></div></div><div className={`es-email-frame ${width}`}><div className="es-envelope-meta"><span><b>From</b> Invemon · sample sender</span><span><b>To</b> Alex Morgan · fictional recipient</span></div><iframe ref={previewRef} key={item.id} src={`/email-preview/${item.id}.html`} title={`${item.label} email specimen`} sandbox="allow-same-origin" /></div></section></div>
  <footer className="es-footer">A wider world. A longer view.<span>Visual previews are not inbox-delivery certification.</span></footer>
 </main>;
}
