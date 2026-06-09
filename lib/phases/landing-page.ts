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

export function renderLandingPage(
  kit: Kit,
  opts: { url: string; anonKey: string; projectId: string; brand: string }
): string {
  const p = kit.positioning;
  const cfg = JSON.stringify({ url: opts.url, anonKey: opts.anonKey, projectId: opts.projectId });

  const bullets = p.benefit_bullets
    .map(
      (b) =>
        `<div class="rounded-xl border border-white/10 bg-white/5 p-5"><div class="text-cyan-400 mb-2">✦</div><p class="text-slate-200">${esc(
          b
        )}</p></div>`
    )
    .join("");

  const quotes = kit.social_proof
    .map(
      (s) =>
        `<figure class="rounded-xl border border-white/10 bg-white/5 p-5"><blockquote class="text-slate-200 italic">“${esc(
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
<title>${esc(p.headline)} — ${esc(opts.brand)}</title>
<meta name="description" content="${esc(p.subheadline)}" />
<script src="https://cdn.tailwindcss.com"></script>
<script>window.__RVC = ${cfg};</script>
<style>body{background:#05070d}</style>
</head>
<body class="bg-[#05070d] text-slate-100 antialiased">
  <div class="relative overflow-hidden">
    <div class="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[36rem] w-[36rem] rounded-full bg-indigo-600/20 blur-[120px]"></div>
    <main class="relative mx-auto max-w-3xl px-5 py-20">

      <!-- Hero -->
      <section class="text-center">
        <h1 class="text-4xl md:text-5xl font-semibold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">${esc(
          p.headline
        )}</h1>
        <p class="mt-4 text-lg text-slate-300">${esc(p.subheadline)}</p>
        <p class="mt-2 text-sm text-slate-500">${esc(p.problem_statement)}</p>

        <form id="waitlist" class="mx-auto mt-8 max-w-md space-y-3 text-left">
          <input name="email" type="email" required class="w-full rounded-lg bg-slate-900 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500" placeholder="you@email.com" />
          ${qualifying}
          <label class="flex items-center gap-2 text-sm text-slate-300"><input name="presale" type="checkbox" class="accent-indigo-500" /> I'd pre-order at the founder price</label>
          <button class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-3 font-medium text-white transition">Join the waitlist</button>
        </form>
        <div id="thanks" style="display:none" class="mx-auto mt-8 max-w-md rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-300">You're on the list 🎉 We'll be in touch.</div>
      </section>

      <!-- Benefits -->
      <section class="mt-20">
        <h2 class="text-sm uppercase tracking-widest text-slate-500 text-center mb-6">Why it matters</h2>
        <div class="grid gap-4 sm:grid-cols-2">${bullets}</div>
      </section>

      ${
        quotes
          ? `<section class="mt-20"><h2 class="text-sm uppercase tracking-widest text-slate-500 text-center mb-6">What people are saying</h2><div class="grid gap-4 sm:grid-cols-2">${quotes}</div></section>`
          : ""
      }

      <!-- Offer -->
      <section class="mt-20 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-8 text-center">
        <h2 class="text-2xl font-semibold text-white">${esc(kit.offer.headline)}</h2>
        <p class="mt-3 text-slate-300">${esc(kit.offer.details)}</p>
        <p class="mt-3 text-cyan-400 font-medium">${esc(kit.offer.price_hypothesis)}</p>
        <a href="#waitlist" class="mt-6 inline-block rounded-lg bg-white text-slate-900 px-6 py-3 font-medium">Get early access</a>
      </section>

      ${faqs ? `<section class="mt-20"><h2 class="text-sm uppercase tracking-widest text-slate-500 text-center mb-6">FAQ</h2><div class="space-y-3">${faqs}</div></section>` : ""}

      <footer class="mt-20 border-t border-white/10 pt-8 text-center text-xs text-slate-600">
        ${esc(opts.brand)} · built with the Rapid Vibe Coding Pipeline
      </footer>
    </main>
  </div>
  ${FORM_SCRIPT}
</body>
</html>`;
}
