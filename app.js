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

// rotate: giro com dois dedos (celular), Shift + roda do mouse (PC) e bússola para voltar ao norte
const map = L.map('map', {zoomControl:false, attributionControl:true, minZoom:7, maxZoom:20, zoomSnap:.5,
  rotate:true, touchRotate:true, shiftKeyRotate:true, bearing:0, rotateControl:{closeOnZeroBearing:false, position:'bottomright'}}).setView(DATA.center, 16.5);
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
map.createPane('trafos', map.getPane('rotatePane') || map.getPane('mapPane')).style.zIndex = 450;
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

// busca: trafo, alimentador, município, distrito, endereço ou coordenadas
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COORD = /^\s*(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*$/;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
function coordsDe(q){ const m = q.match(COORD); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : null; }

$('#q').addEventListener('input', e => {
  const raw = e.target.value.trim(), q = raw.toLowerCase(), box = $('#results');
  if (!q){ box.hidden = true; return; }
  const c = coordsDe(raw);
  const muns = Object.entries(DATA.municipios || {}).filter(([, n]) => norm(n).includes(norm(q)));
  const locs = (DATA.localidades || []).filter(l => norm(l.nome).includes(norm(q)));
  const hits = DATA.trafos.filter(t => [t.id, t.ctmt, t.ctmt_nome, t.se, t.descr || ''].some(v => v.toLowerCase().includes(q))).slice(0, 10);
  box.innerHTML =
    (c ? `<button data-gll="${c.join(',')}"><span><b>Ir para a coordenada</b><br><span class="sub">${c.join(', ')}</span></span><span class="sub">ver trafo mais próximo</span></button>` : '')
    + (!c && raw.length >= 4 ? `<button data-geo="1"><span><b>Buscar endereço</b><br><span class="sub">${esc(raw)}</span></span><span class="sub">Enter</span></button>` : '')
    + locs.map(l => `<button data-loc="${l.nome}"><span><b>${l.nome}</b><br><span class="sub">Distrito / localidade</span></span><span class="sub">${DATA.trafos.filter(t => t.local === l.nome).length} trafos</span></button>`).join('')
    + muns.map(([c, n]) => `<button data-mun="${c}"><span><b>${n}</b><br><span class="sub">Município · ${c}</span></span><span class="sub">${DATA.trafos.filter(t => t.ibge === c).length} trafos</span></button>`).join('')
    + hits.map(t => `<button data-id="${t.id}"><span><span class="code">${t.id}</span><br><span class="sub">${t.ctmt} · ${t.se}</span></span><span class="sub">${fmt(t.pot)} kVA · janela ${kw(janela(t))}</span></button>`).join('');
  box.hidden = !box.innerHTML;
});
$('#q').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const raw = e.target.value.trim(), c = coordsDe(raw);
  if (c){ $('#results').hidden = true; return irPara(c, 'Coordenada informada'); }
  const so = $('#results').querySelectorAll('button[data-loc], button[data-mun], button[data-id]');
  if (so.length === 1) return so[0].click();
  if (raw.length >= 4) geocode(raw);
});
$('#results').addEventListener('click', e => {
  if (e.target.closest('button[data-geo]')) return geocode($('#q').value.trim());
  const g = e.target.closest('button[data-gll]');
  if (g){ $('#results').hidden = true; return irPara(g.dataset.gll.split(',').map(Number), g.dataset.nome || 'Coordenada informada'); }
  const l = e.target.closest('button[data-loc]');
  if (l){ const loc = DATA.localidades.find(x => x.nome === l.dataset.loc); $('#results').hidden = true; $('#q').value = loc.nome; map.flyTo(loc.ll, 15); return; }
  const m = e.target.closest('button[data-mun]');
  if (m){ const pts = DATA.trafos.filter(t => t.ibge === m.dataset.mun).map(t => t.ll); $('#results').hidden = true; $('#q').value = DATA.municipios[m.dataset.mun]; map.flyToBounds(pts, {padding:[40, 40]}); return; }
  const b = e.target.closest('button[data-id]'); if (!b) return;
  const t = DATA.trafos.find(x => x.id === b.dataset.id); $('#results').hidden = true; $('#q').value = t.id; map.flyTo(t.ll, 18.5); open(t); });

// endereço -> coordenada pelo OpenStreetMap (Nominatim), priorizando Goiás
async function geocode(txt){
  const box = $('#results');
  box.innerHTML = '<button disabled><span class="sub">Procurando endereço…</span></button>'; box.hidden = false;
  const q = /goi[aá]s|\bgo\b/i.test(txt) ? txt : `${txt}, Goiás`;
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q, format: 'jsonv2', countrycodes: 'br', limit: '6', 'accept-language': 'pt-BR', viewbox: '-53.3,-12.3,-45.9,-19.5'});
  try {
    const r = await fetch(url); const res = await r.json();
    box.innerHTML = res.length ? res.map(x => `<button data-gll="${x.lat},${x.lon}" data-nome="${esc(x.display_name)}"><span><b>${esc(x.name || x.display_name.split(',')[0])}</b><br><span class="sub">${esc(x.display_name.split(',').slice(1, 4).join(','))}</span></span><span class="sub">${esc(x.type)}</span></button>`).join('')
      : '<button disabled><span class="sub">Endereço não encontrado. Tente "rua, número, cidade" ou cole a coordenada (ex.: -17.52, -49.44).</span></button>';
  } catch (err) {
    box.innerHTML = '<button disabled><span class="sub">Sem conexão para buscar o endereço. Tente de novo ou use a coordenada.</span></button>';
  }
}

// ponto procurado: marca no mapa e abre o transformador mais próximo
const pino = L.circleMarker([0, 0], {renderer, radius:9, color:'#fff', weight:3, fillColor:'#2f6bff', fillOpacity:1, interactive:false});
function distM(a, b){ const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos((a[0] + b[0]) / 2 * k), y = (b[0] - a[0]) * k; return Math.hypot(x, y) * 6371000; }
function irPara(ll, nome){
  pino.setLatLng(ll).addTo(map).bindTooltip(nome.split(',').slice(0, 3).join(','), {permanent:false});
  let melhor = null, d = Infinity;
  DATA.trafos.forEach(t => { const dd = distM(ll, t.ll); if (dd < d){ d = dd; melhor = t; } });
  if (melhor && d < 3000){
    map.flyToBounds([ll, melhor.ll], {maxZoom:18, paddingTopLeft:[60, 120], paddingBottomRight:[innerWidth >= 760 ? 460 : 60, innerWidth >= 760 ? 60 : innerHeight * .5]});
    open(melhor); toast(`Transformador mais próximo: ${melhor.id}, a ${fmt(d, 0)} m.`); }
  else { map.flyTo(ll, 16); toast('Nenhum transformador carregado num raio de 3 km deste ponto.'); }
}
$('#b-gps').onclick = () => {
  if (!navigator.geolocation) return toast('Este navegador não informa a localização.');
  toast('Buscando sua localização…');
  navigator.geolocation.getCurrentPosition(p => irPara([p.coords.latitude, p.coords.longitude], 'Você está aqui'),
    () => toast('Não foi possível obter a localização. Libere o GPS para este site.'), {enableHighAccuracy:true, timeout:15000});
};

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
