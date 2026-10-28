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
// Sem a potência das usinas (ger = null) a janela fica indefinida
function janela(t){ return t.ger == null ? null : Math.max(0, +(t.pot - t.ger).toFixed(1)); }
function status(t){ const j = janela(t); if (j == null) return 'unk'; const r = j/t.pot; return r > .4 ? 'ok' : r >= .1 ? 'warn' : 'bad'; }
const STATUS_TXT = {ok:'Livre', warn:'Limitada', bad:'Saturada', unk:'GD a confirmar'};
const kw = v => v == null ? 'a confirmar' : `${fmt(v)} kW`;

const map = L.map('map', {zoomControl:false, attributionControl:true, minZoom:7, maxZoom:20, zoomSnap:.5}).setView(DATA.center, 16.5);
L.control.zoom({position:'bottomright'}).addTo(map);
map.attributionControl.setPrefix('Leaflet');
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// mapa base vetorial (quadras e ruas)
const base = DATA.blocks.length ? L.layerGroup()
  : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:20, maxNativeZoom:19, attribution:'© OpenStreetMap'});
DATA.blocks.forEach(b => L.polygon(b, {stroke:false, fillColor:css('--block'), fillOpacity:1, interactive:false}).addTo(base));
DATA.streets.forEach(s => L.polyline(s.c, {color:css('--street'), weight:s.w*4, opacity:1, interactive:false}).addTo(base));
if (DATA.blocks.length) base.addTo(map);
const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:20, maxNativeZoom:19, attribution:'Imagens © Esri'});
let satFailed = 0;
sat.on('tileerror', () => { if (!satFailed++) toast('As imagens de satélite não carregam nesta pré-visualização. No app publicado elas aparecem normalmente.'); });

// rede de média tensão por alimentador (CTMT)
const net = L.layerGroup().addTo(map);
const netRenderer = L.canvas({padding:.3});
const netWeight = DATA.feeders.length > 6 ? 2 : 4;
DATA.feeders.forEach(f => {
  L.polyline(f.c, {renderer:netRenderer, color:f.cor, weight:netWeight, opacity:.75, dashArray: f.ten > 20 ? '10 6' : null})
    .bindTooltip(`${f.id} (${f.cod}) — ${f.se} · ${kv(f.ten)} kV`, {sticky:true}).addTo(net);
  if (DATA.feeders.length <= 6) $('#feeder-legend').insertAdjacentHTML('beforeend', `<span><i class="dot" style="background:${f.cor};height:4px;width:16px"></i>${f.cod}</span>`);
});

// transformadores (desenhados em canvas para aguentar milhares de pontos)
map.createPane('trafos').style.zIndex = 450;
const renderer = L.canvas({padding:.3, pane:'trafos'});
const markers = new Map();
const radius = () => Math.max(3, Math.min(9, (map.getZoom() - 11) * 1.5));
function styleOf(t){
  const need = parseFloat($('#need').value), j = janela(t);
  const dim = need > 0 && !(j != null && j >= need);
  return {radius:radius(), color:'#fff', weight:1.5, fillColor:css('--' + status(t)), fillOpacity: dim ? .2 : 1, opacity: dim ? .3 : 1};
}
DATA.trafos.forEach(t => {
  const m = L.circleMarker(t.ll, {renderer, ...styleOf(t)}).bindTooltip(`${t.id} · ${fmt(t.pot)} kVA`, {direction:'top'});
  m.on('click', () => open(t));
  m.addTo(map); markers.set(t.id, m);
});
const sel = L.circleMarker([0, 0], {renderer, radius:14, color:css('--accent'), weight:4, fill:false, interactive:false});
function restyle(){ DATA.trafos.forEach(t => markers.get(t.id).setStyle(styleOf(t))); }
map.on('zoomend', restyle);

