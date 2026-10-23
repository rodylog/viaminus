// ---------- Fond de carte : MapLibre GL + Geoplateforme IGN ----------
// Fond par defaut : style vectoriel « Plan IGN attenue » (tuiles, glyphes et sprites
// sur data.geopf.fr, deja dans la CSP). Mode sombre : le MEME style, couleurs
// transformees en HSL cote client — aucun second style a telecharger, aucun hote
// nouveau. Orthophoto IGN en option (raster WMTS). OpenStreetMap seulement en secours
// sur vraie panne IGN (style injoignable puis tuiles raster IGN en erreur), en
// http(s) uniquement : en file://, OSM sert « Access blocked ».
const URL_STYLE_IGN = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/attenue.json';
const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&STYLE=normal'+
             '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const TUILES_ORTHO = WMTS + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg';
const TUILES_PLAN  = WMTS + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png';
const TUILES_OSM   = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB_IGN = '© IGN — Géoplateforme';
const ATTRIB_OSM = '© les contributeurs OpenStreetMap';

function webglDispo(){
  try{
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  }catch(e){ return false; }
}

// ---- Couleurs : analyse hex / rgb() / hsl(), transformation « sombre » ----
function lireCouleur(s){
  if(typeof s !== 'string') return null;
  const t = s.trim();
  let m;
  if((m = t.match(/^#([0-9a-f]{3,8})$/i))){
    let h = m[1];
    if(h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if(h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h, 16);
    const a = h.length === 8 ? (n & 255) / 255 : 1, v = h.length === 8 ? n >>> 8 : n;
    return rgbVersHsl((v >> 16) & 255, (v >> 8) & 255, v & 255, a);
  }
  if((m = t.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)))
    return rgbVersHsl(+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]);
  if((m = t.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i)))
    return {h: +m[1], s: +m[2] / 100, l: +m[3] / 100, a: m[4] == null ? 1 : +m[4]};
  return null;
}
function rgbVersHsl(r, g, b, a){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if(max !== min){
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if(max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if(max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return {h, s, l, a};
}
// Clair -> sombre : les tons clairs (fonds, routes, eau) deviennent sombres en gardant
// leur ordre (le blanc des routes reste un peu plus clair que le fond), les tons
// fonces (texte, traits) deviennent clairs ; saturation reduite pour le confort.
function teinteSombre(c){
  const l = c.l >= 0.5 ? 0.06 + (c.l - 0.5) * 0.46 : 1 - c.l * 0.6;
  const s = c.s * 0.5;
  return `hsla(${Math.round(c.h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${+c.a.toFixed(3)})`;
}
function assombrirValeur(v){
  if(typeof v === 'string'){ const c = lireCouleur(v); return c ? teinteSombre(c) : v; }
  if(Array.isArray(v)) return v.map(assombrirValeur);          // expressions
  if(v && typeof v === 'object' && Array.isArray(v.stops))      // fonctions historiques
    return Object.assign({}, v, {stops: v.stops.map(([z, c]) => [z, assombrirValeur(c)])});
  return v;
}
function assombrirStyle(style){
  const s = JSON.parse(JSON.stringify(style));
  (s.layers || []).forEach(l => {
    for(const bloc of ['paint', 'layout']){
      if(!l[bloc]) continue;
      for(const k of Object.keys(l[bloc]))
        if(/-color$/.test(k)) l[bloc][k] = assombrirValeur(l[bloc][k]);
    }
  });
  return s;
}
// Les URL relatives du style (sprite, glyphes, tuiles) sont resolues sur l'URL du
// style, puisque l'objet est passe a MapLibre sans son adresse d'origine.
function absolu(u, base){ return typeof u === 'string' && !/^https?:/.test(u) ? new URL(u, base).href : u; }
function normaliserStyle(style, base){
  const s = Object.assign({}, style);
  if(s.sprite) s.sprite = Array.isArray(s.sprite)
    ? s.sprite.map(x => Object.assign({}, x, {url: absolu(x.url, base)})) : absolu(s.sprite, base);
  if(s.glyphs) s.glyphs = absolu(s.glyphs, base);
  s.sources = Object.fromEntries(Object.entries(s.sources || {}).map(([k, src]) => {
    const o = Object.assign({}, src);
    if(o.url) o.url = absolu(o.url, base);
    if(Array.isArray(o.tiles)) o.tiles = o.tiles.map(t => absolu(t, base));
    return [k, o];
  }));
  return s;
}

// ---- Styles de repli (raster) : Plan IGN WMTS, puis OpenStreetMap ----
function styleRaster(id, tuiles, attribution, sombre){
  return {version: 8,
    sources: {[id]: {type: 'raster', tiles: [tuiles], tileSize: 256, maxzoom: 19, attribution}},
    layers: [{id: 'fond', type: 'background', paint: {'background-color': sombre ? '#0f1115' : '#f6f7f9'}},
             {id, type: 'raster', source: id,
              paint: sombre ? {'raster-brightness-max': 0.7, 'raster-saturation': -0.4} : {}}]};
}
const styleVide = sombre => ({version: 8, sources: {}, layers: [
  {id: 'fond', type: 'background', paint: {'background-color': sombre ? '#0f1115' : '#eef0f3'}}]});

// ---- La carte ----
// creerCarte({centre:[lat,lon], zoom, sombre, fond}) -> objet carte ou null sans WebGL.
// L'objet expose : map (MapLibre), fond(nom), sombre(bool), couche(id, source, layer),
// donnees(id, geojson), aller([lat,lon], zoom, explicite), cadrer(bbox, padding, explicite).
function creerCarte(opts){
  if(!webglDispo() || typeof maplibregl === 'undefined') return null;
  let sombre = !!opts.sombre, fond = opts.fond === 'ortho' ? 'ortho' : 'plan';
  let base = null;            // style IGN vectoriel (clair) une fois charge
  let secours = null;         // 'plan-raster' | 'osm' quand l'IGN vectoriel manque
  let erreursTuiles = 0, tuilesOk = 0;
  const couches = new Map();  // id -> {source, layer} (trace du trajet…), remis apres chaque setStyle
  const map = new maplibregl.Map({
    container: 'map', style: styleVide(sombre),
    center: [opts.centre[1], opts.centre[0]], zoom: opts.zoom, minZoom: 3, maxZoom: 19,
    attributionControl: false, fadeDuration: CALME ? 0 : 300,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    locale: {'AttributionControl.ToggleAttribution': 'Afficher les sources',
             'NavigationControl.ZoomIn': 'Zoomer', 'NavigationControl.ZoomOut': 'Dézoomer',
             'Map.Title': 'Carte'},
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({showCompass: false}), 'top-right');

  function styleCourant(){
    if(secours === 'osm') return styleRaster('osm', TUILES_OSM, ATTRIB_OSM, sombre);
    if(secours === 'plan-raster' || !base) return styleRaster('ign', TUILES_PLAN, 'Plan IGN ' + ATTRIB_IGN, sombre);
    return sombre ? assombrirStyle(base) : base;
  }
  function appliquerStyle(){
    const s = styleCourant();
    if(!base && !secours){ map.setStyle(styleVide(sombre)); return; }
    map.setStyle(s);
  }
  // Apres chaque chargement de style : orthophoto (sous les toponymes du plan) et
  // couches de l'application (trace du trajet), toujours au-dessus.
  function reposer(){
    if(!map.getSource('fh-ortho'))
      map.addSource('fh-ortho', {type: 'raster', tiles: [TUILES_ORTHO], tileSize: 256, maxzoom: 19,
                                 attribution: 'Orthophotos ' + ATTRIB_IGN});
    if(!map.getLayer('fh-ortho')){
      const avant = (map.getStyle().layers || []).find(l => l.type === 'symbol');
      map.addLayer({id: 'fh-ortho', type: 'raster', source: 'fh-ortho',
                    layout: {visibility: fond === 'ortho' ? 'visible' : 'none'}}, avant && avant.id);
    }
    for(const [id, c] of couches){
      if(!map.getSource(id)) map.addSource(id, c.source);
      if(!map.getLayer(id)) map.addLayer(Object.assign({id, source: id}, c.layer));
    }
  }
  map.on('style.load', reposer);
  // Panne IGN : 6 tuiles en erreur sans aucune tuile chargee -> raster IGN, puis OSM.
  map.on('data', e => { if(e.dataType === 'source' && e.tile) tuilesOk++; });
  map.on('error', e => {
    if(!e || !e.tile) return;             // erreurs de tuiles seulement
    erreursTuiles++;
    if(tuilesOk > 0 || erreursTuiles < 6) return;
    if(secours === 'osm') return;
    if(secours === 'plan-raster'){
      if(!/^https?:$/.test(location.protocol)) return;
      secours = 'osm';
    }else secours = 'plan-raster';
    erreursTuiles = 0;
    appliquerStyle();
  });
  // Style IGN vectoriel : charge a part (pour pouvoir le transformer en sombre),
  // puis applique ; injoignable -> Plan IGN raster (meme hote, autre service).
  fetch(URL_STYLE_IGN).then(r => { if(!r.ok) throw new Error('style ' + r.status); return r.json(); })
    .then(j => { base = normaliserStyle(j, URL_STYLE_IGN); appliquerStyle(); })
    .catch(() => { secours = 'plan-raster'; appliquerStyle(); });

  const carte = {
    map,
    // Diagnostic (console, recette) : quel fond est servi et pourquoi.
    etat(){ return {secours, base: !!base, sombre, fond, erreursTuiles, tuilesOk}; },
    fond(nom){
      fond = nom === 'ortho' ? 'ortho' : 'plan';
      if(map.getLayer('fh-ortho')) map.setLayoutProperty('fh-ortho', 'visibility', fond === 'ortho' ? 'visible' : 'none');
      return fond;
    },
    sombre(v){
      if(!!v === sombre) return;
      sombre = !!v;
      appliquerStyle();
    },
    // Couche de l'application (source GeoJSON + couche), survit aux changements de style.
    couche(id, source, layer){
      couches.set(id, {source, layer});
      if(map.isStyleLoaded()) reposer();
    },
    donnees(id, geojson){
      const c = couches.get(id);
      if(c) c.source.data = geojson;
      const src = map.getSource(id);
      if(src) src.setData(geojson);
    },
    // Camera : jamais d'animation sans geste explicite de l'utilisateur, jamais avec
    // le mouvement reduit.
    aller(centre, zoom, explicite, decalage){
      const o = {center: [centre[1], centre[0]], zoom, offset: decalage || [0, 0]};
      if(explicite && !CALME) map.easeTo(Object.assign(o, {duration: 400})); else map.jumpTo(o);
    },
    cadrer(bbox, padding, explicite){
      map.fitBounds([[bbox.w, bbox.s], [bbox.e, bbox.n]],
                    {padding, animate: !!explicite && !CALME, duration: 400, maxZoom: 15});
    },
    marqueur(lat, lon, el, anchor){
      return new maplibregl.Marker({element: el, anchor: anchor || 'center'}).setLngLat([lon, lat]).addTo(map);
    },
  };
  return carte;
}
