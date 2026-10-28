// Trafo Solar GO — consulta de transformadores para geração distribuída
(async () => {
const DATA = await loadData();
const $ = s => document.querySelector(s);
const kv = v => v == null ? '—' : String(v).replace('.', ',');
const fmt = (n, d=1) => Number(n).toLocaleString('pt-BR', {maximumFractionDigits:d});
const FUNC = {13.8:'Rebaixador MT', 34.5:'Rebaixador MT'};
const POSSE = {PD:'Próprio da distribuidora', PT:'Particular'};
const NAT = {57:'57 — Concessionária (Distribuidora)'};

// Janela = potência nominal (kVA ≈ kW com FP 1) − geração já conectada
function janela(t){ return Math.max(0, +(t.pot - t.ger).toFixed(1)); }
function status(t){ const r = janela(t)/t.pot; return r > .4 ? 'ok' : r >= .1 ? 'warn' : 'bad'; }
const STATUS_TXT = {ok:'Livre', warn:'Limitada', bad:'Saturada'};

const map = L.map('map', {zoomControl:false, attributionControl:true, minZoom:14, maxZoom:20, zoomSnap:.5}).setView(DATA.center, 16.5);
L.control.zoom({position:'bottomright'}).addTo(map);
map.attributionControl.setPrefix('Leaflet');
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// mapa base vetorial (quadras e ruas)
const base = L.layerGroup();
DATA.blocks.forEach(b => L.polygon(b, {stroke:false, fillColor:css('--block'), fillOpacity:1, interactive:false}).addTo(base));
DATA.streets.forEach(s => L.polyline(s.c, {color:css('--street'), weight:s.w*4, opacity:1, interactive:false}).addTo(base));
if (DATA.blocks.length) base.addTo(map);
const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:20, maxNativeZoom:19, attribution:'Imagens © Esri'});
let satFailed = 0;
sat.on('tileerror', () => { if (!satFailed++) toast('As imagens de satélite não carregam nesta pré-visualização. No app publicado elas aparecem normalmente.'); });

// rede de média tensão por alimentador (CTMT)
const net = L.layerGroup().addTo(map);
DATA.feeders.forEach(f => {
  L.polyline(f.c, {color:f.cor, weight:4, opacity:.9, dashArray: f.ten > 20 ? '10 6' : null})
    .bindTooltip(`${f.cod} — ${f.se} · ${String(f.ten).replace('.',',')} kV`, {sticky:true}).addTo(net);
  $('#feeder-legend').insertAdjacentHTML('beforeend', `<span><i class="dot" style="background:${f.cor};height:4px;width:16px"></i>${f.cod}</span>`);
});

// transformadores
const X = '<svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';
const markers = new Map();
DATA.trafos.forEach(t => {
  const m = L.marker(t.ll, {icon: L.divIcon({className:'', html:`<div class="tr ${status(t)}" data-id="${t.id}">${X}</div>`, iconSize:[22,22], iconAnchor:[11,11]}),
    title:`${t.id} · ${fmt(t.pot)} kVA`, keyboard:true});
  m.on('click', () => open(t));
  m.addTo(map); markers.set(t.id, m);
});

