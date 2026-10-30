/* Public Atlas locale selector. Shares cormyr-locale with the React player area. */
(function () {
  'use strict';
  const LANGUAGES = ['pt', 'en', 'es', 'de'];
  const LABELS = {pt:'Português (PT)',en:'English (EN)',es:'Español (ES)',de:'Deutsch (DE)'};
  const FLAGS = {
    pt:'<rect width="22" height="16" fill="#009b3a"/><polygon points="11,2 20,8 11,14 2,8" fill="#fedf00"/><circle cx="11" cy="8" r="3.5" fill="#002776"/>',
    en:'<rect width="22" height="16" fill="#012169"/><path d="M0,0 L22,16 M22,0 L0,16" stroke="#ffffff" stroke-width="2"/><path d="M0,0 L22,16 M22,0 L0,16" stroke="#C8102E" stroke-width="1"/><path d="M11,0 L11,16 M0,8 L22,8" stroke="#ffffff" stroke-width="3"/><path d="M11,0 L11,16 M0,8 L22,8" stroke="#C8102E" stroke-width="2"/>',
    es:'<rect width="22" height="4" fill="#AA151B"/><rect width="22" height="8" y="4" fill="#F1BF00"/><rect width="22" height="4" y="12" fill="#AA151B"/><circle cx="6" cy="8" r="2" fill="#AA151B" opacity=".8"/>',
    de:'<rect width="22" height="5.33" fill="#000"/><rect width="22" height="5.33" y="5.33" fill="#DD0000"/><rect width="22" height="5.34" y="10.66" fill="#FFCE00"/>'
  };
  // Translations are intentionally limited to interface copy. Lore, character names,
  // documents and campaign prose remain Portuguese unless curated translations exist.
  // Entries are ordered: English, Spanish, German.
  const UI = {
    'Pular para o conteúdo':['Skip to content','Saltar al contenido','Zum Inhalt springen'],
    'Entrar':['Sign in','Entrar','Anmelden'],
    'Área dos jogadores':['Player area','Área de jugadores','Spielerbereich'],
    'O Reino da Floresta':['The Forest Kingdom','El Reino del Bosque','Das Waldkönigreich'],
    'Arquivo da campanha':['Campaign archive','Archivo de campaña','Kampagnenarchiv'],
    'Crônicas do Reino':['Chronicles of the Realm','Crónicas del Reino','Chroniken des Reiches'],
    'ACERVO DA CAMPANHA':['CAMPAIGN ARCHIVE','ARCHIVO DE CAMPAÑA','KAMPAGNENARCHIV'],
    'Reino e regiões':['Kingdom and regions','Reino y regiones','Königreich und Regionen'],
    'Nobreza':['Nobility','Nobleza','Adel'],
    'Constituição de Cormyr':['Constitution of Cormyr','Constitución de Cormyr','Verfassung von Cormyr'],
    'Músicas':['Music','Música','Musik'],
    'Eventos':['Events','Eventos','Ereignisse'],
    'Aventuras':['Adventures','Aventuras','Abenteuer'],
    'SEGUNDA TEMPORADA':['SECOND SEASON','SEGUNDA TEMPORADA','ZWEITE SAISON'],
    'Site sobre o RPG de Forgotten Realms, feito por jogadores':['A Forgotten Realms RPG site made by players','Sitio de rol de Forgotten Realms creado por jugadores','Eine Forgotten-Realms-Rollenspielseite von Spielern'],
    'O REINO DO DRAGÃO PÚRPURA':['THE KINGDOM OF THE PURPLE DRAGON','EL REINO DEL DRAGÓN PÚRPURA','DAS KÖNIGREICH DES PURPURDRACHEN'],
    'Explore as casas nobres e seus laços de vassalagem.':['Explore noble houses and their bonds of vassalage.','Explora las casas nobles y sus vínculos de vasallaje.','Entdecke Adelshäuser und ihre Vasallenbindungen.'],
    'regiões':['regions','regiones','Regionen'],
    'casas':['houses','casas','Häuser'],
    'Explore uma região':['Explore a region','Explora una región','Eine Region erkunden'],
    'Escolha o território para consultar seu acervo.':['Choose a territory to browse its archive.','Elige un territorio para explorar su archivo.','Wähle ein Gebiet, um sein Archiv zu erkunden.'],
    'Região':['Region','Región','Region'],
    'Todas as casas':['All houses','Todas las casas','Alle Häuser'],
    'Visão Hierárquica':['Hierarchy view','Vista jerárquica','Hierarchieansicht'],
    'TRILHA DE CORMYR':['SOUNDTRACK OF CORMYR','BANDA SONORA DE CORMYR','SOUNDTRACK VON CORMYR'],
    'Música do reino':['Kingdom music','Música del reino','Musik des Königreichs'],
    'Música da região':['Regional music','Música de la región','Musik der Region'],
    'Músicas de região':['Regional music','Música regional','Regionale Musik'],
    'Músicas de casa':['House music','Música de casas','Hausmusik'],
    'Ouvir no YouTube ↗':['Listen on YouTube ↗','Escuchar en YouTube ↗','Auf YouTube anhören ↗'],
    'Ver playlist completa ↗':['View full playlist ↗','Ver lista completa ↗','Vollständige Playlist ansehen ↗'],
    'Mapa':['Map','Mapa','Karte'],
    'Baixar Mapa':['Download map','Descargar mapa','Karte herunterladen'],
    'Mapa ainda não disponível.':['Map not yet available.','Mapa todavía no disponible.','Karte noch nicht verfügbar.'],
    'Baixar casas da Região':['Download region houses','Descargar casas de la región','Häuser der Region herunterladen'],
    'Ler mais':['Read more','Leer más','Mehr lesen'],
    'Texto integral do acervo regional. Os registros históricos podem descrever períodos anteriores ao quadro de 1522.':['Full text of the regional archive. Historical records may describe periods before 1522.','Texto completo del archivo regional. Los registros históricos pueden describir períodos anteriores a 1522.','Volltext des Regionalarchivs. Historische Aufzeichnungen können frühere Zeiträume als 1522 beschreiben.'],
    'O que é Cormyr?':['What is Cormyr?','¿Qué es Cormyr?','Was ist Cormyr?'],
    'Buscar casa nesta região':['Search houses in this region','Buscar casas en esta región','Häuser in dieser Region suchen'],
    'Nome, cidade ou castelo…':['Name, city or castle…','Nombre, ciudad o castillo…','Name, Stadt oder Burg…'],
    'Limpar filtros':['Clear filters','Limpiar filtros','Filter zurücksetzen'],
    'Buscar':['Search','Buscar','Suchen'],
    'Nobreza de Cormyr':['Nobility of Cormyr','Nobleza de Cormyr','Adel von Cormyr'],
    'Todas as regiões':['All regions','Todas las regiones','Alle Regionen'],
    'Todas as músicas':['All music','Toda la música','Alle Musik'],
    'Casa de Jogador':['Player house','Casa de jugador','Spielerhaus'],
    'Lorde / Lady a confirmar':['Lord / Lady to be confirmed','Señor / Señora por confirmar','Lord / Lady noch zu bestätigen'],
    'Ler texto integral':['Read full text','Leer texto completo','Volltext lesen'],
    'Tentar novamente':['Try again','Intentar de nuevo','Erneut versuchen'],
    'Carregando história…':['Loading history…','Cargando historia…','Geschichte wird geladen…'],
    'Nenhuma música encontrada. Limpe os filtros para ver todas.':['No music found. Clear filters to see all.','No se encontró música. Borra los filtros para verla toda.','Keine Musik gefunden. Setze die Filter zurück.'],
    'CONSULTA RÁPIDA':['QUICK REFERENCE','CONSULTA RÁPIDA','SCHNELLÜBERSICHT'],
    'Nesta aventura':['In this adventure','En esta aventura','In diesem Abenteuer'],
    'QUADRO DE 1522':['SITUATION IN 1522','SITUACIÓN EN 1522','LAGE IM JAHR 1522'],
    'Quadro de 1522.':['Situation in 1522.','Situación en 1522.','Lage im Jahr 1522.'],
    'Antes de 1522.':['Before 1522.','Antes de 1522.','Vor 1522.'],
    'Baixar Imagem':['Download image','Descargar imagen','Bild herunterladen'],
    'Fontes e critérios de leitura':['Sources and reading criteria','Fuentes y criterios de lectura','Quellen und Lesekriterien'],
    'Voltar':['Back','Volver','Zurück'],
    'Próxima':['Next','Siguiente','Weiter'],
    'Anterior':['Previous','Anterior','Zurück']
  };
  const ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'alt'];
  const originals = new WeakMap();
  const originalAttributes = new WeakMap();
  const root = document.getElementById('public-language-switcher');
  if (!root) return;
  root.innerHTML = LANGUAGES.map(function (code) {
    return '<button type="button" class="public-language-button" data-locale="' + code +
      '" aria-label="' + LABELS[code] + '" title="' + LABELS[code] +
      '" aria-pressed="false"><svg width="22" height="16" viewBox="0 0 22 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      FLAGS[code] + '</svg></button>';
  }).join('');
  let locale = 'pt';
  try { const saved = localStorage.getItem('cormyr-locale'); if (LANGUAGES.includes(saved)) locale = saved; } catch (_) {}
  const textFor = function (original) {
    const translations = UI[original.trim()];
    if (!translations || locale === 'pt') return original;
    const replacement = translations[LANGUAGES.indexOf(locale)-1];
    return original.replace(original.trim(), replacement);
  };
  function translateText(node) {
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    const source = originals.get(node);
    if (!UI[source.trim()]) return;
    const translated = textFor(source);
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }
  function translateAttributes(el) {
    if (el.nodeType !== 1) return;
    let saved = originalAttributes.get(el);
    if (!saved) { saved = {}; originalAttributes.set(el, saved); }
    ATTRIBUTES.forEach(function (name) {
      if (!(name in saved) && el.hasAttribute(name)) saved[name] = el.getAttribute(name);
      if (name in saved && UI[saved[name].trim()]) {
        const translated = textFor(saved[name]);
        if (el.getAttribute(name) !== translated) el.setAttribute(name, translated);
      }
    });
  }
  function translateSubtree(rootNode) {
    if (rootNode.nodeType === 3) { translateText(rootNode); return; }
    if (rootNode.nodeType !== 1) return;
    if (rootNode.closest('.public-language-switcher') || rootNode.closest('script,style,noscript')) return;
    translateAttributes(rootNode);
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === 3) translateText(node);
      else if (!node.closest('.public-language-switcher')) translateAttributes(node);
    }
  }
  // Public narrative translations use the same curated Supabase translations
  // as the player area; missing entries always fall back to original Portuguese.
  let dictionary = {};
  let generation = 0;
  const originalsForRegion = new WeakMap();
  function translateRegionNarrative() {
    const regionName = document.getElementById('region-select')?.value;
    if (!regionName) return;
    const definitions = [
      ['.region-description', 'description'],
      ['.region-meta', 'subtitle'],
      ['.politics', 'politics']
    ];
    definitions.forEach(function (entry) {
      const element = document.querySelector('#region-content ' + entry[0]);
      if (!element) return;
      if (!originalsForRegion.has(element)) originalsForRegion.set(element, element.innerHTML);
      const key = 'region:' + regionName + ':' + entry[1];
      const text = dictionary[key];
      // Metadata contains emphasized house names, so only replace safe text-only fields.
      if (entry[1] !== 'description') return;
      const original = originalsForRegion.get(element);
      const next = locale !== 'pt' && typeof text === 'string' && text.trim()
        ? text : null;
      if (next === null) {
        if (element.innerHTML !== original) element.innerHTML = original;
      } else if (element.textContent !== next) {
        element.textContent = next;
      }
    });
  }
  async function loadNarrativeTranslations() {
    const request = ++generation;
    dictionary = {};
    if (locale === 'pt') { translateRegionNarrative(); return; }
    try {
      const response = await fetch('/api/public/translations?locale=' + encodeURIComponent(locale));
      if (!response.ok) return;
      const result = await response.json();
      if (request !== generation) return;
      dictionary = result.translations || {};
      translateRegionNarrative();
    } catch (_) {
      // Public archive remains usable when translations are temporarily unavailable.
    }
  }
  function applyLocale() {
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale;
    root.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.locale === locale));
    });
    translateSubtree(document.body);
    translateRegionNarrative();
    loadNarrativeTranslations();
  }
  root.addEventListener('click', function (event) {
    const button = event.target.closest('button[data-locale]');
    if (!button) return;
    locale = button.dataset.locale;
    try { localStorage.setItem('cormyr-locale', locale); } catch (_) {}
    applyLocale();
  });
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(translateSubtree);
      if (mutation.target.id === 'region-content' ||
          (mutation.target.nodeType === 1 && mutation.target.closest('#region-content'))) {
        translateRegionNarrative();
      }
    });
  });
  observer.observe(document.body, {childList:true,subtree:true});
  applyLocale();
})();