/**
 * Landing-page generator (Pre-Marketing, Stage 2).
 *
 * Produces a single self-contained, deployable HTML page in the Launch UI dark
 * aesthetic, populated from the validation kit, with a waitlist form wired to
 * Supabase (client-side anon key — safe to expose). Deploy anywhere static.
 *
 * Deterministic by design: the copy was already written by the LLM in Stage 1,
 * so this just renders it reliably (and guarantees the Supabase form is correct).
 */

interface Kit {
  positioning: {
    primary_keyword?: string;
    seo_title?: string;
    seo_description?: string;
    problem_statement: string;
    headline: string;
    subheadline: string;
    benefit_bullets: string[];
    faq: { q: string; a: string }[];
  };
  offer: { type: string; headline: string; details: string; price_hypothesis: string };
  qualifying_questions: { question: string; why: string }[];
  social_proof: { quote: string; source: string }[];
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Serialize a JSON-LD object for inline <script> embedding. Escapes "<" so a stray
// "</script>" (or other markup) inside LLM copy can't break out of the script tag.
function jsonLd(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

// Static client script (no ${} interpolation) — reads config from window.__RVC.
const FORM_SCRIPT = `
<script>
(function(){
  var C = window.__RVC;
  var form = document.getElementById('waitlist');
  var ok = document.getElementById('thanks');
  if(!form) return;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Joining…';
    var answers = {};
    form.querySelectorAll('[data-q]').forEach(function(el){ answers[el.getAttribute('data-q')] = el.value; });
    var presaleEl = form.querySelector('[name=presale]');
    var body = {
      project_id: C.projectId,
      email: form.querySelector('[name=email]').value,
      answers: answers,
      wants_presale: presaleEl ? presaleEl.checked : false,
      source: 'landing'
    };
    fetch(C.url + '/rest/v1/signups', {
      method: 'POST',
      headers: { 'apikey': C.anonKey, 'Authorization': 'Bearer ' + C.anonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(body)
    }).then(function(r){
      if(r.ok){ form.style.display='none'; ok.style.display='block'; }
      else { r.text().then(function(t){ alert('Something went wrong: ' + t); }); btn.disabled=false; btn.textContent='Join the waitlist'; }
    }).catch(function(){ btn.disabled=false; btn.textContent='Join the waitlist'; alert('Network error.'); });
  });
})();
</script>`;

// Curated motion layer — always on, lightweight, mobile-safe, and fully disabled
// under prefers-reduced-motion. Makes the page feel alive without a perf tax.
const MOTION_STYLE = `<style>
body{background:#05070d}
@keyframes auroraMove{0%{transform:translate(-8%,-6%) rotate(0deg)}50%{transform:translate(8%,4%) rotate(6deg)}100%{transform:translate(-8%,-6%) rotate(0deg)}}
@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.aurora{animation:auroraMove 20s ease-in-out infinite}
.floaty{animation:floatY 6s ease-in-out infinite}
.reveal{opacity:0;transform:translateY(20px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.reveal.is-visible{opacity:1;transform:none}
.lift{transition:transform .25s ease,box-shadow .25s ease}
.lift:hover{transform:translateY(-4px);box-shadow:0 16px 44px -16px rgba(99,102,241,.5)}
@media (prefers-reduced-motion: reduce){
  .aurora,.floaty{animation:none!important}
  .reveal{opacity:1!important;transform:none!important;transition:none!important}
  #bg3d{display:none!important}
}
</style>`;

const MOTION_SCRIPT = `<script>
(function(){
  var els=document.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('is-visible')});return;}
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('is-visible');io.unobserve(en.target);}})},{threshold:.12});
  els.forEach(function(e){io.observe(e)});
})();
</script>`;

// Opt-in WebGL hero: a flowing brand-coloured gradient shader on one full-bleed
// quad. Cheap (single draw), skipped on reduced-motion / no-WebGL, degrades to
// the CSS aurora underneath.
const THREE_HERO = `<canvas id="bg3d" class="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70"></canvas>
<script defer src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>
<script>
window.addEventListener('load',function(){
  try{
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var canvas=document.getElementById('bg3d'); if(!canvas||!window.THREE)return;
    // Create the context ourselves so THREE never retries with a conflicting type;
    // if WebGL is unavailable, bail to the CSS aurora underneath (no error).
    var ctx=canvas.getContext('webgl2')||canvas.getContext('webgl'); if(!ctx)return;
    var renderer=new THREE.WebGLRenderer({canvas:canvas,context:ctx,alpha:true,antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    var scene=new THREE.Scene();
    var cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    var u={u_time:{value:0},u_res:{value:new THREE.Vector2(1,1)},
      u_c1:{value:new THREE.Color(0x6366f1)},u_c2:{value:new THREE.Color(0x22d3ee)},u_c3:{value:new THREE.Color(0x8b5cf6)}};
    var frag='precision highp float;uniform float u_time;uniform vec2 u_res;uniform vec3 u_c1,u_c2,u_c3;'+
      'void main(){vec2 uv=gl_FragCoord.xy/u_res.xy;float t=u_time;'+
      'float w1=0.5+0.5*sin(uv.x*3.0+t)*cos(uv.y*2.0-t*0.7);'+
      'float w2=0.5+0.5*sin(uv.y*3.5-t*0.8)*cos(uv.x*2.5+t*0.5);'+
      'vec3 col=mix(u_c1,u_c2,clamp(w1,0.0,1.0));col=mix(col,u_c3,clamp(w2*0.6,0.0,1.0));'+
      'float d=distance(uv,vec2(0.5));col=mix(col,vec3(0.02,0.027,0.051),smoothstep(0.15,0.95,d));'+
      'gl_FragColor=vec4(col,0.6);}';
    var mat=new THREE.ShaderMaterial({uniforms:u,fragmentShader:frag,vertexShader:'void main(){gl_Position=vec4(position,1.0);}',transparent:true});
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat));
    function resize(){var w=canvas.clientWidth||window.innerWidth,h=canvas.clientHeight||window.innerHeight;renderer.setSize(w,h,false);u.u_res.value.set(w,h);}
    window.addEventListener('resize',resize);resize();
    function loop(ts){u.u_time.value=ts*0.0004;renderer.render(scene,cam);requestAnimationFrame(loop);}
    requestAnimationFrame(loop);
  }catch(e){}
});
</script>`;

export function renderLandingPage(
  kit: Kit,
  opts: {
    url: string;
    anonKey: string;
    projectId: string;
    brand: string;
    /** Optional Nano Banana brand assets as data URIs (kept inline so the page stays self-contained). */
    assets?: { logo?: string; hero?: string; og?: string };
    /** Opt-in WebGL (Three.js) animated hero. Off = lightweight CSS motion only. */
    threeHero?: boolean;
    /**
     * Final deployed URL, if known (used for canonical + og:url). Usually unknown
     * at generation time (deploy is a later phase), so when omitted the page sets
     * canonical/og:url to window.location at runtime — self-correcting per deploy.
     */
    canonicalUrl?: string;
  }
): string {
  const p = kit.positioning;
  const cfg = JSON.stringify({ url: opts.url, anonKey: opts.anonKey, projectId: opts.projectId });
  const a = opts.assets || {};

  // SEO copy: prefer the dedicated search-snippet fields, fall back to on-page copy.
  const seoTitle = (p.seo_title || `${p.headline} — ${opts.brand}`).trim();
  const seoDesc = (p.seo_description || p.subheadline || "").trim();
  const canonical = opts.canonicalUrl || "";

  // FAQPage JSON-LD — earns rich results and is directly citable by AI search.
  const faqLd = p.faq && p.faq.length
    ? jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: p.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      })
    : "";

