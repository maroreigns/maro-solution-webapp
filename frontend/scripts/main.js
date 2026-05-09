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
  const defaultApiRootUrl = 'https://maro-solution-backend.onrender.com/api';
  const apiRootUrl = normalizeApiRootUrl(configuredApiBaseUrl || defaultApiRootUrl);
  const apiBaseUrl = getBusinessApiBaseUrl(apiRootUrl);
  const adminApiBaseUrl = getAdminApiBaseUrl(apiRootUrl);
  const paymentApiBaseUrl = getPaymentApiBaseUrl(apiRootUrl);
  const apiOrigin = getApiOrigin(apiBaseUrl);
  const assetBaseUrl = getAssetBaseUrl(apiRootUrl);
  const pagePaths = {
    home: './index.html',
    listings: './listings.html',
    addBusiness: './add-business.html',
    business: './business.html',
    dashboard: './dashboard.html',
  };
  const whatsappMessage =
    'Hello, I need your service. I am messaging you from Maro Solution website.';
  const adminJwtStorageKey = 'admin_jwt';
  const ownerJwtStorageKey = 'owner_jwt';
  const ownerListingStorageKey = 'maro-owner-listing-status';

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

  function getSavedOwnerJwt() {
    return sessionStorage.getItem(ownerJwtStorageKey) || '';
  }

  function getTrackedOwnerListing() {
    try {
      return JSON.parse(localStorage.getItem(ownerListingStorageKey) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function saveTrackedOwnerListing(updates) {
    const currentListing = getTrackedOwnerListing();
    const nextListing = {
      ...currentListing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(ownerListingStorageKey, JSON.stringify(nextListing));
    return nextListing;
  }

  function getTrackedOwnerBusinessId(trackedListing) {
    return String(
      (trackedListing && (trackedListing.businessId || trackedListing.id || trackedListing._id)) || ''
    );
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
    const digits = String(value || '').replace(/[^\d]/g, '');

    if (digits.length === 11 && digits.startsWith('0')) {
      return '234' + digits.slice(1);
    }

    if (digits.startsWith('234')) {
      return digits;
    }

    if (digits.length === 10 && /^[789]/.test(digits)) {
      return '234' + digits;
    }

    return digits;
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

  function getPaymentApiBaseUrl(rootUrl) {
    return rootUrl.replace(/\/+$/, '') + '/payments';
  }

  function getAdminAuthHeaders() {
    return {
      Authorization: 'Bearer ' + getSavedAdminJwt(),
    };
  }

  function getOwnerAuthHeaders(extraHeaders) {
    return {
      ...(extraHeaders || {}),
      Authorization: 'Bearer ' + getSavedOwnerJwt(),
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

  function shouldShowVerifiedBadge(business) {
    return Boolean(
      business &&
        business.status === 'approved' &&
        business.phoneVerified === true
    );
  }

  function createVerifiedBadge(business) {
    if (!shouldShowVerifiedBadge(business)) {
      return '';
    }

    return '<span class="tag verified-badge">Verified by Maro Services Hub</span>';
  }

  function createAdminDeleteButton(business) {
    const businessId = getBusinessId(business);

    if (!isAdminLoggedIn() || !businessId) {
      return '';
    }

    return (
      (business.phoneVerified
        ? ''
        : '<button class="button button-secondary admin-listing-action-button" type="button" data-admin-listing-action="verify-phone" data-admin-business-id="' +
          escapeHtml(businessId) +
          '">Verify Phone</button>') +
      '<button class="button button-danger admin-delete-button" type="button" data-delete-business-id="' +
      escapeHtml(businessId) +
      '">Delete</button>'
    );
  }

  function createProviderCard(business) {
    const businessId = getBusinessId(business);
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
      '        ' + createVerifiedBadge(business),
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
      '    <a class="button button-secondary" href="' +
        pagePaths.business +
        '?id=' +
        encodeURIComponent(businessId) +
        '">View Profile</a>',
      '    ' + createAdminDeleteButton(business),
      '  </div>',
      '</article>',
    ].join('');
  }

  function createBusinessProfile(business) {
    const fallbackLetter = firstLetterFromName(business.name);
    const serviceImages = Array.isArray(business.serviceImages) ? business.serviceImages : [];
    const comments = Array.isArray(business.comments) ? business.comments : [];
    const profileImageUrl = resolveAssetUrl(business.profileImage);
    const profileMarkup = business.profileImage
      ? '<img src="' +
        profileImageUrl +
        '" alt="' +
        escapeHtml(business.name) +
        ' profile picture" data-avatar-fallback="' +
        escapeHtml(fallbackLetter) +
        '" />'
      : escapeHtml(fallbackLetter);

    return [
      '<article class="provider-card">',
      '  <div class="provider-top">',
      business.profileImage
        ? '    <button class="provider-avatar profile-avatar-button image-lightbox-trigger" type="button" data-lightbox-src="' +
          escapeHtml(profileImageUrl) +
          '" data-lightbox-alt="' +
          escapeHtml(business.name + ' profile picture') +
          '" aria-label="View larger profile picture">' +
          profileMarkup +
          '</button>'
        : '    <div class="provider-avatar" aria-hidden="true">' + profileMarkup + '</div>',
      '    <div class="provider-heading">',
      '      <h3>' + escapeHtml(business.name) + '</h3>',
      '      <div class="provider-tags">',
      '        <span class="tag">' + escapeHtml(business.category) + '</span>',
      '        <span class="tag">' + escapeHtml(business.state) + '</span>',
      '        ' + createVerifiedBadge(business),
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="provider-meta">',
      '    <span><strong>Local Government:</strong> ' + escapeHtml(business.localGovernment) + '</span>',
      '    <span><strong>Phone:</strong> ' + escapeHtml(business.phone) + '</span>',
      '    <span><strong>Address:</strong> ' + escapeHtml(business.address) + '</span>',
      '    <span><strong>Experience:</strong> ' + escapeHtml(String(business.yearsExperience)) + ' years</span>',
      '  </div>',
      business.serviceDescription
        ? '  <section class="profile-section"><h4>How I serve customers</h4><p>' +
          escapeHtml(business.serviceDescription) +
          '</p></section>'
        : '',
      serviceImages.length
        ? '  <section class="profile-section"><h4>Service photos</h4><div class="service-gallery">' +
          serviceImages
            .map(function (imageUrl, index) {
              const serviceImageUrl = resolveAssetUrl(imageUrl);
              const serviceImageAlt =
                business.name + ' service photo ' + (index + 1);

              return (
                '<button class="service-gallery-button image-lightbox-trigger" type="button" data-lightbox-src="' +
                escapeHtml(serviceImageUrl) +
                '" data-lightbox-alt="' +
                escapeHtml(serviceImageAlt) +
                '" aria-label="View larger service photo ' +
                (index + 1) +
                '">' +
                '<img src="' +
                serviceImageUrl +
                '" alt="' +
                escapeHtml(serviceImageAlt) +
                '" />' +
                '</button>'
              );
            })
            .join('') +
          '</div></section>'
        : '',
      '  <div class="rating">',
      '    <div class="rating-summary">' +
        formatRatingSummary(business.ratingAverage, business.ratingCount) +
        '</div>',
      '  </div>',
      '  <div class="provider-actions">',
      '    <a class="button button-whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/' +
        normalizeWhatsapp(business.phone) +
        '?text=' +
        encodeURIComponent(whatsappMessage) +
        '">WhatsApp</a>',
      '    <a class="button button-secondary" href="tel:+' +
        normalizeWhatsapp(business.phone) +
        '">Call</a>',
      '    <button class="button button-secondary" type="button" id="report-business-toggle">Report this business</button>',
      '  </div>',
      '  <section class="profile-section trust-disclaimer"><p>Maro Services Hub verifies listings before approval. However, users are advised to confirm service details before booking them.</p></section>',
      createReportForm(),
      createBusinessComments(comments),
      '</article>',
    ].join('');
  }

  function createReportForm() {
    return [
      '<section class="profile-section report-section" id="report-business-section" hidden>',
      '  <h4>Report this business</h4>',
      '  <form class="comment-form" id="report-business-form">',
      '    <div class="form-feedback" id="report-feedback" hidden></div>',
      '    <label>Reason<input type="text" name="reason" maxlength="120" required /></label>',
      '    <label>Message<textarea name="message" maxlength="1000" rows="4"></textarea></label>',
      '    <label>Name<input type="text" name="reporterName" maxlength="80" /></label>',
      '    <label>Contact<input type="text" name="reporterContact" maxlength="120" /></label>',
      '    <button class="button button-primary" type="submit">Submit Report</button>',
      '  </form>',
      '</section>',
    ].join('');
  }

  function formatCommentDate(value) {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function createBusinessComments(comments) {
    const commentMarkup = comments.length
      ? comments
          .map(function (comment) {
            return createBusinessCommentItem(comment);
          })
          .join('')
      : '<div class="status-message">No comments yet. Be the first to share your experience.</div>';

    return [
      '<section class="profile-section profile-comments">',
      '  <h4>Comments</h4>',
      '  <div class="profile-comments-list" id="profile-comments-list">' + commentMarkup + '</div>',
      '  <form class="comment-form" id="comment-form">',
      '    <div class="form-feedback" id="comment-feedback" hidden></div>',
      '    <label>Name<input type="text" name="name" maxlength="60" required /></label>',
      '    <label>Comment<textarea name="message" maxlength="500" rows="4" required></textarea></label>',
      '    <button class="button button-primary" type="submit">Submit Comment</button>',
      '  </form>',
      '</section>',
    ].join('');
  }

  function createBusinessCommentItem(comment) {
    const dateText = formatCommentDate(comment.createdAt);

    return [
      '<article class="profile-comment">',
      '  <div class="profile-comment-heading">',
      '    <strong>' + escapeHtml(comment.name) + '</strong>',
      dateText ? '    <span>' + escapeHtml(dateText) + '</span>' : '',
      '  </div>',
      '  <p>' + escapeHtml(comment.message) + '</p>',
      '</article>',
    ].join('');
  }

  function createAdminProofImages(business) {
    const images = [];

    if (business.profileImage) {
      images.push({
        url: business.profileImage,
        alt: business.name + ' profile picture',
      });
    }

    (Array.isArray(business.serviceImages) ? business.serviceImages : []).forEach(function (imageUrl, index) {
      images.push({
        url: imageUrl,
        alt: business.name + ' service photo ' + (index + 1),
      });
    });

    if (!images.length) {
      return '<div class="status-message">No photo proof uploaded yet.</div>';
    }

    return (
      '<div class="admin-proof-gallery">' +
      images
        .map(function (image) {
          return (
            '<a href="' +
            resolveAssetUrl(image.url) +
            '" target="_blank" rel="noreferrer">' +
            '<img src="' +
            resolveAssetUrl(image.url) +
            '" alt="' +
            escapeHtml(image.alt) +
            '" />' +
            '</a>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function createAdminReportCard(report) {
    const business = report.businessId || {};
    const createdAt = formatCommentDate(report.createdAt);
    const reportId = String(report._id || report.id || '');

    return [
      '<article class="admin-pending-card" data-admin-report-id="' + escapeHtml(reportId) + '">',
      '  <div>',
      '    <h3>' + escapeHtml(business.name || 'Reported business') + '</h3>',
      '    <div class="provider-tags">',
      '      <span class="tag">' + escapeHtml(report.status || 'pending') + '</span>',
      business.phoneVerified ? '      <span class="tag verified-badge">Phone verified</span>' : '',
      '    </div>',
      '  </div>',
      '  <div class="provider-meta">',
      '    <span><strong>Reason:</strong> ' + escapeHtml(report.reason) + '</span>',
      report.message ? '    <span><strong>Message:</strong> ' + escapeHtml(report.message) + '</span>' : '',
      '    <span><strong>Business phone:</strong> ' + escapeHtml(business.phone || 'Not available') + '</span>',
      report.reporterName ? '    <span><strong>Reporter:</strong> ' + escapeHtml(report.reporterName) + '</span>' : '',
      report.reporterContact ? '    <span><strong>Reporter contact:</strong> ' + escapeHtml(report.reporterContact) + '</span>' : '',
      createdAt ? '    <span><strong>Submitted:</strong> ' + escapeHtml(createdAt) + '</span>' : '',
      '  </div>',
      '  <div class="admin-action-row">',
      report.status === 'resolved'
        ? ''
        : '    <button class="button button-primary admin-report-action-button" type="button" data-admin-report-action="resolve">Mark Resolved</button>',
      '    <button class="button button-danger admin-report-action-button" type="button" data-admin-report-action="delete">Delete Report</button>',
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
      business.phoneVerified ? '      <span class="tag verified-badge">Phone verified</span>' : '',
      '    </div>',
      '  </div>',
      '  <div class="provider-meta">',
      '    <span><strong>Local Government:</strong> ' + escapeHtml(business.localGovernment) + '</span>',
      '    <span><strong>Phone:</strong> ' + escapeHtml(business.phone) + '</span>',
      '    <span><strong>Email:</strong> ' + escapeHtml(business.email || 'Not provided') + '</span>',
      '    <span><strong>Address:</strong> ' + escapeHtml(business.address) + '</span>',
      '    <span><strong>Payment reference:</strong> ' + escapeHtml(business.paymentReference || 'Not provided yet') + '</span>',
      '    <span><strong>Phone verification:</strong> ' + (business.phoneVerified ? 'Verified' : 'Not verified') + '</span>',
      '  </div>',
      '  <section class="profile-section"><h4>Photo proof</h4>' + createAdminProofImages(business) + '</section>',
      '  <div class="admin-action-row">',
      '    <button class="button button-primary admin-action-button" type="button" data-admin-action="verify-payment">Verify Payment</button>',
      business.phoneVerified
        ? ''
        : '    <button class="button button-secondary admin-action-button" type="button" data-admin-action="verify-phone">Verify Phone</button>',
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

  function ensureImageLightbox() {
    let lightbox = document.getElementById('profile-image-lightbox');

    if (lightbox) {
      return lightbox;
    }

    lightbox = document.createElement('div');
    lightbox.className = 'profile-lightbox';
    lightbox.id = 'profile-image-lightbox';
    lightbox.hidden = true;
    lightbox.innerHTML = [
      '<div class="profile-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Image preview">',
      '  <button class="profile-lightbox-close" type="button" aria-label="Close image preview">&times;</button>',
      '  <img src="" alt="" />',
      '</div>',
    ].join('');
    document.body.appendChild(lightbox);

    lightbox.addEventListener('click', function (event) {
      if (
        event.target === lightbox ||
        event.target.closest('.profile-lightbox-close')
      ) {
        closeImageLightbox();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !lightbox.hidden) {
        closeImageLightbox();
      }
    });

    return lightbox;
  }

  function openImageLightbox(src, alt) {
    const lightbox = ensureImageLightbox();
    const image = lightbox.querySelector('img');

    if (!image || !src) {
      return;
    }

    image.src = src;
    image.alt = alt || 'Image preview';
    lightbox.hidden = false;
    document.body.classList.add('has-open-lightbox');
  }

  function closeImageLightbox() {
    const lightbox = document.getElementById('profile-image-lightbox');

    if (!lightbox) {
      return;
    }

    lightbox.hidden = true;
    document.body.classList.remove('has-open-lightbox');
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

  async function fetchBusinessById(businessId) {
    if (isFileProtocol) {
      throw new Error(getLiveDataUnavailableMessage());
    }

    const response = await fetch(apiBaseUrl + '/' + encodeURIComponent(businessId));
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to load this business profile.');
    }

    return payload.data || null;
  }

  async function fetchBusinessOwnerStatus(businessId, reference) {
    if (isFileProtocol) {
      throw new Error(getLiveDataUnavailableMessage());
    }

    const url = new URL(
      apiBaseUrl + '/' + encodeURIComponent(businessId) + '/owner-status',
      window.location.origin
    );

    if (reference) {
      url.searchParams.set('reference', reference);
    }

    const response = await fetch(url.toString());
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to load your listing status.');
    }

    return payload;
  }

  async function postBusinessComment(businessId, name, message) {
    const response = await fetch(apiBaseUrl + '/' + encodeURIComponent(businessId) + '/comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: name, message: message }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to add comment.');
    }

    return payload.data || null;
  }

  async function submitBusinessReport(businessId, reportData) {
    const response = await fetch(apiBaseUrl + '/' + encodeURIComponent(businessId) + '/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reportData),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to submit report.');
    }

    return payload;
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

  async function loginOwner(identifier, password) {
    const response = await fetch(apiBaseUrl + '/owner/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier: identifier, password: password }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to log in.');
    }

    return payload;
  }

  async function fetchOwnerMe() {
    const response = await fetch(apiBaseUrl + '/owner/me', {
      headers: getOwnerAuthHeaders(),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Owner session expired.');
    }

    return payload.data || null;
  }

  async function forgotOwnerPassword(email) {
    const response = await fetch(apiBaseUrl + '/owner/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to send password reset link.');
    }

    return payload;
  }

  async function resetOwnerPassword(email, token, newPassword, confirmPassword) {
    const response = await fetch(apiBaseUrl + '/owner/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        token: token,
        newPassword: newPassword,
        confirmPassword: confirmPassword,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to reset password.');
    }

    return payload;
  }

  async function updateOwnerProfile(profileData) {
    const response = await fetch(apiBaseUrl + '/owner/profile', {
      method: 'PUT',
      headers: getOwnerAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(profileData),
    });
    const payload = await response.json();

    if (!response.ok) {
      const validationMessages = (payload.errors || [])
        .map(function (item) {
          return item.message;
        })
        .join(' ');
      throw new Error(validationMessages || payload.message || 'Unable to update business details.');
    }

    return payload.data || null;
  }

  async function updateOwnerPhotos(formData) {
    const response = await fetch(apiBaseUrl + '/owner/photos', {
      method: 'PATCH',
      headers: getOwnerAuthHeaders(),
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to update business photos.');
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

  async function fetchBusinessReports() {
    const response = await fetch(apiBaseUrl + '/admin/reports', {
      headers: getAdminAuthHeaders(),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to load reports.');
    }

    return payload.data || [];
  }

  async function resolveBusinessReport(reportId) {
    const response = await fetch(
      apiBaseUrl + '/admin/reports/' + encodeURIComponent(reportId) + '/resolve',
      {
        method: 'PATCH',
        headers: getAdminAuthHeaders(),
      }
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to resolve report.');
    }

    return payload;
  }

  async function deleteBusinessReport(reportId) {
    const response = await fetch(apiBaseUrl + '/admin/reports/' + encodeURIComponent(reportId), {
      method: 'DELETE',
      headers: getAdminAuthHeaders(),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to delete report.');
    }

    return payload;
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

  async function initializePayment(businessId) {
    const response = await fetch(
      paymentApiBaseUrl + '/initialize/' + encodeURIComponent(businessId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to initialize payment.');
    }

    if (!payload.authorization_url) {
      throw new Error('Payment gateway did not return a payment link.');
    }

    return payload.authorization_url;
  }

  async function verifyPaymentReference(reference) {
    const response = await fetch(paymentApiBaseUrl + '/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reference: reference }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to verify payment.');
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

  async function initializeBusinessProfilePage() {
    const profileNode = document.getElementById('business-profile');
    const statusNode = document.getElementById('business-profile-status');
    const searchParams = new URLSearchParams(window.location.search);
    const businessId = searchParams.get('id') || '';

    if (!profileNode || !statusNode) {
      return;
    }

    if (!businessId) {
      statusNode.textContent = 'Business profile link is missing an ID.';
      return;
    }

    try {
      const business = await fetchBusinessById(businessId);

      if (!business) {
        statusNode.textContent = 'Business profile was not found.';
        return;
      }

      statusNode.hidden = true;
      profileNode.innerHTML = createBusinessProfile(business);
      document.title = 'Maro Solution | ' + business.name;
    } catch (error) {
      statusNode.textContent = error.message;
    }

    profileNode.addEventListener('click', function (event) {
      const reportToggle = event.target.closest('#report-business-toggle');
      const lightboxTrigger = event.target.closest('.image-lightbox-trigger');

      if (reportToggle) {
        const reportSection = document.getElementById('report-business-section');

        if (reportSection) {
          reportSection.hidden = !reportSection.hidden;

          if (!reportSection.hidden) {
            const reasonInput = reportSection.querySelector('input[name="reason"]');
            if (reasonInput) {
              reasonInput.focus();
            }
          }
        }
        return;
      }

      if (lightboxTrigger) {
        openImageLightbox(
          lightboxTrigger.dataset.lightboxSrc || '',
          lightboxTrigger.dataset.lightboxAlt || ''
        );
      }
    });

    profileNode.addEventListener('submit', async function (event) {
      const reportForm = event.target.closest('#report-business-form');
      const form = event.target.closest('#comment-form');

      if (!form && !reportForm) {
        return;
      }

      event.preventDefault();

      if (reportForm) {
        const feedback = document.getElementById('report-feedback');
        const submitButton = reportForm.querySelector('button[type="submit"]');
        const formData = new FormData(reportForm);
        const reason = String(formData.get('reason') || '').trim();
        const message = String(formData.get('message') || '').trim();
        const reporterName = String(formData.get('reporterName') || '').trim();
        const reporterContact = String(formData.get('reporterContact') || '').trim();

        if (feedback) {
          feedback.hidden = true;
          feedback.className = 'form-feedback';
        }

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Submitting...';
        }

        try {
          const payload = await submitBusinessReport(businessId, {
            reason: reason,
            message: message,
            reporterName: reporterName,
            reporterContact: reporterContact,
          });

          reportForm.reset();

          if (feedback) {
            feedback.hidden = false;
            feedback.classList.add('success');
            feedback.textContent = payload.message || 'Report submitted.';
          }
        } catch (error) {
          if (feedback) {
            feedback.hidden = false;
            feedback.classList.add('error');
            feedback.textContent = error.message;
          }
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Report';
          }
        }
        return;
      }

      const feedback = document.getElementById('comment-feedback');
      const submitButton = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);
      const name = String(formData.get('name') || '').trim();
      const message = String(formData.get('message') || '').trim();

      if (feedback) {
        feedback.hidden = true;
        feedback.className = 'form-feedback';
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
      }

      try {
        const comment = await postBusinessComment(businessId, name, message);
        const commentsList = document.getElementById('profile-comments-list');

        if (commentsList && comment) {
          if (commentsList.querySelector('.status-message')) {
            commentsList.innerHTML = '';
          }

          commentsList.insertAdjacentHTML('beforeend', createBusinessCommentItem(comment));
        }

        form.reset();

        if (feedback) {
          feedback.hidden = false;
          feedback.classList.add('success');
          feedback.textContent = 'Comment submitted successfully.';
        }
      } catch (error) {
        if (feedback) {
          feedback.hidden = false;
          feedback.classList.add('error');
          feedback.textContent = error.message;
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Submit Comment';
        }
      }
    });
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
    const adminReportsRefresh = document.getElementById('admin-reports-refresh');
    const adminPendingMeta = document.getElementById('admin-pending-meta');
    const adminPendingList = document.getElementById('admin-pending-list');
    const adminReportsMeta = document.getElementById('admin-reports-meta');
    const adminReportList = document.getElementById('admin-report-list');
    const searchParams = new URLSearchParams(window.location.search);
    const paymentReference = searchParams.get('reference') || searchParams.get('trxref') || '';
    const shouldVerifyPayment = searchParams.get('payment') === 'success' || Boolean(paymentReference);
    let currentAdmin = null;
    let isAdminPanelOpen = isAdminLoggedIn();
    let paymentReturnMessage = null;
    let ownerStatusMessage = null;

    populateSelect(categorySelect, appData.businessCategories, 'All categories');
    wireStateAndLgaSelects(stateSelect, lgaSelect, 'All local governments');

    categorySelect.value = searchParams.get('category') || '';
    stateSelect.value = searchParams.get('state') || '';
    stateSelect.dispatchEvent(new Event('change'));
    lgaSelect.value = searchParams.get('localGovernment') || '';
    keywordInput.value = searchParams.get('keyword') || '';

    function ensurePaymentReturnMessage() {
      if (paymentReturnMessage) {
        return paymentReturnMessage;
      }

      paymentReturnMessage = document.createElement('div');
      paymentReturnMessage.className = 'status-message';
      paymentReturnMessage.hidden = true;
      filterForm.parentNode.insertBefore(paymentReturnMessage, resultsMeta);
      return paymentReturnMessage;
    }

    function setPaymentReturnMessage(message, isError) {
      const messageNode = ensurePaymentReturnMessage();
      messageNode.hidden = !message;
      messageNode.className = 'status-message' + (isError ? ' error' : ' success');
      messageNode.textContent = message || '';
    }

    function ensureOwnerStatusMessage() {
      if (ownerStatusMessage) {
        return ownerStatusMessage;
      }

      ownerStatusMessage = document.createElement('div');
      ownerStatusMessage.className = 'status-message owner-listing-status';
      ownerStatusMessage.hidden = true;
      filterForm.parentNode.insertBefore(ownerStatusMessage, resultsMeta);
      return ownerStatusMessage;
    }

    function setOwnerListingStatusMessage(payload) {
      const statusData = payload && payload.data ? payload.data : null;
      const messageNode = ensureOwnerStatusMessage();

      if (!statusData) {
        messageNode.hidden = true;
        messageNode.textContent = '';
        return;
      }

      const isApproved = statusData.status === 'approved' && statusData.paymentStatus === 'verified';
      const isPendingReview =
        statusData.status === 'pending' && statusData.paymentStatus === 'verified';

      if (!isApproved && !isPendingReview) {
        messageNode.hidden = true;
        messageNode.textContent = '';
        return;
      }

      messageNode.hidden = false;
      messageNode.className = 'status-message owner-listing-status' + (isApproved ? ' success' : '');

      const profileLink = isApproved
        ? ' <a class="text-link" href="' +
          pagePaths.business +
          '?id=' +
          encodeURIComponent(statusData.id || statusData._id) +
          '">View your live listing</a>'
        : '';

      messageNode.innerHTML = escapeHtml(payload.message || '') + profileLink;
    }

    async function loadTrackedOwnerListingStatus() {
      const trackedListing = getTrackedOwnerListing();
      const trackedBusinessId = getTrackedOwnerBusinessId(trackedListing);

      if (!trackedBusinessId) {
        return;
      }

      try {
        const payload = await fetchBusinessOwnerStatus(
          trackedBusinessId,
          trackedListing.paymentReference || ''
        );
        setOwnerListingStatusMessage(payload);
      } catch (error) {
        const messageNode = ensureOwnerStatusMessage();
        messageNode.hidden = true;
        messageNode.textContent = '';
      }
    }

    async function verifyPaymentFromReturnUrl() {
      if (!shouldVerifyPayment) {
        return;
      }

      if (!paymentReference) {
        setPaymentReturnMessage(
          'Payment reference was not found in the return URL. Please contact support if you completed payment.',
          true
        );
        return;
      }

      setPaymentReturnMessage('Verifying Paystack payment...', false);

      try {
        const payload = await verifyPaymentReference(paymentReference);
        const business = payload.data || {};
        const businessId = business._id || business.id || getTrackedOwnerBusinessId(getTrackedOwnerListing());

        if (businessId) {
          saveTrackedOwnerListing({
            businessId: String(businessId),
            paymentReference: paymentReference,
            status: business.status || 'pending',
            paymentStatus: business.paymentStatus || 'verified',
          });
        }

        setPaymentReturnMessage(
          payload.message || 'Payment verified. Your listing is pending admin approval.',
          false
        );
      } catch (error) {
        setPaymentReturnMessage(error.message || 'Unable to verify payment.', true);
      } finally {
        searchParams.delete('payment');
        searchParams.delete('reference');
        searchParams.delete('trxref');
        window.history.replaceState(
          {},
          '',
          pagePaths.listings + (searchParams.toString() ? '?' + searchParams.toString() : '')
        );
      }
    }

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

      if (adminReportsRefresh) {
        adminReportsRefresh.hidden = !adminEnabled;
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

      if (adminReportsMeta && !adminEnabled) {
        adminReportsMeta.textContent = 'Log in to view reports.';
      }

      if (adminReportList && !adminEnabled) {
        adminReportList.innerHTML = '';
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

    async function loadReportQueue() {
      if (!adminReportsMeta || !adminReportList || !isAdminLoggedIn()) {
        return;
      }

      adminReportsMeta.textContent = 'Loading reports...';
      adminReportList.innerHTML = '';

      try {
        const reports = await fetchBusinessReports();

        if (!reports.length) {
          adminReportsMeta.textContent = 'No business reports yet.';
          return;
        }

        adminReportsMeta.textContent =
          reports.length + ' report' + (reports.length === 1 ? '' : 's') + ' submitted.';
        adminReportList.innerHTML = reports.map(createAdminReportCard).join('');
      } catch (error) {
        adminReportsMeta.textContent = error.message;
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
          loadReportQueue();
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
          await loadReportQueue();
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

    if (adminReportsRefresh) {
      adminReportsRefresh.addEventListener('click', loadReportQueue);
    }

    if (adminReportList) {
      adminReportList.addEventListener('click', async function (event) {
        const actionButton = event.target.closest('.admin-report-action-button');

        if (!actionButton) {
          return;
        }

        const card = actionButton.closest('[data-admin-report-id]');
        const reportId = card ? card.dataset.adminReportId : '';
        const action = actionButton.dataset.adminReportAction;

        if (!reportId || !action || !isAdminLoggedIn()) {
          refreshAdminButton();
          return;
        }

        if (action === 'delete') {
          const shouldDelete = window.confirm('Delete this report permanently?');
          if (!shouldDelete) {
            return;
          }
        }

        actionButton.disabled = true;
        actionButton.textContent = action === 'delete' ? 'Deleting...' : 'Resolving...';

        try {
          if (action === 'delete') {
            await deleteBusinessReport(reportId);
          } else {
            await resolveBusinessReport(reportId);
          }

          await loadReportQueue();
        } catch (error) {
          window.alert(error.message);
          actionButton.disabled = false;
          actionButton.textContent = action === 'delete' ? 'Delete Report' : 'Mark Resolved';
        }
      });
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
        await loadReportQueue();
      } catch (error) {
        window.alert(error.message);
        deleteButton.disabled = false;
        deleteButton.textContent = 'Delete';
      }
    }

    listingsGrid.addEventListener('click', async function (event) {
      const deleteButton = event.target.closest('.admin-delete-button');

      if (deleteButton) {
        handleAdminDeleteClick(deleteButton);
        return;
      }

      const actionButton = event.target.closest('.admin-listing-action-button');

      if (!actionButton) {
        return;
      }

      const businessId = actionButton.dataset.adminBusinessId;
      const action = actionButton.dataset.adminListingAction;

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
        await loadReportQueue();
        await runSearch();
      } catch (error) {
        window.alert(error.message);
        actionButton.disabled = false;
        actionButton.textContent = action.replace('-', ' ');
      }
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
          await loadReportQueue();
          await runSearch();
        } catch (error) {
          window.alert(error.message);
          actionButton.disabled = false;
          actionButton.textContent = action.replace('-', ' ');
        }
      });
    }

    async function initializeListingsData() {
      await verifyPaymentFromReturnUrl();
      await loadTrackedOwnerListingStatus();
      refreshAdminButton();

      if (isAdminLoggedIn()) {
        try {
          currentAdmin = await fetchCurrentAdmin();
          refreshAdminButton();
          await loadPendingQueue();
          await loadReportQueue();
          await runSearch();
        } catch (error) {
          sessionStorage.removeItem(adminJwtStorageKey);
          currentAdmin = null;
          refreshAdminButton();
          await runSearch();
        }
        return;
      }

      await runSearch();
    }

    initializeListingsData();
  }

  function initializeAddBusinessPage() {
    const form = document.getElementById('business-form');
    const feedback = document.getElementById('form-feedback');
    const submitButton = document.getElementById('submit-button');
    const submissionLoading = document.getElementById('submission-loading');
    const imageInput = document.getElementById('profile-image');
    const serviceImagesInput = document.getElementById('service-images');
    const previewNode = document.getElementById('image-preview');
    const serviceImagesPreviewNode = document.getElementById('service-images-preview');
    const paymentInstructions = document.getElementById('payment-instructions');
    const submittedPaymentReference = document.getElementById('submitted-payment-reference');
    const payListingFeeButton = document.getElementById('pay-listing-fee');
    let submittedBusinessId = '';
    let profilePreviewUrl = '';

    function setSubmissionLoading(isLoading) {
      if (submissionLoading) {
        submissionLoading.hidden = !isLoading;
      }
    }

    populateSelect(document.getElementById('business-category'), appData.businessCategories, 'Select category');
    wireStateAndLgaSelects(
      document.getElementById('business-state'),
      document.getElementById('business-local-government'),
      'Select local government'
    );

    imageInput.addEventListener('change', function () {
      const file = imageInput.files && imageInput.files[0];

      if (profilePreviewUrl) {
        URL.revokeObjectURL(profilePreviewUrl);
        profilePreviewUrl = '';
      }

      if (!file) {
        previewNode.textContent = 'No image selected yet.';
        return;
      }

      profilePreviewUrl = URL.createObjectURL(file);
      previewNode.innerHTML =
        '<img class="upload-preview-image" src="' +
        profilePreviewUrl +
        '" alt="Selected profile picture preview" /><span>Selected image: ' +
        escapeHtml(file.name) +
        '</span>';
    });

    if (serviceImagesInput && serviceImagesPreviewNode) {
      serviceImagesInput.addEventListener('change', function () {
        const files = Array.from(serviceImagesInput.files || []);

        if (files.length > 3) {
          serviceImagesInput.value = '';
          serviceImagesPreviewNode.textContent = 'Please choose up to 3 service photos.';
          return;
        }

        serviceImagesPreviewNode.textContent = files.length
          ? 'Selected service photos: ' +
            files
              .map(function (file) {
                return file.name;
              })
              .join(', ')
          : 'No service photos selected yet.';
      });
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      feedback.hidden = true;
      feedback.className = 'form-feedback';
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';
      setSubmissionLoading(true);

      if (isFileProtocol) {
        setSubmissionLoading(false);
        feedback.hidden = false;
        feedback.classList.add('error');
        feedback.textContent =
          'Form submission needs the backend server running. Open the site through the Node.js server to add a business.';
        submitButton.disabled = false;
        submitButton.textContent = 'Add Business';
        return;
      }

      try {
        if (serviceImagesInput && serviceImagesInput.files && serviceImagesInput.files.length > 3) {
          throw new Error('Please choose up to 3 service photos.');
        }

        const formData = new FormData(form);
        const password = String(formData.get('password') || '');
        const confirmPassword = String(formData.get('confirmPassword') || '');

        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        if (password !== confirmPassword) {
          throw new Error('Confirm password must match password.');
        }

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
          submittedPaymentReference.hidden = false;
          submittedPaymentReference.textContent =
            'Business submitted. Proceed to payment to complete your listing.';
        }

        submittedBusinessId =
          payload.data && (payload.data._id || payload.data.id)
            ? String(payload.data._id || payload.data.id)
            : '';

        if (submittedBusinessId) {
          saveTrackedOwnerListing({
            businessId: submittedBusinessId,
            status: (payload.data && payload.data.status) || 'pending',
            paymentStatus: (payload.data && payload.data.paymentStatus) || 'unpaid',
            paymentReference: '',
          });
        }

        form.hidden = true;
        form.reset();
        if (profilePreviewUrl) {
          URL.revokeObjectURL(profilePreviewUrl);
          profilePreviewUrl = '';
        }
        previewNode.textContent = 'No image selected yet.';
        if (serviceImagesPreviewNode) {
          serviceImagesPreviewNode.textContent = 'No service photos selected yet.';
        }
      } catch (error) {
        feedback.hidden = false;
        feedback.classList.add('error');
        feedback.textContent = error.message;
      } finally {
        setSubmissionLoading(false);
        submitButton.disabled = false;
        submitButton.textContent = 'Add Business';
      }
    });

    if (payListingFeeButton) {
      payListingFeeButton.addEventListener('click', async function () {
        if (!submittedBusinessId) {
          if (submittedPaymentReference) {
            submittedPaymentReference.hidden = false;
            submittedPaymentReference.classList.add('error');
            submittedPaymentReference.textContent =
              'Business ID was not returned. Please submit the form again.';
          }
          return;
        }

        payListingFeeButton.disabled = true;
        payListingFeeButton.textContent = 'Opening Paystack...';

        if (submittedPaymentReference) {
          submittedPaymentReference.hidden = false;
          submittedPaymentReference.classList.remove('error');
          submittedPaymentReference.textContent = 'Preparing secure Paystack payment...';
        }

        try {
          saveTrackedOwnerListing({
            businessId: submittedBusinessId,
            status: 'pending',
            paymentStatus: 'initialized',
          });
          const authorizationUrl = await initializePayment(submittedBusinessId);
          window.location.href = authorizationUrl;
        } catch (error) {
          payListingFeeButton.disabled = false;
          payListingFeeButton.textContent = 'Pay Listing Fee';

          if (submittedPaymentReference) {
            submittedPaymentReference.hidden = false;
            submittedPaymentReference.classList.add('error');
            submittedPaymentReference.textContent = error.message;
          }
        }
      });
    }
  }

  function initializeDashboardPage() {
    const authPanel = document.getElementById('owner-auth-panel');
    const dashboardPanel = document.getElementById('owner-dashboard-panel');
    const authFeedback = document.getElementById('owner-auth-feedback');
    const dashboardFeedback = document.getElementById('owner-dashboard-feedback');
    const loginForm = document.getElementById('owner-login-form');
    const forgotForm = document.getElementById('owner-forgot-form');
    const resetForm = document.getElementById('owner-reset-form');
    const showForgotButton = document.getElementById('show-forgot-password');
    const showLoginButton = document.getElementById('show-owner-login');
    const logoutButton = document.getElementById('owner-logout');
    const profileForm = document.getElementById('owner-profile-form');
    const photosForm = document.getElementById('owner-photos-form');
    const summaryNode = document.getElementById('owner-dashboard-summary');
    const businessNameNode = document.getElementById('owner-business-name');
    const categorySelect = document.getElementById('dashboard-category');
    const stateSelect = document.getElementById('dashboard-state');
    const lgaSelect = document.getElementById('dashboard-local-government');
    const profileImageInput = document.getElementById('dashboard-profile-image');
    const serviceImagesInput = document.getElementById('dashboard-service-images');
    const profilePreview = document.getElementById('dashboard-profile-preview');
    const servicePreview = document.getElementById('dashboard-service-preview');
    const searchParams = new URLSearchParams(window.location.search);
    const resetToken = searchParams.get('resetToken') || '';
    const resetEmail = searchParams.get('email') || '';
    let currentBusiness = null;
    let dashboardProfilePreviewUrl = '';

    if (!authPanel || !dashboardPanel) {
      return;
    }

    populateSelect(categorySelect, appData.businessCategories, 'Select category');
    wireStateAndLgaSelects(stateSelect, lgaSelect, 'Select local government');

    function setFeedback(node, message, isError) {
      if (!node) {
        return;
      }

      node.hidden = !message;
      node.className = 'form-feedback';
      if (message) {
        node.classList.add(isError ? 'error' : 'success');
        node.textContent = message;
      }
    }

    function showAuthView(viewName) {
      authPanel.hidden = false;
      dashboardPanel.hidden = true;
      loginForm.hidden = viewName !== 'login';
      forgotForm.hidden = viewName !== 'forgot';
      resetForm.hidden = viewName !== 'reset';
      setFeedback(authFeedback, '', false);
    }

    function showDashboard() {
      authPanel.hidden = true;
      dashboardPanel.hidden = false;
      setFeedback(dashboardFeedback, '', false);
    }

    function createDashboardSummary(business) {
      const profileImage = business.profileImage
        ? '<img src="' + resolveAssetUrl(business.profileImage) + '" alt="' + escapeHtml(business.name) + ' profile photo" />'
        : '<span>' + escapeHtml(firstLetterFromName(business.name)) + '</span>';
      const serviceImages = Array.isArray(business.serviceImages) ? business.serviceImages : [];
      const serviceImageMarkup = serviceImages.length
        ? serviceImages
            .map(function (imageUrl, index) {
              return (
                '<img src="' +
                resolveAssetUrl(imageUrl) +
                '" alt="' +
                escapeHtml(business.name + ' service photo ' + (index + 1)) +
                '" />'
              );
            })
            .join('')
        : '<div class="status-message">No service photos yet.</div>';

      return [
        '<div class="dashboard-photo-shell"><div class="provider-avatar">' + profileImage + '</div></div>',
        '<dl class="payment-details dashboard-details">',
        '<div><dt>Category</dt><dd>' + escapeHtml(business.category) + '</dd></div>',
        '<div><dt>State</dt><dd>' + escapeHtml(business.state) + '</dd></div>',
        '<div><dt>Local Government</dt><dd>' + escapeHtml(business.localGovernment) + '</dd></div>',
        '<div><dt>Phone</dt><dd>' + escapeHtml(business.phone) + '</dd></div>',
        '<div><dt>Email</dt><dd>' + escapeHtml(business.email) + '</dd></div>',
        '<div><dt>Address</dt><dd>' + escapeHtml(business.address) + '</dd></div>',
        '<div><dt>Service Description</dt><dd>' + escapeHtml(business.serviceDescription || 'Not provided') + '</dd></div>',
        '<div><dt>Experience</dt><dd>' + escapeHtml(String(business.yearsExperience || 0)) + ' years</dd></div>',
        '<div><dt>Status</dt><dd>' + escapeHtml(business.status) + '</dd></div>',
        '<div><dt>Payment</dt><dd>' + escapeHtml(business.paymentStatus) + '</dd></div>',
        '<div><dt>Verified Badge</dt><dd>' + (shouldShowVerifiedBadge(business) ? 'Visible' : 'Not visible') + '</dd></div>',
        '</dl>',
        '<div class="service-gallery dashboard-service-gallery">' + serviceImageMarkup + '</div>',
      ].join('');
    }

    function fillProfileForm(business) {
      profileForm.elements.name.value = business.name || '';
      categorySelect.value = business.category || '';
      stateSelect.value = business.state || '';
      stateSelect.dispatchEvent(new Event('change'));
      lgaSelect.value = business.localGovernment || '';
      profileForm.elements.phone.value = business.phone || '';
      profileForm.elements.email.value = business.email || '';
      profileForm.elements.address.value = business.address || '';
      profileForm.elements.serviceDescription.value = business.serviceDescription || '';
      profileForm.elements.yearsExperience.value = business.yearsExperience || 0;
    }

    function renderDashboard(business) {
      currentBusiness = business;
      businessNameNode.textContent = business.name || 'Business details';
      summaryNode.innerHTML = createDashboardSummary(business);
      fillProfileForm(business);
      showDashboard();
    }

    async function loadOwnerDashboard() {
      try {
        const business = await fetchOwnerMe();
        renderDashboard(business);
      } catch (error) {
        sessionStorage.removeItem(ownerJwtStorageKey);
        showAuthView(resetToken ? 'reset' : 'login');
        setFeedback(authFeedback, error.message, true);
      }
    }

    if (resetToken) {
      showAuthView('reset');
      if (resetForm.elements.email) {
        resetForm.elements.email.value = resetEmail;
      }
    } else if (getSavedOwnerJwt()) {
      loadOwnerDashboard();
    } else {
      showAuthView('login');
    }

    showForgotButton.addEventListener('click', function () {
      showAuthView('forgot');
    });

    showLoginButton.addEventListener('click', function () {
      showAuthView('login');
    });

    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const submitButton = document.getElementById('owner-login-submit');
      const formData = new FormData(loginForm);

      submitButton.disabled = true;
      submitButton.textContent = 'Logging in...';
      setFeedback(authFeedback, '', false);

      try {
        const payload = await loginOwner(
          String(formData.get('identifier') || '').trim(),
          String(formData.get('password') || '')
        );
        sessionStorage.setItem(ownerJwtStorageKey, payload.token || '');
        loginForm.reset();
        renderDashboard(payload.data);
      } catch (error) {
        sessionStorage.removeItem(ownerJwtStorageKey);
        setFeedback(authFeedback, error.message, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Log In';
      }
    });

    forgotForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const submitButton = document.getElementById('owner-forgot-submit');
      const formData = new FormData(forgotForm);

      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
      setFeedback(authFeedback, '', false);

      try {
        const payload = await forgotOwnerPassword(String(formData.get('email') || '').trim());
        forgotForm.reset();
        setFeedback(authFeedback, payload.message || 'Password reset link sent if the account exists.', false);
      } catch (error) {
        setFeedback(authFeedback, error.message, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Send Reset Link';
      }
    });

    resetForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const submitButton = document.getElementById('owner-reset-submit');
      const formData = new FormData(resetForm);
      const newPassword = String(formData.get('newPassword') || '');
      const confirmPassword = String(formData.get('confirmPassword') || '');

      submitButton.disabled = true;
      submitButton.textContent = 'Resetting...';
      setFeedback(authFeedback, '', false);

      try {
        if (newPassword.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        if (newPassword !== confirmPassword) {
          throw new Error('Confirm password must match password.');
        }

        const payload = await resetOwnerPassword(
          String(formData.get('email') || '').trim(),
          resetToken,
          newPassword,
          confirmPassword
        );
        resetForm.reset();
        showAuthView('login');
        setFeedback(authFeedback, payload.message || 'Password reset successful. You can now log in.', false);
      } catch (error) {
        setFeedback(authFeedback, error.message, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Reset Password';
      }
    });

    profileForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const submitButton = document.getElementById('owner-profile-submit');
      const formData = new FormData(profileForm);
      const profileData = Object.fromEntries(formData.entries());

      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
      setFeedback(dashboardFeedback, '', false);

      try {
        const business = await updateOwnerProfile(profileData);
        renderDashboard(business);
        setFeedback(dashboardFeedback, 'Business details updated successfully.', false);
      } catch (error) {
        setFeedback(dashboardFeedback, error.message, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Details';
      }
    });

    if (profileImageInput && profilePreview) {
      profileImageInput.addEventListener('change', function () {
        const file = profileImageInput.files && profileImageInput.files[0];

        if (dashboardProfilePreviewUrl) {
          URL.revokeObjectURL(dashboardProfilePreviewUrl);
          dashboardProfilePreviewUrl = '';
        }

        if (!file) {
          profilePreview.textContent = 'No new profile photo selected.';
          return;
        }

        dashboardProfilePreviewUrl = URL.createObjectURL(file);
        profilePreview.innerHTML =
          '<img class="upload-preview-image" src="' +
          dashboardProfilePreviewUrl +
          '" alt="Selected profile picture preview" /><span>Selected image: ' +
          escapeHtml(file.name) +
          '</span>';
      });
    }

    if (serviceImagesInput && servicePreview) {
      serviceImagesInput.addEventListener('change', function () {
        const files = Array.from(serviceImagesInput.files || []);

        if (files.length > 3) {
          serviceImagesInput.value = '';
          servicePreview.textContent = 'Please choose up to 3 service photos.';
          return;
        }

        servicePreview.textContent = files.length
          ? 'Selected service photos: ' +
            files
              .map(function (file) {
                return file.name;
              })
              .join(', ')
          : 'No new service photos selected.';
      });
    }

    photosForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const submitButton = document.getElementById('owner-photos-submit');

      if (serviceImagesInput && serviceImagesInput.files && serviceImagesInput.files.length > 3) {
        setFeedback(dashboardFeedback, 'Please choose up to 3 service photos.', true);
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
      setFeedback(dashboardFeedback, '', false);

      try {
        const business = await updateOwnerPhotos(new FormData(photosForm));
        photosForm.reset();
        profilePreview.textContent = 'No new profile photo selected.';
        servicePreview.textContent = 'No new service photos selected.';
        if (dashboardProfilePreviewUrl) {
          URL.revokeObjectURL(dashboardProfilePreviewUrl);
          dashboardProfilePreviewUrl = '';
        }
        renderDashboard(business || currentBusiness);
        setFeedback(dashboardFeedback, 'Business photos updated successfully.', false);
      } catch (error) {
        setFeedback(dashboardFeedback, error.message, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Photos';
      }
    });

    logoutButton.addEventListener('click', function () {
      sessionStorage.removeItem(ownerJwtStorageKey);
      currentBusiness = null;
      showAuthView('login');
      setFeedback(authFeedback, 'Logged out.', false);
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

  if (page === 'business') {
    initializeBusinessProfilePage();
  }

  if (page === 'add-business') {
    initializeAddBusinessPage();
  }

  if (page === 'dashboard') {
    initializeDashboardPage();
  }
})();
