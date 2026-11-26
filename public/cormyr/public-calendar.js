/* Calendário público visual de Harptos (somente leitura, sem dados privados). */
(function () {
  'use strict';
  const root = document.getElementById('chronicle-calendar');
  if (!root) return;
  const byId = (id) => document.getElementById(id);

  const MONTHS = [
    { name: 'Hammer', title: 'O Fundo do Inverno', season: 'Inverno' },
    { name: 'Alturiak', title: 'A Garra do Inverno', season: 'Inverno' },
    { name: 'Ches', title: 'A Garra dos Sóis Poentes', season: 'Primavera' },
    { name: 'Tarsakh', title: 'A Garra das Tempestades', season: 'Primavera' },
    { name: 'Mirtul', title: 'O Derretimento', season: 'Primavera' },
    { name: 'Kythorn', title: 'O Tempo das Flores', season: 'Verão' },
    { name: 'Flamerule', title: 'O Tempo do Fogo', season: 'Verão' },
    { name: 'Eleasis', title: 'O Sol Alto', season: 'Verão' },
    { name: 'Eleint', title: 'O Desbotar', season: 'Outono' },
    { name: 'Marpenoth', title: 'Queda das Folhas', season: 'Outono' },
    { name: 'Uktar', title: 'O Apodrecimento', season: 'Outono' },
    { name: 'Nightal', title: 'A Descida', season: 'Inverno' }
  ];

  const FIXED = [
    {
      id: 'midwinter', month: 0, name: 'Meio do Inverno',
      description: 'Em Cormyr: renovação de alianças entre famílias nobres, anúncios da Coroa e dos Dragões Púrpuras, e planejamento político e militar do ano.'
    },
    {
      id: 'greengrass', month: 3, name: 'Relva Verde',
      description: 'Dia de bênção das colheitas pelos sacerdotes de Chauntea, música e banquetes ao ar livre da nobreza e da plebe.'
    },
    {
      id: 'midsummer', month: 6, name: 'Meio do Verão',
      description: 'Dia de festas, torneios e tratados abertos no auge do verão.'
    },
    {
      id: 'shieldmeet', month: 6, name: 'Encontro dos Escudos', leapOnly: true,
      description: 'Dia bissexto de tratados abertos, renovação de pactos, torneios reais e petições públicas ao Rei; marcado em Cormyr pela memória sombria do massacre dos Magos de Guerra na Fortaleza Real em 1396 CV.'
    },
    {
      id: 'highharvestide', month: 8, name: 'Grande Colheita',
      description: 'Festa da colheita, cobrança de impostos em alimentos pelas casas nobres, partida de caravanas e assinatura de tratados antes do inverno.'
    },
    {
      id: 'feast-moon', month: 10, name: 'Festa da Lua',
      description: 'Festival solene de tributo aos ancestrais, heróis caídos e reis passados; procissões com tochas e cerimônia da família real no mausoléu de Suzail.'
    }
  ];

  const WAUKEEN = [
    [15, 'Conforto da Contagem Fria', 'Balanço de inverno de guildas e tesoureiros nobres; juros reduzidos em Suzail.'],
    [20, 'Grande Tecelagem', 'Feira têxtil de tecelões, alfaiates, sedas de Marsember e lãs das Stonelands.'],
    [30, 'Moeda Alta', 'Reabertura oficial das grandes rotas de caravanas após o degelo e assinatura de contratos comerciais.'],
    [10, 'Esferas', 'Festival de joalheiros, ourives e artesãos de luxo em Suzail; encomendas de joias e armas ornamentadas pela nobreza.'],
    [12, 'Sammardach', 'Grande feira popular de rua, leilões de mercadorias exóticas e jogos de azar onde nobres jogam pequenas moedas ao povo.'],
    [21, 'Brightbuckle', 'Feira de armeiros, ferreiros, seleiros e equipamentos para caravanas e exércitos em Arabel e fortalezas reais.'],
    [3, 'Sornyn', 'Ápice do comércio marítimo no Lago dos Dragões (Suzail e Marsember), chegada de frotas mercantes e leilões de especiarias (3 a 5 de Flamerule).'],
    [17, 'Huldark', 'Celebração conjunta de Waukeen e Chauntea com feiras de grãos, frutas, cervejas e vinhos.'],
    [7, 'Spryndalstar', 'Semana de feiras móveis, procissões com moedas douradas e redução temporária de tarifas em Suzail, Marsember e Arabel.'],
    [1, 'Marthoon', 'Fechamento de grandes contratos anuais, quitação de dívidas e renegociação de empréstimos entre casas nobres e guildas.'],
    [10, 'Tehennteahan · Noite de Martelos e Pregos', 'Dia de doações a orfanatos, veteranos de guerra e obras públicas para afastar a má sorte no comércio do ano seguinte.'],
    [25, 'Orbar', 'Auditoria anual de cofres reais, guildas e casas nobres antes do fim do ano, seguida pelo Banquete das Balanças Douradas.']
  ];

  const TYR = [
    [1, 'Ver a Justiça', 'Abertura formal de sessões de julgamento nos tribunais reais de Suzail, leitura de leis reais e petições de camponeses e mercadores.'],
    [13, 'Mutilamento', 'Rito mensal de Tyr: cerimônias militares da Ordem do Dragão Púrpura, juramentos de soldados e cavaleiros e execução de sentenças importantes.'],
    [22, 'O Vínculo', 'Rito mensal de Tyr: julgamentos de traição, corrupção e crimes contra a Coroa, penitências públicas e concessão do Perdão da Mão Cortada.']
  ];

  const SEASONS = [
    [2, 19, 'Equinócio da primavera', 'Início astronômico da primavera em Faerûn.'],
    [5, 20, 'Solstício de verão', 'Dia mais longo do ano em Harptos.'],
    [8, 21, 'Equinócio do outono', 'Início astronômico do outono em Faerûn.'],
    [11, 20, 'Solstício de inverno', 'Noite mais longa do ano em Harptos.']
  ];

  const state = {
    tab: 'calendar',
    year: 1522,
    month: 9,
    selectedKey: null, // null = mostrar todos os eventos do mês
    region: 'all',
    search: '',
    era: 'all',
    timelineSearch: '',
    official: null,
    timeline: [],
    published: [],
    error: '',
    loadingTimeline: true
  };

  const controls = {
    year: byId('chronicle-year'),
    month: byId('chronicle-month'),
    region: byId('chronicle-region'),
    search: byId('chronicle-search'),
    mode: byId('chronicle-mode'),
    tenday: byId('chronicle-tenday'),
    day: byId('chronicle-day'),
    timelineSearch: byId('chronicle-timeline-search')
  };

  MONTHS.forEach((m, i) => {
    controls.month.add(new Option(m.name, String(i)));
  });
  for (let i = 1; i <= 30; i++) controls.day.add(new Option(String(i), String(i)));

  const normalize = (value) =>
    String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const yearValue = (v) => Number.isSafeInteger(v) && v >= 1 && v <= 9999;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (year, month, day) => String(year).padStart(4, '0') + '-' + pad(month + 1) + '-' + pad(day);
  const festivalKey = (year, id) => String(year).padStart(4, '0') + '-F-' + id;

  const regionLabel = (x) =>
    x.scope === 'kingdom' ? 'Reino inteiro' : x.region === '1' ? 'Costa do Dragão' : 'Horselands';

  const regionMatches = (x) =>
    state.region === 'all' || x.scope === 'kingdom' || x.region === state.region;

  function knownObservances(year) {
    const result = [];
    const add = (month, day, title, description, id, type, festival) =>
      result.push({
        id, year, month, day, festival: festival || null,
        date: festival ? festivalKey(year, festival) : iso(year, month, day),
        title, description: description || '', scope: 'kingdom', region: null, type
      });

    FIXED.forEach((f) => {
      if (!f.leapOnly || year % 4 === 0) {
        add(f.month, 31, f.name, f.description, f.id, 'festival', f.id);
      }
    });
    for (let m = 0; m < 12; m++) {
      TYR.forEach(([d, n, desc]) => add(m, d, 'Tyr · ' + n, desc, 'tyr-' + m + '-' + d, 'tyr'));
      const [wDay, wTitle, wDesc] = WAUKEEN[m];
      for (let d = wDay; d <= (m === 6 ? 5 : wDay); d++) {
        add(m, d, 'Waukeen · ' + wTitle, wDesc, 'waukeen-' + m + '-' + d, 'festival');
      }
    }
    SEASONS.forEach(([m, d, n, desc]) => add(m, d, n, desc, 'season-' + m, 'season'));
    return result;
  }

  function parsePublished(event, year) {
    if (!event || typeof event.title !== 'string' || typeof event.date !== 'string' || event.title.length > 200) return null;
    const m = /^(\d{4})-(?:(\d{2})-(\d{2})|F-([a-z-]+))$/.exec(event.date);
    if (!m || Number(m[1]) !== year) return null;
    let month = Number(m[2]) - 1, day = Number(m[3]), festival = null;
    if (m[4]) {
      const f = FIXED.find((x) => x.id === m[4]);
      if (!f || (f.leapOnly && year % 4 !== 0)) return null;
      month = f.month; day = 31; festival = f.id;
    } else if (month < 0 || month > 11 || day < 1 || day > 30) {
      return null;
    }
    if (event.scope !== 'kingdom' && event.scope !== 'region') return null;
    if (event.scope === 'region' && !['1', '2'].includes(event.region)) return null;
    return {
      id: String(event.id || event.date), year, month, day, festival, date: event.date,
      title: event.title, description: typeof event.description === 'string' ? event.description : '',
      scope: event.scope, region: event.scope === 'region' ? event.region : null,
      type: event.title.indexOf('Festival · ') === 0 ? 'festival' : 'published'
    };
  }

  function allYearEvents() {
    const known = knownObservances(state.year);
    const seen = new Set(known.map((x) => x.date + '|' + normalize(x.title)));
    const cloud = state.published
      .map((x) => parsePublished(x, state.year))
      .filter(Boolean)
      .filter((x) => {
        const k = x.date + '|' + normalize(x.title);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return [...known, ...cloud];
  }

  function makeCard(title, description, meta, type, collapsible) {
    const article = document.createElement('article');
    article.className = 'chronicle-card';
    article.dataset.type = type;
    const metaEl = document.createElement('div');
    metaEl.className = 'chronicle-meta';
    metaEl.textContent = meta;
    article.append(metaEl);
    const head = document.createElement('h3');
    head.textContent = title;
    article.append(head);
    if (description) {
      if (collapsible && description.length > 210) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Ler relato completo';
        const p = document.createElement('p');
        p.textContent = description;
        details.append(summary, p);
        article.append(details);
      } else {
        const p = document.createElement('p');
        p.textContent = description;
        article.append(p);
      }
    }
    return article;
  }

  const makeEmpty = (text) => {
    const p = document.createElement('p');
    p.className = 'chronicle-empty';
    p.textContent = text;
    return p;
  };

  function formatKeyLabel(key) {
    const m = /^(\d{4})-(?:(\d{2})-(\d{2})|F-([a-z-]+))$/.exec(key || '');
    if (!m) return MONTHS[state.month].name + ' · ' + state.year + ' CV';
    if (m[4]) {
      const f = FIXED.find((x) => x.id === m[4]);
      return (f ? f.name : m[4]) + ' · ' + Number(m[1]) + ' CV';
    }
    return Number(m[3]) + ' de ' + MONTHS[Number(m[2]) - 1].name + ' de ' + Number(m[1]) + ' CV';
  }

  function setTab(nextTab) {
    state.tab = nextTab;
    const isCal = nextTab === 'calendar';
    byId('tab-calendar').setAttribute('aria-selected', String(isCal));
    byId('tab-chronicles').setAttribute('aria-selected', String(!isCal));
    byId('panel-calendar').hidden = !isCal;
    byId('panel-chronicles').hidden = isCal;
    if (!isCal) renderChroniclesTab();
  }

  function renderGrid(monthEvents) {
    const board = byId('chronicle-harptos-grid');
    board.replaceChildren();
    const byDate = new Map();
    monthEvents.forEach((ev) => {
      const arr = byDate.get(ev.date) || [];
      arr.push(ev);
      byDate.set(ev.date, arr);
    });

    const todayKey = state.official
      ? (state.official.festival
        ? festivalKey(state.official.year, state.official.festival)
        : iso(state.official.year, state.official.month, state.official.day))
      : null;

    function createCell(key, label, isFestival) {
      const items = byDate.get(key) || [];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'harptos-cell' +
        (isFestival ? ' is-festival' : '') +
        (key === todayKey ? ' is-today' : '') +
        (key === state.selectedKey ? ' is-selected' : '');
      btn.setAttribute('aria-pressed', String(key === state.selectedKey));
      if (key === todayKey) btn.setAttribute('aria-current', 'date');
      btn.setAttribute('aria-label', formatKeyLabel(key) + (items.length ? ' — ' + items.length + ' evento(s)' : ''));

      const num = document.createElement('span');
      num.className = 'harptos-cell-num';
      num.textContent = isFestival ? '✦ ' + label : label;
      btn.append(num);

      const dots = document.createElement('span');
      dots.className = 'harptos-dots';
      dots.setAttribute('aria-hidden', 'true');
      const types = new Set(items.map((x) => x.type));
      ['festival', 'published', 'tyr', 'season'].forEach((t) => {
        if (types.has(t)) {
          const i = document.createElement('i');
          i.className = 'dot dot-' + t;
          dots.append(i);
        }
      });
      btn.append(dots);

      btn.addEventListener('click', () => {
        state.selectedKey = state.selectedKey === key ? null : key;
        renderCalendarTab();
      });
      return btn;
    }

    for (let t = 0; t < 3; t++) {
      const wrap = document.createElement('div');
      wrap.className = 'harptos-tenday';
      const title = document.createElement('p');
      title.className = 'harptos-tenday-label';
      title.textContent = (t + 1) + 'ª désdia · dias ' + (t * 10 + 1) + '–' + (t * 10 + 10);
      const grid = document.createElement('div');
      grid.className = 'harptos-days';
      for (let i = 1; i <= 10; i++) {
        const day = t * 10 + i;
        grid.append(createCell(iso(state.year, state.month, day), String(day), false));
      }
      wrap.append(title, grid);
      board.append(wrap);
    }

    const monthFestivals = FIXED.filter(
      (f) => f.month === state.month && (!f.leapOnly || state.year % 4 === 0)
    );
    if (monthFestivals.length) {
      const wrap = document.createElement('div');
      wrap.className = 'harptos-tenday';
      const title = document.createElement('p');
      title.className = 'harptos-tenday-label';
      title.textContent = 'Dia festivo intercalar';
      const grid = document.createElement('div');
      grid.className = 'harptos-days';
      monthFestivals.forEach((f) => {
        grid.append(createCell(festivalKey(state.year, f.id), f.name, true));
      });
      wrap.append(title, grid);
      board.append(wrap);
    }
  }

  function renderCalendarTab() {
    controls.year.value = String(state.year);
    controls.month.value = String(state.month);
    controls.region.value = state.region;
    controls.search.value = state.search;
    byId('chronicle-prev-year').disabled = state.year <= 1;
    byId('chronicle-next-year').disabled = state.year >= 9999;
    byId('chronicle-previous').disabled = state.year <= 1 && state.month === 0;
    byId('chronicle-next').disabled = state.year >= 9999 && state.month === 11;

    const mInfo = MONTHS[state.month];
    byId('chronicle-season-label').textContent = mInfo.season + ' · ' + mInfo.title;
    byId('chronicle-month-heading').textContent = mInfo.name + ' · ' + state.year + ' CV';
    byId('chronicle-period').textContent = mInfo.name + ' · ' + state.year + ' CV';

    const officialEl = byId('chronicle-official');
    const todayBtn = byId('chronicle-current');
    if (state.official) {
      const offLabel = state.official.festival
        ? (FIXED.find((f) => f.id === state.official.festival)?.name || state.official.festival) + ' · ' + state.official.year + ' CV'
        : state.official.day + ' de ' + MONTHS[state.official.month].name + ' de ' + state.official.year + ' CV';
      officialEl.textContent = 'Hoje em Cormyr: ' + offLabel;
      const isAtToday = state.year === state.official.year && state.month === state.official.month;
      todayBtn.hidden = isAtToday && !state.selectedKey;
    } else {
      officialEl.textContent = 'Calendário de Harptos';
      todayBtn.hidden = true;
    }

    const query = normalize(state.search.trim());
    const allMonthEvents = allYearEvents()
      .filter((x) => x.month === state.month && regionMatches(x))
      .filter((x) => !query || normalize([x.title, x.description, regionLabel(x)].join(' ')).includes(query))
      .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, 'pt-BR'));

    byId('chronicle-month-count').textContent = allMonthEvents.length + ' evento(s) no mês';
    renderGrid(allMonthEvents);

    const visible = state.selectedKey
      ? allMonthEvents.filter((x) => x.date === state.selectedKey)
      : allMonthEvents;

    byId('chronicle-detail-eyebrow').textContent = state.selectedKey ? 'DIA SELECIONADO' : 'FESTAS E EVENTOS DO MÊS';
    byId('chronicle-dated-heading').textContent = state.selectedKey
      ? formatKeyLabel(state.selectedKey)
      : mInfo.name + ' de ' + state.year + ' CV';
    byId('chronicle-dated-count').textContent = visible.length + ' evento(s)';
    byId('chronicle-show-month').hidden = !state.selectedKey;

    const listEl = byId('chronicle-dated-events');
    listEl.replaceChildren();
    if (!visible.length) {
      listEl.append(makeEmpty(
        state.selectedKey
          ? 'Nenhum evento público registrado neste dia.'
          : 'Nenhum evento encontrado para este filtro.'
      ));
    } else {
      visible.forEach((ev) => {
        const meta = (ev.festival ? 'Dia festivo · ' : ev.day + ' de ' + mInfo.name + ' · ') + regionLabel(ev);
        listEl.append(makeCard(ev.title, ev.description, meta, ev.type, false));
      });
    }

    const noteEl = byId('chronicle-cloud-note');
    noteEl.hidden = !state.error;
    noteEl.textContent = state.error;

    // Mostra crônicas históricas inline somente quando o ano navegado possuir registros (1350–1520 CV)
    const yearChron = state.timeline.filter((x) => x.year <= state.year && (x.yearEnd || x.year) >= state.year);
    const inlineWrap = byId('chronicle-year-banner');
    const inlineList = byId('chronicle-year-inline-list');
    inlineWrap.hidden = yearChron.length === 0;
    if (yearChron.length > 0) {
      byId('chronicle-year-inline-heading').textContent = 'Crônicas históricas de ' + state.year + ' CV';
      inlineList.replaceChildren();
      yearChron.forEach((x) => {
        const meta = (x.yearEnd ? x.year + '–' + x.yearEnd : x.year) + ' CV · Crônica do Reino';
        inlineList.append(makeCard(x.title, x.description, meta, 'annual', true));
      });
    }
  }

  function renderChroniclesTab() {
    const box = byId('chronicle-year-events');
    box.replaceChildren();
    const query = normalize(state.timelineSearch.trim());
    const items = state.timeline.filter((x) => {
      if (state.era === '1350-1399' && x.year > 1399) return false;
      if (state.era === '1400-1459' && (x.year < 1400 || x.year > 1459)) return false;
      if (state.era === '1460-1520' && x.year < 1460) return false;
      if (query && !normalize([x.year, x.yearEnd || '', x.title, x.description].join(' ')).includes(query)) return false;
      return true;
    });
    byId('chronicle-year-count').textContent = items.length + ' crônica(s)';
    if (state.loadingTimeline) {
      box.append(makeEmpty('Carregando as crônicas históricas…'));
    } else if (!items.length) {
      box.append(makeEmpty('Nenhuma crônica encontrada para essa busca.'));
    } else {
      items.forEach((x) => {
        const meta = (x.yearEnd ? x.year + '–' + x.yearEnd : x.year) + ' CV · História de Cormyr';
        box.append(makeCard(x.title, x.description, meta, 'annual', true));
      });
    }
  }

  let loadIndex = 0;
  async function loadPublished(year) {
    const index = ++loadIndex;
    try {
      const res = await fetch('/api/public/calendar-events?year=' + year, { credentials: 'omit' });
      if (!res.ok) throw new Error('unavailable');
      const json = await res.json();
      if (!json || !Array.isArray(json.events)) throw new Error('invalid');
      if (index !== loadIndex || year !== state.year) return;
      state.published = json.events;
      state.error = '';
      renderCalendarTab();
    } catch {
      if (index !== loadIndex || year !== state.year) return;
      state.published = [];
      state.error = '';
      renderCalendarTab();
    }
  }

  function goYear(y) {
    if (!yearValue(y)) return;
    const changedYear = y !== state.year;
    state.year = y;
    state.selectedKey = null;
    renderCalendarTab();
    if (changedYear) void loadPublished(y);
  }

  function shiftMonth(delta) {
    const n = state.year * 12 + state.month + delta;
    if (n < 12 || n > 9999 * 12 + 11) return;
    const nextYear = Math.floor(n / 12);
    state.month = n % 12;
    state.selectedKey = null;
    if (nextYear !== state.year) {
      state.year = nextYear;
      renderCalendarTab();
      void loadPublished(nextYear);
    } else {
      renderCalendarTab();
    }
  }

  // Eventos de interface
  byId('tab-calendar').addEventListener('click', () => setTab('calendar'));
  byId('tab-chronicles').addEventListener('click', () => setTab('chronicles'));
  byId('chronicle-open-timeline').addEventListener('click', () => setTab('chronicles'));
  byId('chronicle-show-month').addEventListener('click', () => {
    state.selectedKey = null;
    renderCalendarTab();
  });
  byId('chronicle-previous').addEventListener('click', () => shiftMonth(-1));
  byId('chronicle-next').addEventListener('click', () => shiftMonth(1));
  byId('chronicle-prev-year').addEventListener('click', () => goYear(state.year - 1));
  byId('chronicle-next-year').addEventListener('click', () => goYear(state.year + 1));
  byId('chronicle-current').addEventListener('click', () => {
    if (!state.official) return;
    const changedYear = state.official.year !== state.year;
    state.year = state.official.year;
    state.month = state.official.month;
    state.selectedKey = state.official.festival
      ? festivalKey(state.official.year, state.official.festival)
      : iso(state.official.year, state.official.month, state.official.day);
    renderCalendarTab();
    if (changedYear) void loadPublished(state.year);
  });
  controls.month.addEventListener('change', () => {
    state.month = Number(controls.month.value);
    state.selectedKey = null;
    renderCalendarTab();
  });
  controls.year.addEventListener('change', () => goYear(Number(controls.year.value)));
  controls.region.addEventListener('change', () => {
    state.region = controls.region.value;
    renderCalendarTab();
  });
  controls.search.addEventListener('input', () => {
    state.search = controls.search.value;
    if (state.search.trim()) state.selectedKey = null;
    renderCalendarTab();
  });
  controls.timelineSearch.addEventListener('input', () => {
    state.timelineSearch = controls.timelineSearch.value;
    renderChroniclesTab();
  });
  document.querySelectorAll('.era-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.era = btn.dataset.era || 'all';
      document.querySelectorAll('.era-pill').forEach((other) => {
        const active = other === btn;
        other.classList.toggle('active', active);
        other.setAttribute('aria-pressed', String(active));
      });
      renderChroniclesTab();
    });
  });

  async function initialise() {
    renderCalendarTab();
    await Promise.allSettled([
      fetch('/cormyr/chronicle-timeline.json', { credentials: 'omit' })
        .then((r) => { if (!r.ok) throw Error('timeline unavailable'); return r.json(); })
        .then((data) => {
          if (!data || !Array.isArray(data.events)) throw Error('timeline invalid');
          state.timeline = data.events.filter(
            (e) => yearValue(e.year) && yearValue(e.yearEnd || e.year) &&
              (e.yearEnd === undefined || e.yearEnd >= e.year) &&
              e.scope === 'kingdom' && typeof e.title === 'string' && typeof e.description === 'string'
          );
          const badge = byId('chronicles-badge');
          if (badge) badge.textContent = String(state.timeline.length);
        })
        .catch(() => {}),
      fetch('/api/public/time', { credentials: 'omit' })
        .then((r) => { if (!r.ok) throw Error('clock unavailable'); return r.json(); })
        .then((clock) => {
          if (yearValue(clock.year) && Number.isInteger(clock.month) && clock.month >= 0 && clock.month < 12 &&
            Number.isInteger(clock.day) && clock.day >= 1 && clock.day <= 30) {
            state.official = { year: clock.year, month: clock.month, day: clock.day, festival: clock.festival || null };
            state.year = clock.year;
            state.month = clock.month;
            state.selectedKey = clock.festival
              ? festivalKey(clock.year, clock.festival)
              : iso(clock.year, clock.month, clock.day);
          }
        })
        .catch(() => {})
    ]);
    state.loadingTimeline = false;
    renderCalendarTab();
    if (state.tab === 'chronicles') renderChroniclesTab();
    void loadPublished(state.year);
  }

  void initialise();
})();
