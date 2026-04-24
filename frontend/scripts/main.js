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
  const apiBaseUrl = normalizeApiBaseUrl(configuredApiBaseUrl || '/api/businesses');
  const apiOrigin = getApiOrigin(apiBaseUrl);
  const pagePaths = {
    home: './index.html',
    listings: './listings.html',
    addBusiness: './add-business.html',
  };
  const whatsappMessage =
    'Hello, I need your service. I am messaging you from Maro Solution website.';

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

  function initialsFromName(name) {
    return String(name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part[0];
      })
      .join('')
      .toUpperCase();
  }

  function createStars(rating) {
    const fullStars = Math.round(Number(rating) || 0);
    return Array.from({ length: 5 }, function (_, index) {
      return index < fullStars ? '&#9733;' : '&#9734;';
    }).join('');
  }

  function normalizeWhatsapp(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function normalizeApiBaseUrl(url) {
    if (!url) {
      return '/api/businesses';
    }

    const trimmedUrl = url.replace(/\/+$/, '');
    if (trimmedUrl.endsWith('/api')) {
      return trimmedUrl + '/businesses';
    }

    return trimmedUrl;
  }

  function getApiOrigin(url) {
    try {
      return new URL(url, window.location.origin).origin;
    } catch (error) {
      return window.location.origin;
    }
  }

  function resolveAssetUrl(assetPath) {
    if (!assetPath) {
      return '';
    }

    if (/^https?:\/\//i.test(assetPath)) {
      return assetPath;
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

  function createProviderCard(business) {
    const profileMarkup = business.profileImage
      ? '<img src="' + resolveAssetUrl(business.profileImage) + '" alt="' + escapeHtml(business.name) + ' profile picture" />'
      : escapeHtml(initialsFromName(business.name));

    return [
      '<article class="provider-card">',
      '  <div class="provider-top">',
      '    <div class="provider-avatar">' + profileMarkup + '</div>',
      '    <div>',
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
      '  <div class="rating"><span class="stars">' +
        createStars(business.rating) +
        '</span><span>' +
        Number(business.rating || 0).toFixed(1) +
        '/5</span></div>',
      '  <div class="provider-actions">',
      '    <a class="button button-whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' +
        normalizeWhatsapp(business.phone) +
        '?text=' +
        encodeURIComponent(whatsappMessage) +
        '">WhatsApp</a>',
      '  </div>',
      '</article>',
    ].join('');
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
    const searchParams = new URLSearchParams(window.location.search);

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

    filterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      runSearch();
    });

    resetButton.addEventListener('click', function () {
      filterForm.reset();
      stateSelect.dispatchEvent(new Event('change'));
      runSearch();
    });

    runSearch();
  }

  function initializeAddBusinessPage() {
    const form = document.getElementById('business-form');
    const feedback = document.getElementById('form-feedback');
    const submitButton = document.getElementById('submit-button');
    const imageInput = document.getElementById('profile-image');
    const previewNode = document.getElementById('image-preview');

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
        feedback.textContent = payload.message || 'Business added successfully.';
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