  // SoftwareApplication / Organization JSON-LD — describes the product to crawlers + LLMs.
  const productLd = jsonLd({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: opts.brand,
    description: seoDesc || p.problem_statement,
    applicationCategory: "BusinessApplication",
    ...(a.og ? { image: a.og } : {}),
    ...(kit.offer?.price_hypothesis ? { offers: { "@type": "Offer", description: kit.offer.price_hypothesis } } : {}),
  });

  // Set canonical + og:url to the live URL at runtime when not known at build time.
  const canonicalScript = canonical
    ? ""
    : `<script>(function(){var u=location.origin+location.pathname;var c=document.getElementById('rvc-canonical');if(c)c.href=u;var o=document.getElementById('rvc-ogurl');if(o)o.content=u;})();</script>`;

  const logoMark = a.logo
    ? `<img src="${a.logo}" alt="${esc(opts.brand)} logo" class="floaty mx-auto mb-8 h-14 w-14 rounded-xl object-contain" />`
    : "";
  const heroArt = a.hero
    ? `<img src="${a.hero}" alt="" class="mx-auto mt-10 w-full max-w-2xl rounded-2xl border border-white/10 object-cover" />`
    : "";
  const ogMeta = a.og
    ? `<meta property="og:image" content="${a.og}" /><meta name="twitter:card" content="summary_large_image" />`
    : "";

  const bullets = p.benefit_bullets
    .map(
      (b) =>
        `<div class="lift reveal rounded-xl border border-white/10 bg-white/5 p-5"><div class="text-cyan-400 mb-2">✦</div><p class="text-slate-200">${esc(
          b
        )}</p></div>`
    )
    .join("");

  const quotes = kit.social_proof
    .map(
      (s) =>
        `<figure class="lift reveal rounded-xl border border-white/10 bg-white/5 p-5"><blockquote class="text-slate-200 italic">“${esc(
          s.quote
        )}”</blockquote><figcaption class="mt-2 text-xs text-slate-400">— ${esc(s.source)}</figcaption></figure>`
    )
    .join("");

  const faqs = p.faq
    .map(
      (f) =>
        `<details class="rounded-xl border border-white/10 bg-white/5 p-4"><summary class="cursor-pointer text-slate-100 font-medium">${esc(
          f.q
        )}</summary><p class="mt-2 text-slate-300">${esc(f.a)}</p></details>`
    )
    .join("");

