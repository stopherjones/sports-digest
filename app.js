(function () {
  // ── Application State ──────────────────────────────────────────────────────
  let digestData = null;
  let currentSearch = '';
  let currentSport = 'all';

  // ── Core Engine Init ───────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    loadDigestDataset();
  });

  // ── Asynchronous Data Loading ──────────────────────────────────────────────
  async function loadDigestDataset() {
    const dateEl = document.getElementById('generated-at');
    try {
      const response = await fetch('./data/digest.json');
      if (!response.ok) throw new Error(`HTTP error status code: ${response.status}`);
      
      digestData = await response.json();
      
      if (dateEl) {
        dateEl.innerText = `Updated: ${formatDate(digestData.generated_at)}`;
      }

      populateSportFilter();
      initEventListeners();
      renderDigest();
    } catch (error) {
      console.error('Failed to load sports digest:', error);
      if (dateEl) dateEl.innerText = 'Failed to load sports digest data.';
    }
  }

  // ── Populate Dynamic Sport Dropdown ────────────────────────────────────────
  function populateSportFilter() {
    const select = document.getElementById('sport-filter');
    if (!select || !digestData) return;

    const allItems = [
      ...(digestData.recent_results || []),
      ...(digestData.starting_soon || []),
      ...(digestData.ending_soon || []),
      ...(digestData.active_seasons || []),
      ...(digestData.future_events || [])
    ];

    const sports = [...new Set(allItems.map(item => item.sport).filter(Boolean))].sort();

    sports.forEach(sport => {
      const opt = document.createElement('option');
      opt.value = sport;
      opt.textContent = sport;
      select.appendChild(opt);
    });
  }

  // ── Event Binding ──────────────────────────────────────────────────────────
  function initEventListeners() {
    const searchInput = document.getElementById('digest-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        currentSearch = searchInput.value.trim().toLowerCase();
        renderDigest();
      });
    }

    const sportSelect = document.getElementById('sport-filter');
    if (sportSelect) {
      sportSelect.addEventListener('change', () => {
        currentSport = sportSelect.value;
        renderDigest();
      });
    }
  }

  // ── Filtering Logic ────────────────────────────────────────────────────────
  function filterItems(items) {
    if (!items) return [];
    return items.filter(item => {
      const matchesSearch = !currentSearch || 
        item.event.toLowerCase().includes(currentSearch) ||
        (item.sport && item.sport.toLowerCase().includes(currentSearch));
      
      const matchesSport = currentSport === 'all' || item.sport === currentSport;

      return matchesSearch && matchesSport;
    });
  }

  // ── Render Card HTML ───────────────────────────────────────────────────────
  function createCardHtml(card) {
    const wikiUrl = card.wikipedia_title 
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(card.wikipedia_title)}`
      : '#';
    
    const formattedStart = formatDate(card.start_date);
    const formattedEnd = formatDate(card.end_date);

    const dateStr = (!card.end_date || card.start_date === card.end_date)
      ? formattedStart
      : `${formattedStart} – ${formattedEnd}`;

    const statusBadges = [];

    // 1. Winner Badge
    if (card.winner) {
      statusBadges.push(`
        <div class="status-badge winner">
          🏆 <span>Winner:</span> <strong>${escHtml(card.winner)}</strong>
        </div>
      `);
    }

    // 2. Current Leader Badge
    if (card.current_leader) {
      statusBadges.push(`
        <div class="status-badge leader">
          🟡 <span>Leader:</span> <strong>${escHtml(card.current_leader)}</strong>
        </div>
      `);
    }

    // 3. Defending Champion / Previous Holder Badge (With Wikipedia Link)
    if (card.previous_holder) {
      const prevWikiSlug = card.previous_holder_wikipedia_title || card.previous_event_wikipedia_title;
      const prevWikiUrl = prevWikiSlug
        ? `https://en.wikipedia.org/wiki/${encodeURIComponent(prevWikiSlug)}`
        : `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(card.previous_holder)}`;

      statusBadges.push(`
        <div class="status-badge holder">
          📜 <span>Defending:</span> 
          <strong>
            <a href="${escAttr(prevWikiUrl)}" target="_blank" rel="noopener noreferrer" class="badge-link">
              ${escHtml(card.previous_holder)}
            </a>
          </strong>
        </div>
      `);
    }

    return `
      <article class="sport-card">
        <div class="card-header">
          <h3>
            <a href="${escAttr(wikiUrl)}" target="_blank" rel="noopener noreferrer" class="card-title-link">
              ${card.icon || '🏆'} ${escHtml(card.event)}
            </a>
          </h3>
          ${card.sport ? `<span class="sport-tag">${escHtml(card.sport)}</span>` : ''}
        </div>
        <div class="card-dates">📅 ${escHtml(dateStr)}</div>
        <div class="card-body">
          ${statusBadges.join('')}
        </div>
      </article>
    `;
  }

  // ── Main Render Pass ───────────────────────────────────────────────────────
  function renderDigest() {
    if (!digestData) return;

    const renderSection = (items, containerId, sectionId) => {
      const filtered = filterItems(items);
      const container = document.getElementById(containerId);
      const section = document.getElementById(sectionId);

      if (container && section) {
        if (filtered.length > 0) {
          container.innerHTML = filtered.map(createCardHtml).join('');
          section.style.display = 'block';
        } else {
          section.style.display = 'none';
        }
      }
    };

    const refDate = digestData.generated_at;

    // 1. Just Finished (Ended in last 7 days)
    const rawFinished = digestData.recent_results || [];
    const justFinishedItems = rawFinished.filter(item => {
      const endDate = item.end_date || item.start_date;
      const diff = getDaysDiff(endDate, refDate);
      return diff === null || (diff >= -7 && diff <= 0);
    });
    renderSection(justFinishedItems, 'just-finished-container', 'section-just-finished');

    // 2. Coming Up (Starting in next 7 days)
    const rawStarting = digestData.starting_soon || [];
    const comingUpItems = rawStarting.filter(item => {
      const diff = getDaysDiff(item.start_date, refDate);
      return diff === null || (diff >= 0 && diff <= 7);
    });
    renderSection(comingUpItems, 'coming-up-container', 'section-coming-up');

    // 3. Ongoing Events
    const ongoingRaw = [
      ...(digestData.ending_soon || []),
      ...(digestData.active_seasons || [])
    ];
    const ongoingItems = Array.from(new Map(ongoingRaw.map(item => [item.event, item])).values());
    renderSection(ongoingItems, 'ongoing-container', 'section-ongoing');

    // 4. Future Events
    renderSection(digestData.future_events || [], 'future-container', 'section-future');
  }

  // ── Date Utility Helpers ───────────────────────────────────────────────────
  function getDaysDiff(dateStr, refDateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + 'T00:00:00');
    const ref = refDateStr ? new Date(refDateStr + 'T00:00:00') : new Date();
    target.setHours(0, 0, 0, 0);
    ref.setHours(0, 0, 0, 0);
    return Math.round((target - ref) / (1000 * 60 * 60 * 24));
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const year = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (isNaN(year) || isNaN(monthIdx) || isNaN(day) || monthIdx < 0 || monthIdx > 11) {
      return dateStr;
    }

    const padDay = String(day).padStart(2, '0');
    return `${padDay} ${months[monthIdx]} ${year}`;
  }

  // ── Escaping Utilities ─────────────────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