let current = null, showAll = false;
function el(id){ return markers.get(id)?.getElement()?.querySelector('.tr'); }
function open(t){
  if (current) el(current.id)?.classList.remove('sel');
  current = t; el(t.id)?.classList.add('sel');
  const j = janela(t), st = status(t), pctG = Math.min(100, t.ger/t.pot*100);
  $('#h-pot').textContent = `${fmt(t.pot)} kVA`;
  $('#h-tp').textContent = `${kv(t.tp)} kV`;
  $('#h-ts').textContent = t.ts;
  $('#h-nat').textContent = t.usinas;
  const rows = [
    ...(t.nat ? [['Natureza do transformador', NAT[t.nat] || t.nat]] : []),
    ['Potência nominal', `${fmt(t.pot)} kVA`],
    ['Tensão primária', `${kv(t.tp)} kV`],
    ['Tensão secundária', t.sec],
    ['Alimentador (CTMT)', `${t.ctmt} — ${t.se} · ${kv(t.tp)} kV`],
    ['Subestação (SE)', `${t.se} (${t.se_cod})`],
    ['Função', FUNC[t.tp] || t.funcao || 'Rebaixador MT'],
    ['Fases primárias', t.fp],
    ['Fases secundárias', t.fs],
    ['Elo fusível', t.elo],
    ['Usinas neste transformador', t.usinas],
    ['Geração conectada', `${fmt(t.ger)} kW`],
    ['Janela para geração', `${fmt(j)} kW`, 'hl'],
    ['Tipo de transformador', t.tipo],
    ['Tipo de posse', POSSE[t.posse] || t.posse],
    ['Município', t.mun ? `${t.mun} (${t.ibge})` : t.ibge],
  ];
  const extra = [
    ...(t.ucs ? [['Unidades consumidoras', t.ucs]] : []),
    ...(t.inst ? [['Instalação', t.inst]] : []),
    ...(t.ano ? [['Ano de instalação', t.ano]] : []),
    ['Coordenadas', `${t.ll[0].toFixed(5)}, ${t.ll[1].toFixed(5)}`],
    ['Carregamento por GD', `${fmt(pctG,0)}%`],
  ];
  const need = parseFloat($('#need').value) || 10;
  $('#body').innerHTML = `
    <div class="idline"><span class="code">${t.id}</span><span class="pill ${st}">${STATUS_TXT[st]}</span></div>
    <div class="cap">
      <div class="bar" role="img" aria-label="Geração conectada ${fmt(t.ger)} kW de ${fmt(t.pot)} kVA"><i style="width:${pctG}%;background:var(--muted)"></i><i style="width:${100-pctG}%;background:var(--${st})"></i></div>
      <div class="lbl"><span>Conectada ${fmt(t.ger)} kW</span><span>Livre ${fmt(j)} kW</span></div>
    </div>
    <dl>${rows.map(r => `<dt>${r[0]}</dt><dd class="${r[2]||''}">${r[1]}</dd>`).join('')}
    ${showAll ? extra.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('') : ''}</dl>
    <button class="more" id="more">${showAll ? 'Ocultar atributos adicionais' : `Ver atributos adicionais (${extra.length})`}</button>
    <div class="sim">
      <div class="r"><label for="simkw">Simular usina de</label><input id="simkw" type="number" min="0" step="0.5" value="${need}"><span>kW</span></div>
      <p id="simres"></p>
    </div>
    ${t.gd.length ? `<h3>Usinas conectadas (kW)</h3><div class="gdlist">${t.gd.map(g => `<span>${fmt(g)}</span>`).join('')}</div>` : ''}
    <div class="actions">
      <button class="btn primary" id="copy">Copiar dados para o projeto</button>
      <button class="btn" id="zoom">Centralizar no mapa</button>
    </div>
    <p class="note">A janela é estimada como potência do transformador menos a geração já conectada. A análise oficial de acesso é feita pela distribuidora (Equatorial Goiás).</p>`;
  $('#more').onclick = () => { showAll = !showAll; open(t); };
  $('#zoom').onclick = () => map.flyTo(t.ll, 19);
  $('#copy').onclick = () => copy(t);
  const sim = () => {
    const kw = parseFloat($('#simkw').value) || 0, rest = j - kw;
    $('#simres').innerHTML = rest >= 0
      ? `<b style="color:var(--ok)">Cabe.</b> Sobram ${fmt(rest)} kW de janela depois da usina.`
      : `<b style="color:var(--bad)">Não cabe.</b> Faltam ${fmt(-rest)} kW. Pode exigir troca do transformador ou obra de reforço.`;
  };
  $('#simkw').oninput = sim; sim();
  $('#sheet').hidden = false; $('#layer').classList.remove('closed');
}
$('#close').onclick = () => { $('#sheet').hidden = true; $('#layer').classList.add('closed'); if (current) el(current.id)?.classList.remove('sel'); current = null; };
$('#layer').classList.add('closed');