  const qualifying = kit.qualifying_questions
    .slice(0, 1)
    .map(
      (q) =>
        `<input data-q="${esc(q.question)}" class="w-full rounded-lg bg-slate-900 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500" placeholder="${esc(
          q.question
        )}" />`
    )
    .join("");

  return `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(seoDesc)}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link id="rvc-canonical" rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(seoTitle)}" />
<meta property="og:description" content="${esc(seoDesc)}" />
<meta property="og:site_name" content="${esc(opts.brand)}" />
<meta id="rvc-ogurl" property="og:url" content="${esc(canonical)}" />
<meta name="twitter:title" content="${esc(seoTitle)}" />
<meta name="twitter:description" content="${esc(seoDesc)}" />
${ogMeta}
${faqLd}
${productLd}
<script src="https://cdn.tailwindcss.com"></script>
<script>window.__RVC = ${cfg};</script>
${MOTION_STYLE}
</head>
<body class="bg-[#05070d] text-slate-100 antialiased">
  <div class="relative overflow-hidden">
    ${opts.threeHero ? THREE_HERO : ""}
    <div class="aurora pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[36rem] w-[36rem] rounded-full bg-indigo-600/20 blur-[120px]"></div>
    <main class="relative mx-auto max-w-3xl px-5 py-20">

      <!-- Hero -->
      <section class="text-center">
        ${logoMark}
        <h1 class="text-4xl md:text-5xl font-semibold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">${esc(
          p.headline
        )}</h1>
        <p class="mt-4 text-lg text-slate-300">${esc(p.subheadline)}</p>
        <p class="mt-2 text-sm text-slate-500">${esc(p.problem_statement)}</p>

        <form id="waitlist" aria-label="Join the waitlist" class="mx-auto mt-8 max-w-md space-y-3 text-left">
          <input name="email" type="email" required aria-label="Email address" class="w-full rounded-lg bg-slate-900 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500" placeholder="you@email.com" />
          ${qualifying}
          <label class="flex items-center gap-2 text-sm text-slate-300"><input name="presale" type="checkbox" class="accent-indigo-500" /> I'd pre-order at the founder price</label>
          <button class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-3 font-medium text-white transition">Join the waitlist</button>
        </form>
        <div id="thanks" style="display:none" class="mx-auto mt-8 max-w-md rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-300">You're on the list 🎉 We'll be in touch.</div>
        ${heroArt}
      </section>

      ${
        quotes
          ? `<!-- Social proof — kept near the conversion point to build trust before the visitor scrolls away -->
      <section class="mt-16" aria-label="What people are saying"><h2 class="text-sm uppercase tracking-widest text-slate-500 text-center mb-6">What people are saying</h2><div class="grid gap-4 sm:grid-cols-2">${quotes}</div></section>`
          : ""
      }

      <!-- Benefits -->
      <section class="mt-20 reveal">
        <h2 class="text-sm uppercase tracking-widest text-slate-500 text-center mb-6">Why it matters</h2>
        <div class="grid gap-4 sm:grid-cols-2">${bullets}</div>
      </section>

      <!-- Offer -->
      <section class="mt-20 reveal lift rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-8 text-center">
        <h2 class="text-2xl font-semibold text-white">${esc(kit.offer.headline)}</h2>
        <p class="mt-3 text-slate-300">${esc(kit.offer.details)}</p>
        <p class="mt-3 text-cyan-400 font-medium">${esc(kit.offer.price_hypothesis)}</p>
        <a href="#waitlist" class="mt-6 inline-block rounded-lg bg-white text-slate-900 px-6 py-3 font-medium">Get early access</a>
      </section>

      ${faqs ? `<section class="mt-20" aria-label="Frequently asked questions"><h2 class="text-sm uppercase tracking-widest text-slate-500 text-center mb-6">FAQ</h2><div class="space-y-3">${faqs}</div></section>` : ""}

      <!-- Closing CTA — a second conversion point for visitors who read all the way down -->
      <section class="mt-20 reveal text-center">
        <h2 class="text-2xl md:text-3xl font-semibold text-white">${esc(p.headline)}</h2>
        <p class="mt-3 text-slate-300">${esc(p.subheadline)}</p>
        <a href="#waitlist" class="mt-6 inline-block rounded-lg bg-indigo-600 hover:bg-indigo-500 px-6 py-3 font-medium text-white transition">Join the waitlist</a>
      </section>

      <footer class="mt-20 border-t border-white/10 pt-8 text-center text-xs text-slate-600">
        © <span id="rvc-year"></span> ${esc(opts.brand)}
      </footer>
    </main>
  </div>
  ${FORM_SCRIPT}
  ${MOTION_SCRIPT}
  ${canonicalScript}
  <script>(function(){var y=document.getElementById('rvc-year');if(y)y.textContent=new Date().getFullYear();})();</script>
</body>
</html>`;
}