let current = null, showAll = false;
function open(t){
  current = t; sel.setLatLng(t.ll).addTo(map);
  const j = janela(t), st = status(t), pctG = t.ger == null ? 0 : Math.min(100, t.ger/t.pot*100);
  $('#h-pot').textContent = `${fmt(t.pot)} kVA`;
  $('#h-tp').textContent = `${kv(t.tp)} kV`;
  $('#h-ts').textContent = t.ts;
  $('#h-nat').textContent = t.usinas;
  const rows = [
    ...(t.nat ? [['Natureza do transformador', NAT[t.nat] || t.nat]] : []),
    ['Potência nominal', `${fmt(t.pot)} kVA`],
    ['Tensão primária', `${kv(t.tp)} kV`],
    ['Tensão secundária', t.sec || t.ts],
    ['Alimentador (CTMT)', `${t.ctmt} — ${t.ctmt_nome} · ${kv(t.tp)} kV`],
    ['Subestação (SE)', `${t.se} (${t.se_cod})`],
    ['Função', FUNC[t.tp] || t.funcao || 'Rebaixador MT'],
    ['Fases primárias', t.fp],
    ['Fases secundárias', t.fs],
    ['Elo fusível', t.elo],
    ['Usinas neste transformador', t.usinas],
    ['Geração conectada', kw(t.ger)],
    ['Janela para geração', kw(j), 'hl'],
    ['Tipo de transformador', t.tipo],
    ['Tipo de posse', POSSE[t.posse] || t.posse],
    ['Município', t.mun ? `${t.mun} (${t.ibge})` : t.ibge],
    ...(t.local ? [['Localidade', t.local]] : []),
  ];
  const extra = [
    ...(t.ucs ? [['Unidades consumidoras', t.ucs]] : []),
    ...(t.inst ? [['Instalação', t.inst]] : []),
    ...(t.descr ? [['Placa / descrição', t.descr]] : []),
    ...(t.area ? [['Área', t.area]] : []),
    ...(t.posto ? [['Posto de transformação', {PT:'Poste', CS:'Cabine', PD:'Pedestal'}[t.posto] || t.posto]] : []),
    ...(t.mrt ? [['Sistema', 'MRT (monofilar com retorno por terra)']] : []),
    ...(t.tp_fase && t.tp_fase !== t.tp ? [['Tensão no enrolamento primário', `${kv(t.tp_fase)} kV`]] : []),
    ...(t.ano ? [['Ano de instalação', t.ano]] : []),
    ['Coordenadas', `${t.ll[0].toFixed(5)}, ${t.ll[1].toFixed(5)}`],
    ...(t.ger != null ? [['Carregamento por GD', `${fmt(pctG,0)}%`]] : []),
  ];
  const need = parseFloat($('#need').value) || 10;
  $('#body').innerHTML = `
    <div class="idline"><span class="code">${t.id}</span><span class="pill ${st}">${STATUS_TXT[st]}</span></div>
    <div class="cap">
      <div class="bar" role="img" aria-label="Geração conectada ${fmt(t.ger)} kW de ${fmt(t.pot)} kVA"><i style="width:${pctG}%;background:var(--muted)"></i><i style="width:${100-pctG}%;background:var(--${st})"></i></div>
      <div class="lbl"><span>Conectada ${kw(t.ger)}</span><span>Livre ${kw(j)}</span></div>
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
    const p = parseFloat($('#simkw').value) || 0, rest = j - p;
    $('#simres').innerHTML = j == null
      ? `Este transformador tem ${t.usinas} usina(s), mas a potência delas ainda não foi carregada.`
      : rest >= 0
      ? `<b style="color:var(--ok)">Cabe.</b> Sobram ${fmt(rest)} kW de janela depois da usina.`
      : `<b style="color:var(--bad)">Não cabe.</b> Faltam ${fmt(-rest)} kW. Pode exigir troca do transformador ou obra de reforço.`;
  };
  $('#simkw').oninput = sim; sim();
  $('#sheet').hidden = false; $('#layer').classList.remove('closed');
}
$('#close').onclick = () => { $('#sheet').hidden = true; $('#layer').classList.add('closed'); map.removeLayer(sel); current = null; };
$('#layer').classList.add('closed');

function copy(t){
  const txt = [`Transformador: ${t.id}`, `Potência: ${fmt(t.pot)} kVA`, `Tensão primária: ${kv(t.tp)} kV`,
    `Tensão secundária: ${t.sec || t.ts}`, `Alimentador: ${t.ctmt} — ${t.se}`, `Fases: ${t.fp} / ${t.fs}`,
    `Usinas no transformador: ${t.usinas}`, `Geração conectada: ${kw(t.ger)}`, `Janela estimada: ${kw(janela(t))}`, `Coordenadas: ${t.ll.join(', ')}`].join('\n');
  navigator.clipboard?.writeText(txt).then(() => toast('Dados copiados.'), () => toast('Não foi possível copiar automaticamente.'))
    ?? toast('Não foi possível copiar automaticamente.');
}
let tt; function toast(m){ const e = $('#toast'); e.textContent = m; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => e.hidden = true, 3800); }

// filtro "usina que quero ligar"
function applyNeed(){
  restyle();
  const need = parseFloat($('#need').value);
  if (need > 0){ const n = DATA.trafos.filter(t => janela(t) != null && janela(t) >= need).length; toast(`${n} de ${DATA.trafos.length} transformadores têm janela para ${fmt(need)} kW.`); }
}
$('#need').addEventListener('change', applyNeed);

// busca
$('#q').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase(), box = $('#results');
  if (!q){ box.hidden = true; return; }
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const muns = Object.entries(DATA.municipios || {}).filter(([, n]) => norm(n).includes(norm(q)));
  const locs = (DATA.localidades || []).filter(l => norm(l.nome).includes(norm(q)));
  const hits = DATA.trafos.filter(t => [t.id, t.ctmt, t.ctmt_nome, t.se, t.descr || ''].some(v => v.toLowerCase().includes(q))).slice(0, 12);
  box.innerHTML = locs.map(l => `<button data-loc="${l.nome}"><span><b>${l.nome}</b><br><span class="sub">Distrito / localidade</span></span><span class="sub">${DATA.trafos.filter(t => t.local === l.nome).length} trafos</span></button>`).join('') + muns.map(([c, n]) => `<button data-mun="${c}"><span><b>${n}</b><br><span class="sub">Município · ${c}</span></span><span class="sub">${DATA.trafos.filter(t => t.ibge === c).length} trafos</span></button>`).join('') + (hits.length ? hits.map(t => `<button data-id="${t.id}"><span><span class="code">${t.id}</span><br><span class="sub">${t.ctmt} · ${t.se}</span></span><span class="sub">${fmt(t.pot)} kVA · janela ${kw(janela(t))}</span></button>`).join('')
    : muns.length || locs.length ? '' : '<button disabled><span class="sub">Nenhum transformador encontrado</span></button>');
  box.hidden = false;
});
$('#results').addEventListener('click', e => {
  const l = e.target.closest('button[data-loc]');
  if (l){ const loc = DATA.localidades.find(x => x.nome === l.dataset.loc); $('#results').hidden = true; $('#q').value = loc.nome; map.flyTo(loc.ll, 15); return; }
  const m = e.target.closest('button[data-mun]');
  if (m){ const pts = DATA.trafos.filter(t => t.ibge === m.dataset.mun).map(t => t.ll); $('#results').hidden = true; $('#q').value = DATA.municipios[m.dataset.mun]; map.flyToBounds(pts, {padding:[40, 40]}); return; }
  const b = e.target.closest('button[data-id]'); if (!b) return;
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
if (DATA.exemplo){
  const ex = DATA.trafos.find(t => t.pot === 75 && t.usinas > 0 && status(t) !== 'bad') || DATA.trafos[0];
  if (innerWidth >= 760) open(ex);
} else map.fitBounds(DATA.trafos.map(t => t.ll), {padding:[30, 30]});
})();

// Usa data/trafos.json (gerado da BDGD pelo scripts/bdgd_para_app.py); se não existir, cai no exemplo
async function loadData(){
  for (const url of ['data/trafos.json', 'data/exemplo.json']){
    try { const r = await fetch(url); if (r.ok){ const d = await r.json(); d.exemplo = url.includes('exemplo'); return d; } } catch (e) {}
  }
  throw new Error('Nenhum arquivo de dados encontrado em data/');
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
