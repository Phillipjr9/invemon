import Icon from './Icon';
import '../pages/visual-sections.css';

const asset = (name: string) => `/assets/${name}`;

export function MobileShowcase({ onExplore }: { onExplore: () => void }) {
  return <section className="iv-mobile-showcase iv-container" aria-labelledby="mobile-showcase-title">
    <div className="iv-mobile-stage">
      <span className="iv-mobile-orbit" aria-hidden="true" />
      <span className="iv-mobile-stage-label">THE BIGGER PICTURE. ALWAYS WITH YOU.</span>
      <img src={asset('Phone-Mockup-B2GNQEM.png')} alt="Invemon mobile app concept showing a portfolio chart and investment overview on two phones" width="700" height="850" loading="lazy" />
    </div>
    <div className="iv-mobile-copy"><span className="iv-eyebrow">YOUR WORLD. IN YOUR HANDS.</span><h2>A little closer<br />to <em>your future.</em></h2><p>Your investments shouldn’t feel a world away. Get a clear view of your portfolio, explore opportunities, and keep your goals in sight—wherever the day takes you.</p><ul><li><Icon name="chart" size={19} /><span><strong>Your progress, at a glance.</strong>A considered overview of your investment journey.</span></li><li><Icon name="folders" size={19} /><span><strong>One place. A wider perspective.</strong>Explore your holdings and portfolio allocation.</span></li><li><Icon name="target" size={19} /><span><strong>Built around what matters.</strong>Keep your long-term ambitions in focus.</span></li></ul><button className="iv-btn" onClick={onExplore}>Explore the web demo <Icon name="arrow" size={18} /></button><small>Original mobile app concept shown. No app download is available.</small></div>
  </section>;
}

const photography = [
  { image: 'currency-YCG8AHH.jpg', label: '01 / EVERYDAY PERSPECTIVE', title: 'Stay connected to the bigger picture.', alt: 'An investor viewing financial charts on a phone and laptop' },
  { image: 'part-of-9ES8348.jpg', label: '02 / MARKET RESEARCH', title: 'Understand what’s behind the numbers.', alt: 'A financial analyst reviewing charts across several monitors' },
  { image: 'moder-HL9BTHH.jpg', label: '03 / SHARED KNOWLEDGE', title: 'Make space for another perspective.', alt: 'Two professionals discussing financial market research' },
  { image: 'volatilit-KEUW82N.jpg', label: '04 / MARKET MOVEMENTS', title: 'See the movement. Consider the context.', alt: 'A close-up view of a financial market candlestick chart' },
  { image: 'with-m-9C22FUP.jpg', label: '05 / A CONSIDERED ROUTINE', title: 'Research first. Decisions second.', alt: 'An analyst studying market information at a desk' },
];

export function OriginalPhotography({ onExplore }: { onExplore: () => void }) {
  return <>
    <section className="iv-photo-stories iv-container" aria-labelledby="photo-stories-title"><div className="iv-section-top"><span className="iv-eyebrow">MORE THAN NUMBERS ON A SCREEN</span><span className="iv-section-number">PEOPLE. PERSPECTIVES. POSSIBILITIES.</span></div><div className="iv-market-heading"><h2 id="photo-stories-title">A clearer view.<br /><em>A more informed you.</em></h2><p>A place to be curious about investing.<br />And thoughtful about what comes next.</p></div><div className="iv-photo-story-grid">{photography.map((photo, index) => <article className={index === 0 ? 'iv-photo-story iv-photo-story-lead' : 'iv-photo-story'} key={photo.image}><div><img src={asset(photo.image)} alt={photo.alt} loading="lazy" width="800" height="530" /></div><span>{photo.label}</span><h3>{photo.title}</h3></article>)}</div><button className="iv-text-btn" onClick={onExplore}>Put your research into perspective—explore the demo <Icon name="arrow" size={17} /></button></section>
    <section className="iv-people iv-container" aria-labelledby="people-title"><div className="iv-people-images"><img className="iv-people-main" src={asset('wins-FHYGRXJ.jpg')} alt="A group of professionals gathered in a shared workspace" width="800" height="530" loading="lazy" /><img className="iv-people-inset" src={asset('successf-46DXS95.jpeg')} alt="Colleagues sharing a moment of celebration in an office" width="800" height="530" loading="lazy" /></div><div className="iv-people-copy"><span className="iv-eyebrow">INVESTING IS PERSONAL</span><h2 id="people-title">Different lives.<br />Different goals.<br /><em>Room for yours.</em></h2><p>A first investment. A longer-term plan. More freedom to choose what comes next. Whatever your starting point, your goals deserve a place in the picture.</p><div className="iv-portrait-row" aria-label="Original lifestyle portrait collection"><div>{['4-people-having-a-v-3628WWS.png', '2-people-having-a-v-3628WWS.png', '5-people-having-a-v-3628WWS.png'].map((image, i) => <img key={image} src={asset(image)} alt={['Portrait of a woman in a dark top', 'Portrait of a man in a dark jacket', 'Portrait of a woman in a yellow top'][i]} width="56" height="56" loading="lazy" />)}</div><span>A world of individual perspectives.</span></div><small>Illustrative photography, not customer testimonials.</small></div></section>
    <section className="iv-original-logos" aria-label="Original brand imagery"><div className="iv-container"><div className="iv-original-logos-head"><span className="iv-eyebrow">FROM THE ORIGINAL VISUAL COLLECTION</span><span>Brand imagery retained from the original site concept.</span></div><div className="iv-original-logo-row">{[{ image: 'iOasis.png', name: 'iOasis' }, { image: 'Logo.png', name: 'Jobsage' }, { image: 'Stratifi.png', name: 'Stratifi' }, { image: 'Vector.png', name: 'Virtuo' }, { image: 'Altura.png', name: 'Altura' }].map(logo => <img src={asset(logo.image)} key={logo.image} alt={logo.name} width="160" height="55" loading="lazy" />)}</div><p>Displayed as original concept assets only. No partnership, endorsement, or affiliation is implied.</p></div></section>
  </>;
}
