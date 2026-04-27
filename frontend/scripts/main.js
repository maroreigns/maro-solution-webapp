(function () {
  const appData = window.MaroData || {
    nigeriaStatesAndLgas: {},
    nigeriaStates: [],
    businessCategories: [],
  };

  const page = document.body.dataset.page;
  const isFileProtocol = window.location.protocol === 'file:';
  const configuredApiBaseUrl =
    window.MaroConfig && typeof window.MaroConfig.API_BASE_URL === 'string'
      ? window.MaroConfig.API_BASE_URL.trim()
      : '';
  const apiRootUrl = normalizeApiRootUrl(configuredApiBaseUrl || '/api');
  const apiBaseUrl = getBusinessApiBaseUrl(apiRootUrl);
  const adminApiBaseUrl = getAdminApiBaseUrl(apiRootUrl);
  const apiOrigin = getApiOrigin(apiBaseUrl);
  const assetBaseUrl = getAssetBaseUrl(apiRootUrl);
  const pagePaths = {
    home: './index.html',
    listings: './listings.html',
    addBusiness: './add-business.html',
  };
  const whatsappMessage =
    'Hello, I need your service. I am messaging you from Maro Solution website.';
  const adminJwtStorageKey = 'admin_jwt';

  function initializeSharedUi() {
    setupTheme();
    setupMobileNav();
    highlightCurrentPage();

    const yearNode = document.getElementById('current-year');
    if (yearNode) {
      yearNode.textContent = new Date().getFullYear();
    }
  }

  function setupTheme() {
    const themeToggle = document.querySelector('.theme-toggle');
    const savedTheme = localStorage.getItem('maro-theme');

    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
    }

    if (!themeToggle) {
      return;
    }

    themeToggle.addEventListener('click', function () {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('maro-theme', isDark ? 'dark' : 'light');
      themeToggle.setAttribute('aria-pressed', String(isDark));
    });

    themeToggle.setAttribute(
      'aria-pressed',
      String(document.body.classList.contains('dark-mode'))
    );
  }

  function setupMobileNav() {
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.site-nav');

    if (!navToggle || !nav) {
      return;
    }

    navToggle.addEventListener('click', function () {
      const isOpen = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  function highlightCurrentPage() {
    const navLinks = document.querySelectorAll('.site-nav a');
    const activePath = window.location.pathname.split('/').pop() || 'index.html';

    navLinks.forEach(function (link) {
      const href = link.getAttribute('href') || '';
      if (href.endsWith(activePath) || (activePath === '' && href.endsWith('index.html'))) {
        link.classList.add('is-active');
      }
    });
  }

  function populateSelect(select, values, placeholder) {
    if (!select) {
      return;
    }

    select.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = placeholder;
    select.appendChild(defaultOption);

    values.forEach(function (value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function wireStateAndLgaSelects(stateSelect, lgaSelect, lgaPlaceholder) {
    if (!stateSelect || !lgaSelect) {
      return;
    }

    populateSelect(
      stateSelect,
      appData.nigeriaStates,
      stateSelect.options[0] ? stateSelect.options[0].textContent : 'Select state'
    );

    function refreshLgas() {
      const selectedState = stateSelect.value;
      const lgas = selectedState ? appData.nigeriaStatesAndLgas[selectedState] || [] : [];
      populateSelect(lgaSelect, lgas, lgaPlaceholder);
    }

    stateSelect.addEventListener('change', refreshLgas);
    refreshLgas();
  }

  function firstLetterFromName(name) {
    return String(name || 'M').trim().charAt(0).toUpperCase() || 'M';
  }

  function getBusinessId(business) {
    return business && (business._id || business.id || '');
  }

  function getRatingStorageKey(businessId) {
    return 'maro-rated-business-' + businessId;
  }

  function hasRatedBusiness(businessId) {
    return Boolean(businessId && localStorage.getItem(getRatingStorageKey(businessId)));
  }

  function getSavedAdminJwt() {
    return sessionStorage.getItem(adminJwtStorageKey) || '';
  }

  function isAdminLoggedIn() {
    return page === 'listings' && Boolean(getSavedAdminJwt());
  }

  function formatRatingSummary(ratingAverage, ratingCount) {
    const count = Number(ratingCount) || 0;

    if (!count) {
      return 'No ratings yet';
    }

    return (
      '<span class="rating-average-star" aria-hidden="true">&#9733;</span> ' +
      Number(ratingAverage || 0).toFixed(1) +
      ' <span class="rating-review-count">(' +
      count +
      ' review' +
      (count === 1 ? '' : 's') +
      ')</span>'
    );
  }

  function createRatingControls(business) {
    const businessId = getBusinessId(business);
    const ratingAverage = Number(business.ratingAverage) || 0;
    const ratingCount = Number(business.ratingCount) || 0;
    const alreadyRated = hasRatedBusiness(businessId);
    const roundedAverage = Math.round(ratingAverage);
    const buttons = Array.from({ length: 5 }, function (_, index) {
      const ratingValue = index + 1;
      return (
        '<button class="rating-star' +
        (ratingValue <= roundedAverage ? ' is-filled' : '') +
        '" type="button" data-rating-value="' +
        ratingValue +
        '" aria-label="Rate ' +
        escapeHtml(business.name) +
        ' ' +
        ratingValue +
        ' out of 5"' +
        (alreadyRated ? ' disabled' : '') +
        '>' +
        '&#9733;' +
        '</button>'
      );
    }).join('');

    return [
      '<div class="rating" data-rating-business-id="' + escapeHtml(businessId) + '">',
      '  <div class="rating-summary">' + formatRatingSummary(ratingAverage, ratingCount) + '</div>',
      '  <div class="rating-input-row">',
      '    <span class="rating-label">Rate this provider:</span>',
      '    <div class="rating-actions" aria-label="Submit a customer rating">' + buttons + '</div>',
      '  </div>',
      '  <span class="rating-feedback" aria-live="polite"></span>',
      '</div>',
    ].join('');
  }

  function normalizeWhatsapp(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function normalizeApiRootUrl(url) {
    if (!url) {
      return '/api';
    }

    const trimmedUrl = url.replace(/\/+$/, '');
    if (trimmedUrl.endsWith('/api/businesses')) {
      return trimmedUrl.replace(/\/businesses$/, '');
    }

    return trimmedUrl;
  }

  function getBusinessApiBaseUrl(rootUrl) {
    return rootUrl.replace(/\/+$/, '') + '/businesses';
  }

  function getApiOrigin(url) {
    try {
      return new URL(url, window.location.origin).origin;
    } catch (error) {
      return window.location.origin;
    }
  }

  function getAssetBaseUrl(url) {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      parsedUrl.pathname = parsedUrl.pathname.replace(/\/api(?:\/businesses)?\/?$/, '');
      parsedUrl.search = '';
      parsedUrl.hash = '';
      return parsedUrl.toString().replace(/\/$/, '');
    } catch (error) {
      return window.location.origin;
    }
  }

  function getAdminApiBaseUrl(rootUrl) {
    return rootUrl.replace(/\/+$/, '') + '/admin';
  }

  function getAdminAuthHeaders() {
    return {
      Authorization: 'Bearer ' + getSavedAdminJwt(),
    };
  }

  function resolveAssetUrl(assetPath) {
    if (!assetPath) {
      return '';
    }

    if (/^https?:\/\//i.test(assetPath)) {
      return assetPath;
    }

    if (assetPath.startsWith('/uploads')) {
      return assetBaseUrl + assetPath;
    }

    if (assetPath.startsWith('/')) {
      return apiOrigin + assetPath;
    }

    return assetPath;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createAdminDeleteButton(business) {
    const businessId = getBusinessId(business);

    if (!isAdminLoggedIn() || !businessId) {
      return '';
    }

    return (
      '<button class="button button-danger admin-delete-button" type="button" data-delete-business-id="' +
      escapeHtml(businessId) +
      '">Delete</button>'
    );
  }

  function createProviderCard(business) {
    const fallbackLetter = firstLetterFromName(business.name);
    const profileMarkup = business.profileImage
      ? '<img src="' +
        resolveAssetUrl(business.profileImage) +
        '" alt="' +
        escapeHtml(business.name) +
        ' profile picture" data-avatar-fallback="' +
        escapeHtml(fallbackLetter) +
        '" />'
      : escapeHtml(fallbackLetter);

    return [
      '<article class="provider-card">',
      '  <div class="provider-top">',
      '    <div class="provider-avatar" aria-hidden="' + (business.profileImage ? 'false' : 'true') + '">' + profileMarkup + '</div>',
      '    <div class="provider-heading">',
      '      <h3>' + escapeHtml(business.name) + '</h3>',
      '      <div class="provider-tags">',
      '        <span class="tag">' + escapeHtml(business.category) + '</span>',
      '        <span class="tag">' + escapeHtml(business.state) + '</span>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="provider-meta">',
      '    <span><strong>Local Government:</strong> ' + escapeHtml(business.localGovernment) + '</span>',
      '    <span><strong>Phone:</strong> ' + escapeHtml(business.phone) + '</span>',
      '    <span><strong>Address:</strong> ' + escapeHtml(business.address) + '</span>',
      '    <span><strong>Experience:</strong> ' + escapeHtml(String(business.yearsExperience)) + ' years</span>',
      '  </div>',
      '  ' + createRatingControls(business),
      '  <div class="provider-actions">',
      '    <a class="button button-whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' +
        normalizeWhatsapp(business.phone) +
        '?text=' +
        encodeURIComponent(whatsappMessage) +
        '">WhatsApp</a>',
      '    ' + createAdminDeleteButton(business),
      '  </div>',
      '</article>',
    ].join('');
  }

  function createPendingBusinessCard(business) {
    const businessId = getBusinessId(business);

    return [
      '<article class="admin-pending-card" data-admin-business-id="' + escapeHtml(businessId) + '">',
      '  <div>',
      '    <h3>' + escapeHtml(business.name) + '</h3>',
      '    <div class="provider-tags">',
      '      <span class="tag">' + escapeHtml(business.category) + '</span>',
      '      <span class="tag">' + escapeHtml(business.state) + '</span>',
      '      <span class="tag">' + escapeHtml(business.paymentStatus || 'unpaid') + '</span>',
      '    </div>',
      '  </div>',
      '  <div class="provider-meta">',
      '    <span><strong>Local Government:</strong> ' + escapeHtml(business.localGovernment) + '</span>',
      '    <span><strong>Phone:</strong> ' + escapeHtml(business.phone) + '</span>',
      '    <span><strong>Address:</strong> ' + escapeHtml(business.address) + '</span>',
      '    <span><strong>Payment reference:</strong> ' + escapeHtml(business.paymentReference || 'Not provided yet') + '</span>',
      '  </div>',
      '  <div class="admin-action-row">',
      '    <button class="button button-primary admin-action-button" type="button" data-admin-action="verify-payment">Verify Payment</button>',
      '    <button class="button button-secondary admin-action-button" type="button" data-admin-action="approve">Approve</button>',
      '    <button class="button button-secondary admin-action-button" type="button" data-admin-action="reject-payment">Reject Payment</button>',
      '    <button class="button button-danger admin-action-button" type="button" data-admin-action="reject">Reject</button>',
      '    <button class="button button-danger admin-delete-button" type="button" data-delete-business-id="' +
        escapeHtml(businessId) +
        '">Delete</button>',
      '  </div>',
      '</article>',
    ].join('');
  }

  function setupProviderAvatarFallbacks() {
    document.addEventListener(
      'error',
      function (event) {
        const image = event.target;

        if (!image || !image.matches || !image.matches('.provider-avatar img')) {
          return;
        }

        const avatar = image.closest('.provider-avatar');
        if (!avatar) {
          return;
        }

        avatar.textContent = image.dataset.avatarFallback || 'M';
        avatar.setAttribute('aria-hidden', 'true');
      },
      true
    );
  }

  function getLiveDataUnavailableMessage() {
    return isFileProtocol
      ? 'Live listings need a local server. The layout and styling will still work when these HTML files are opened directly.'
      : 'Unable to load businesses right now. Please try again shortly.';
  }

  async function fetchBusinesses(params) {
    if (isFileProtocol) {
      throw new Error(getLiveDataUnavailableMessage());
    }

    const url = new URL(apiBaseUrl, window.location.origin);

    if (params) {
      Object.entries(params).forEach(function ([key, value]) {
        if (value) {
          url.searchParams.set(key, value);
        }
      });
    }

    const response = await fetch(url.toString());
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || getLiveDataUnavailableMessage());
    }

    return payload.data || [];
  }

  async function submitBusinessRating(businessId, ratingValue) {
    const response = await fetch(apiBaseUrl + '/' + encodeURIComponent(businessId) + '/rate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rating: ratingValue }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to submit rating.');
    }

    return payload;
  }

  async function loginAdmin(email, password) {
    const response = await fetch(adminApiBaseUrl + '/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email, password: password }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to log in.');
    }

    return payload;
  }

  async function fetchCurrentAdmin() {
    const response = await fetch(adminApiBaseUrl + '/me', {
      headers: getAdminAuthHeaders(),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Admin session expired.');
    }

    return payload.data || null;
  }

  async function deleteBusiness(businessId) {
    const response = await fetch(apiBaseUrl + '/' + encodeURIComponent(businessId), {
      method: 'DELETE',
      headers: getAdminAuthHeaders(),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to delete business.');
    }

    return payload;
  }

  async function fetchPendingBusinesses() {
    const response = await fetch(apiBaseUrl + '/admin/pending', {
      headers: getAdminAuthHeaders(),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to load pending businesses.');
    }

    return payload.data || [];
  }

  async function runAdminBusinessAction(businessId, action) {
    const response = await fetch(
      apiBaseUrl + '/' + encodeURIComponent(businessId) + '/' + action,
      {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
      }
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to update business.');
    }

    return payload;
  }

  function updateRatingNode(ratingNode, ratingData, message) {
    const ratingAverage = Number(ratingData.ratingAverage) || 0;
    const ratingCount = Number(ratingData.ratingCount) || 0;
    const summaryNode = ratingNode.querySelector('.rating-summary');
    const feedbackNode = ratingNode.querySelector('.rating-feedback');

    if (summaryNode) {
      summaryNode.innerHTML = formatRatingSummary(ratingAverage, ratingCount);
    }

    ratingNode.querySelectorAll('.rating-star').forEach(function (button, index) {
      button.disabled = true;
      button.classList.toggle('is-filled', index < Math.round(ratingAverage));
    });

    if (feedbackNode) {
      feedbackNode.textContent = message || '';
      feedbackNode.classList.toggle('error', false);
    }
  }

  function setupRatingClicks() {
    document.addEventListener('click', async function (event) {
      const starButton = event.target.closest('.rating-star');

      if (!starButton) {
        return;
      }

      const ratingNode = starButton.closest('[data-rating-business-id]');
      const feedbackNode = ratingNode ? ratingNode.querySelector('.rating-feedback') : null;
      const businessId = ratingNode ? ratingNode.dataset.ratingBusinessId : '';
      const ratingValue = Number(starButton.dataset.ratingValue);

      if (!ratingNode || !businessId || !Number.isFinite(ratingValue)) {
        return;
      }

      if (hasRatedBusiness(businessId)) {
        if (feedbackNode) {
          feedbackNode.textContent = 'You already rated this provider.';
          feedbackNode.classList.add('error');
        }
        return;
      }

      ratingNode.querySelectorAll('.rating-star').forEach(function (button) {
        button.disabled = true;
      });

      if (feedbackNode) {
        feedbackNode.textContent = 'Submitting...';
        feedbackNode.classList.remove('error');
      }

      try {
        const payload = await submitBusinessRating(businessId, ratingValue);
        localStorage.setItem(getRatingStorageKey(businessId), String(ratingValue));
        updateRatingNode(ratingNode, payload.data || {}, payload.message || 'Thanks for rating.');
      } catch (error) {
        ratingNode.querySelectorAll('.rating-star').forEach(function (button) {
          button.disabled = false;
        });

        if (feedbackNode) {
          feedbackNode.textContent = error.message;
          feedbackNode.classList.add('error');
        }
      }
    });
  }

  function initializeHomePage() {
    populateSelect(document.getElementById('hero-category'), appData.businessCategories, 'All categories');
    wireStateAndLgaSelects(
      document.getElementById('hero-state'),
      document.getElementById('hero-local-government'),
      'All local governments'
    );

    const featuredCategoriesNode = document.getElementById('featured-categories');
    appData.businessCategories.slice(0, 12).forEach(function (category) {
      const link = document.createElement('a');
      link.className = 'chip';
      link.href = pagePaths.listings + '?category=' + encodeURIComponent(category);
      link.textContent = category;
      featuredCategoriesNode.appendChild(link);
    });

    const heroSearchForm = document.getElementById('hero-search-form');
    if (heroSearchForm) {
      heroSearchForm.addEventListener('submit', function (event) {
        event.preventDefault();

        const formData = new FormData(heroSearchForm);
        const params = new URLSearchParams();

        ['category', 'state', 'localGovernment'].forEach(function (field) {
          const value = formData.get(field);
          if (value) {
            params.set(field, value);
          }
        });

        window.location.href = pagePaths.listings + (params.toString() ? '?' + params.toString() : '');
      });
    }

    loadFeaturedBusinesses();
  }

  async function loadFeaturedBusinesses() {
    const listNode = document.getElementById('featured-businesses');
    const loadingNode = document.getElementById('featured-loading');

    try {
      const businesses = await fetchBusinesses();
      loadingNode.hidden = true;

      if (!businesses.length) {
        listNode.innerHTML =
          '<div class="status-message">No featured providers yet. Add a business to get started.</div>';
        return;
      }

      listNode.innerHTML = businesses.slice(0, 4).map(createProviderCard).join('');
    } catch (error) {
      loadingNode.textContent = error.message;
    }
  }

  function initializeListingsPage() {
    const filterForm = document.getElementById('listings-filter-form');
    const categorySelect = document.getElementById('filter-category');
    const stateSelect = document.getElementById('filter-state');
    const lgaSelect = document.getElementById('filter-local-government');
    const keywordInput = document.getElementById('filter-keyword');
    const resultsMeta = document.getElementById('results-meta');
    const listingsGrid = document.getElementById('listings-grid');
    const resetButton = document.getElementById('reset-filters');
    const adminToggle = document.getElementById('admin-toggle');
    const adminPanel = document.getElementById('admin-panel');
    const adminRefresh = document.getElementById('admin-refresh');
    const adminPendingMeta = document.getElementById('admin-pending-meta');
    const adminPendingList = document.getElementById('admin-pending-list');
    const searchParams = new URLSearchParams(window.location.search);
    let currentAdmin = null;
    let isAdminPanelOpen = isAdminLoggedIn();

    populateSelect(categorySelect, appData.businessCategories, 'All categories');
    wireStateAndLgaSelects(stateSelect, lgaSelect, 'All local governments');

    categorySelect.value = searchParams.get('category') || '';
    stateSelect.value = searchParams.get('state') || '';
    stateSelect.dispatchEvent(new Event('change'));
    lgaSelect.value = searchParams.get('localGovernment') || '';
    keywordInput.value = searchParams.get('keyword') || '';

    async function runSearch() {
      resultsMeta.textContent = 'Loading listings...';
      listingsGrid.innerHTML = '';

      const params = {
        keyword: keywordInput.value.trim(),
        category: categorySelect.value,
        state: stateSelect.value,
        localGovernment: lgaSelect.value,
      };

      const nextQuery = new URLSearchParams();
      Object.entries(params).forEach(function ([key, value]) {
        if (value) {
          nextQuery.set(key, value);
        }
      });

      window.history.replaceState(
        {},
        '',
        pagePaths.listings + (nextQuery.toString() ? '?' + nextQuery.toString() : '')
      );

      try {
        const businesses = await fetchBusinesses(params);

        if (!businesses.length) {
          resultsMeta.textContent = 'No results found. Try another category, location, or keyword.';
          listingsGrid.innerHTML =
            '<div class="status-message">No businesses matched your search yet.</div>';
          return;
        }

        resultsMeta.textContent =
          businesses.length +
          ' service provider' +
          (businesses.length === 1 ? '' : 's') +
          ' found.';
        listingsGrid.innerHTML = businesses.map(createProviderCard).join('');
      } catch (error) {
        resultsMeta.textContent = error.message;
      }
    }

    function ensureAdminLoginUi() {
      if (!adminPanel || document.getElementById('admin-login-shell')) {
        return;
      }

      const loginShell = document.createElement('div');
      loginShell.className = 'admin-login-shell';
      loginShell.id = 'admin-login-shell';
      loginShell.innerHTML = [
        '<form class="admin-login-form" id="admin-login-form">',
        '  <label>Email',
        '    <input type="email" name="email" autocomplete="username" required />',
        '  </label>',
        '  <label>Password',
        '    <input type="password" name="password" autocomplete="current-password" required />',
        '  </label>',
        '  <button class="button button-primary" type="submit" id="admin-login-submit">Log In</button>',
        '</form>',
        '<div class="admin-session" id="admin-session" hidden>',
        '  <span id="admin-session-label"></span>',
        '  <button class="button button-secondary" type="button" id="admin-logout">Logout</button>',
        '</div>',
        '<div class="form-feedback" id="admin-login-feedback" hidden></div>',
      ].join('');

      adminPanel.insertBefore(loginShell, adminPendingMeta || adminPanel.firstChild);
    }

    function setAdminFeedback(message, isError) {
      const feedbackNode = document.getElementById('admin-login-feedback');

      if (!feedbackNode) {
        return;
      }

      feedbackNode.hidden = !message;
      feedbackNode.className = 'form-feedback' + (isError ? ' error' : ' success');
      feedbackNode.textContent = message || '';
    }

    function refreshAdminButton() {
      if (!adminToggle) {
        return;
      }

      const adminEnabled = isAdminLoggedIn();
      const loginForm = document.getElementById('admin-login-form');
      const sessionNode = document.getElementById('admin-session');
      const sessionLabel = document.getElementById('admin-session-label');

      adminToggle.textContent = adminEnabled ? 'Admin Panel' : 'Admin Login';

      if (adminPanel) {
        adminPanel.hidden = !isAdminPanelOpen && !adminEnabled;
      }

      if (adminRefresh) {
        adminRefresh.hidden = !adminEnabled;
      }

      if (loginForm) {
        loginForm.hidden = adminEnabled;
      }

      if (sessionNode) {
        sessionNode.hidden = !adminEnabled;
      }

      if (sessionLabel) {
        sessionLabel.textContent =
          currentAdmin && currentAdmin.email ? 'Logged in as ' + currentAdmin.email : 'Logged in';
      }

      if (adminPendingMeta && !adminEnabled) {
        adminPendingMeta.textContent = 'Log in to view pending businesses.';
      }

      if (adminPendingList && !adminEnabled) {
        adminPendingList.innerHTML = '';
      }
    }

    async function loadPendingQueue() {
      if (!adminPendingMeta || !adminPendingList || !isAdminLoggedIn()) {
        return;
      }

      adminPendingMeta.textContent = 'Loading pending businesses...';
      adminPendingList.innerHTML = '';

      try {
        const businesses = await fetchPendingBusinesses();

        if (!businesses.length) {
          adminPendingMeta.textContent = 'No pending businesses waiting for review.';
          return;
        }

        adminPendingMeta.textContent =
          businesses.length + ' pending business' + (businesses.length === 1 ? '' : 'es') + '.';
        adminPendingList.innerHTML = businesses.map(createPendingBusinessCard).join('');
      } catch (error) {
        adminPendingMeta.textContent = error.message;
        if (/authentication|required|expired/i.test(error.message)) {
          sessionStorage.removeItem(adminJwtStorageKey);
          currentAdmin = null;
          refreshAdminButton();
          runSearch();
        }
      }
    }

    filterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      runSearch();
    });

    resetButton.addEventListener('click', function () {
      filterForm.reset();
      stateSelect.dispatchEvent(new Event('change'));
      runSearch();
    });

    if (adminToggle) {
      adminToggle.addEventListener('click', function () {
        ensureAdminLoginUi();
        isAdminPanelOpen = true;
        if (adminPanel) {
          adminPanel.hidden = false;
        }
        refreshAdminButton();

        if (isAdminLoggedIn()) {
          loadPendingQueue();
          return;
        }

        const emailInput = document.querySelector('#admin-login-form input[name="email"]');
        if (emailInput) {
          emailInput.focus();
        }
      });
    }

    ensureAdminLoginUi();

    const adminLoginForm = document.getElementById('admin-login-form');
    if (adminLoginForm) {
      adminLoginForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const submitButton = document.getElementById('admin-login-submit');
        const formData = new FormData(adminLoginForm);
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '');

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Logging in...';
        }
        setAdminFeedback('', false);

        try {
          const payload = await loginAdmin(email, password);
          if (!payload.token) {
            throw new Error('Admin login did not return a session token.');
          }
          sessionStorage.setItem(adminJwtStorageKey, payload.token || '');
          currentAdmin = payload.data || null;
          adminLoginForm.reset();
          refreshAdminButton();
          await loadPendingQueue();
          await runSearch();
          setAdminFeedback('Admin login successful.', false);
        } catch (error) {
          sessionStorage.removeItem(adminJwtStorageKey);
          currentAdmin = null;
          refreshAdminButton();
          setAdminFeedback(error.message, true);
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Log In';
          }
        }
      });
    }

    const adminLogout = document.getElementById('admin-logout');
    if (adminLogout) {
      adminLogout.addEventListener('click', function () {
        sessionStorage.removeItem(adminJwtStorageKey);
        currentAdmin = null;
        setAdminFeedback('Logged out.', false);
        refreshAdminButton();
        runSearch();
      });
    }

    if (adminRefresh) {
      adminRefresh.addEventListener('click', loadPendingQueue);
    }

    async function handleAdminDeleteClick(deleteButton) {
      const businessId = deleteButton.dataset.deleteBusinessId;

      if (!businessId || !isAdminLoggedIn()) {
        refreshAdminButton();
        return;
      }

      const shouldDelete = window.confirm('Are you sure you want to delete this business?');
      if (!shouldDelete) {
        return;
      }

      deleteButton.disabled = true;
      deleteButton.textContent = 'Deleting...';

      try {
        await deleteBusiness(businessId);
        await runSearch();
        await loadPendingQueue();
      } catch (error) {
        window.alert(error.message);
        deleteButton.disabled = false;
        deleteButton.textContent = 'Delete';
      }
    }

    listingsGrid.addEventListener('click', async function (event) {
      const deleteButton = event.target.closest('.admin-delete-button');

      if (!deleteButton) {
        return;
      }

      handleAdminDeleteClick(deleteButton);
    });

    if (adminPendingList) {
      adminPendingList.addEventListener('click', async function (event) {
        const deleteButton = event.target.closest('.admin-delete-button');

        if (deleteButton) {
          handleAdminDeleteClick(deleteButton);
          return;
        }

        const actionButton = event.target.closest('.admin-action-button');

        if (!actionButton) {
          return;
        }

        const card = actionButton.closest('[data-admin-business-id]');
        const businessId = card ? card.dataset.adminBusinessId : '';
        const action = actionButton.dataset.adminAction;

        if (!businessId || !action || !isAdminLoggedIn()) {
          refreshAdminButton();
          return;
        }

        const shouldContinue = window.confirm('Continue with this admin action?');
        if (!shouldContinue) {
          return;
        }

        actionButton.disabled = true;
        actionButton.textContent = 'Working...';

        try {
          await runAdminBusinessAction(businessId, action);
          await loadPendingQueue();
          await runSearch();
        } catch (error) {
          window.alert(error.message);
          actionButton.disabled = false;
          actionButton.textContent = action.replace('-', ' ');
        }
      });
    }

    refreshAdminButton();
    if (isAdminLoggedIn()) {
      fetchCurrentAdmin()
        .then(function (admin) {
          currentAdmin = admin;
          refreshAdminButton();
          loadPendingQueue();
          runSearch();
        })
        .catch(function () {
          sessionStorage.removeItem(adminJwtStorageKey);
          currentAdmin = null;
          refreshAdminButton();
          runSearch();
        });
    } else {
      runSearch();
    }
  }

  function initializeAddBusinessPage() {
    const form = document.getElementById('business-form');
    const feedback = document.getElementById('form-feedback');
    const submitButton = document.getElementById('submit-button');
    const imageInput = document.getElementById('profile-image');
    const previewNode = document.getElementById('image-preview');
    const paymentInstructions = document.getElementById('payment-instructions');
    const submittedPaymentReference = document.getElementById('submitted-payment-reference');

    populateSelect(document.getElementById('business-category'), appData.businessCategories, 'Select category');
    wireStateAndLgaSelects(
      document.getElementById('business-state'),
      document.getElementById('business-local-government'),
      'Select local government'
    );

    imageInput.addEventListener('change', function () {
      const file = imageInput.files && imageInput.files[0];
      previewNode.textContent = file ? 'Selected image: ' + file.name : 'No image selected yet.';
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      feedback.hidden = true;
      feedback.className = 'form-feedback';
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';

      if (isFileProtocol) {
        feedback.hidden = false;
        feedback.classList.add('error');
        feedback.textContent =
          'Form submission needs the backend server running. Open the site through the Node.js server to add a business.';
        submitButton.disabled = false;
        submitButton.textContent = 'Add Business';
        return;
      }

      try {
        const formData = new FormData(form);
        const response = await fetch(apiBaseUrl, {
          method: 'POST',
          body: formData,
        });
        const payload = await response.json();

        if (!response.ok) {
          const validationMessages = (payload.errors || [])
            .map(function (item) {
              return item.message;
            })
            .join(' ');
          throw new Error(validationMessages || payload.message || 'Unable to add business.');
        }

        feedback.hidden = false;
        feedback.classList.add('success');
        feedback.textContent =
          payload.message ||
          'Business submitted successfully. Please complete payment. Your listing will go public after payment verification.';

        if (paymentInstructions) {
          paymentInstructions.hidden = false;
        }

        if (submittedPaymentReference) {
          const paymentReference = payload.data && payload.data.paymentReference;
          submittedPaymentReference.hidden = !paymentReference;
          submittedPaymentReference.textContent = paymentReference
            ? 'Submitted payment reference: ' + paymentReference
            : '';
        }

        form.hidden = true;
        form.reset();
        previewNode.textContent = 'No image selected yet.';
      } catch (error) {
        feedback.hidden = false;
        feedback.classList.add('error');
        feedback.textContent = error.message;
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Add Business';
      }
    });
  }

  initializeSharedUi();
  setupProviderAvatarFallbacks();
  setupRatingClicks();

  if (page === 'home') {
    initializeHomePage();
  }

  if (page === 'listings') {
    initializeListingsPage();
  }

  if (page === 'add-business') {
    initializeAddBusinessPage();
  }
})();