function copy(t){
  const txt = [`Transformador: ${t.id}`, `Potência: ${fmt(t.pot)} kVA`, `Tensão primária: ${kv(t.tp)} kV`,
    `Tensão secundária: ${t.sec}`, `Alimentador: ${t.ctmt} — ${t.se}`, `Fases: ${t.fp} / ${t.fs}`,
    `Geração conectada: ${fmt(t.ger)} kW`, `Janela estimada: ${fmt(janela(t))} kW`, `Coordenadas: ${t.ll.join(', ')}`].join('\n');
  navigator.clipboard?.writeText(txt).then(() => toast('Dados copiados.'), () => toast('Não foi possível copiar automaticamente.'))
    ?? toast('Não foi possível copiar automaticamente.');
}
let tt; function toast(m){ const e = $('#toast'); e.textContent = m; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => e.hidden = true, 3800); }

// filtro "usina que quero ligar"
function applyNeed(){
  const kw = parseFloat($('#need').value);
  DATA.trafos.forEach(t => { const e = el(t.id); if (!e) return;
    e.classList.toggle('dim', kw > 0 && janela(t) < kw);
    e.classList.toggle('fit', kw > 0 && janela(t) >= kw); });
  if (kw > 0){ const n = DATA.trafos.filter(t => janela(t) >= kw).length; toast(`${n} de ${DATA.trafos.length} transformadores têm janela para ${fmt(kw)} kW.`); }
}
$('#need').addEventListener('change', applyNeed);
map.on('zoomend moveend', () => { applyNeed.silent = true; const kw = parseFloat($('#need').value);
  DATA.trafos.forEach(t => { const e = el(t.id); if (!e) return; e.classList.toggle('dim', kw > 0 && janela(t) < kw); e.classList.toggle('fit', kw > 0 && janela(t) >= kw); e.classList.toggle('sel', current?.id === t.id); }); });

// busca
$('#q').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase(), box = $('#results');
  if (!q){ box.hidden = true; return; }
  const hits = DATA.trafos.filter(t => [t.id, t.ctmt, t.ctmt_nome, t.se].some(v => v.toLowerCase().includes(q))).slice(0, 12);
  box.innerHTML = hits.length ? hits.map(t => `<button data-id="${t.id}"><span><span class="code">${t.id}</span><br><span class="sub">${t.ctmt} · ${t.se}</span></span><span class="sub">${fmt(t.pot)} kVA · janela ${fmt(janela(t))} kW</span></button>`).join('')
    : '<button disabled><span class="sub">Nenhum transformador encontrado</span></button>';
  box.hidden = false;
});
$('#results').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b) return;
  const t = DATA.trafos.find(x => x.id === b.dataset.id); $('#results').hidden = true; $('#q').value = t.id; map.flyTo(t.ll, 18.5); open(t); });

// camadas
function press(id, on){ $(id).setAttribute('aria-pressed', on); }
$('#b-vec').onclick = () => { map.removeLayer(sat); base.addTo(map); press('#b-vec', true); press('#b-sat', false); };
$('#b-sat').onclick = () => { map.removeLayer(base); sat.addTo(map); press('#b-sat', true); press('#b-vec', false); };
$('#b-net').onclick = () => { const on = map.hasLayer(net); on ? map.removeLayer(net) : net.addTo(map); press('#b-net', !on); };

if (!DATA.blocks.length){ sat.addTo(map); press('#b-sat', true); press('#b-vec', false); }
// abre um exemplo parecido com a referência (75 kVA)
if (!DATA.exemplo) document.querySelector('.demo').hidden = true;
if (DATA.fonte) map.attributionControl.addAttribution(DATA.fonte);
const ex = DATA.trafos.find(t => t.pot === 75 && t.usinas > 0 && status(t) !== 'bad') || DATA.trafos.find(t => t.usinas > 1) || DATA.trafos[0];
if (innerWidth >= 760) open(ex); else el(ex.id)?.classList.add('sel');
})();

// Usa data/trafos.json (gerado da BDGD pelo scripts/bdgd_para_app.py); se não existir, cai no exemplo
async function loadData(){
  for (const url of ['data/trafos.json', 'data/exemplo.json']){
    try { const r = await fetch(url); if (r.ok){ const d = await r.json(); d.exemplo = url.includes('exemplo'); return d; } } catch (e) {}
  }
  throw new Error('Nenhum arquivo de dados encontrado em data/');
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
