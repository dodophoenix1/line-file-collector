// LINE File Collector Client-side Application

// State
let filesData = {
  documents: [],
  images: [],
  videos: [],
  others: []
};
let serverStatus = null;
let currentTab = 'documents';
let searchQuery = '';
let fileToDelete = null; // { category, filename }

// Admin Authentication State. Authentication is held in HttpOnly cookies; no password is stored in JavaScript.
let isAdmin = false;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const safeUrl = (value) => {
  if (!value) return '';
  try {
    const parsed = new URL(String(value), window.location.origin);
    const allowedExternal = parsed.hostname === 'drive.google.com'
      || parsed.hostname.endsWith('.google.com')
      || parsed.hostname.endsWith('.googleusercontent.com')
      || parsed.hostname.endsWith('.unsplash.com');
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.origin !== window.location.origin && !allowedExternal) return '';
    return parsed.href;
  } catch {
    return '';
  }
};

const safeJsString = (value) => escapeHtml(JSON.stringify(String(value ?? '')));

// Helper to get large thumbnail from Google Drive thumbnail URL
const getLargeThumbnail = (url) => {
  if (!url) return '';
  return url.replace(/=s\d+$/, '=s1000');
};

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const panes = document.querySelectorAll('.pane');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const refreshBtn = document.getElementById('refresh-data-btn');
const toolbar = document.getElementById('dashboard-toolbar');

// Warning Banner Elements
const configWarningBanner = document.getElementById('config-warning-banner');
const hideWarningBtn = document.getElementById('hide-warning-btn');

// Stats Elements
const statTotalFiles = document.getElementById('stat-total-files');
const statProcessedCount = document.getElementById('stat-processed-count');
const statTotalSize = document.getElementById('stat-total-size');
const statWebhookCalls = document.getElementById('stat-webhook-calls');
const statLastCall = document.getElementById('stat-last-call');
const statUptime = document.getElementById('stat-uptime');
const statPort = document.getElementById('stat-port');

// Status Pill Elements
const lineStatusDot = document.getElementById('status-dot');
const lineStatusText = document.getElementById('status-text-pill');

const driveStatusDot = document.getElementById('drive-status-dot');
const driveStatusText = document.getElementById('drive-status-text');

// Admin Login UI Elements
const adminLoginPillBtn = document.getElementById('admin-login-pill-btn');
const adminStatusText = document.getElementById('admin-status-text');
const adminLockDot = document.getElementById('admin-lock-dot');
const adminLoginModal = document.getElementById('admin-login-modal');
const adminLoginForm = document.getElementById('admin-login-form');
const adminPasswordInput = document.getElementById('admin-password-input');
const loginErrorMessage = document.getElementById('login-error-message');
const cancelLoginBtn = document.getElementById('cancel-login-btn');
const changeTeacherPinBtn = document.getElementById('change-teacher-pin-btn');
const teacherPinModal = document.getElementById('teacher-pin-modal');
const teacherPinForm = document.getElementById('teacher-pin-form');
const teacherPinInput = document.getElementById('teacher-pin-input');
const teacherPinMessage = document.getElementById('teacher-pin-message');
const cancelTeacherPinBtn = document.getElementById('cancel-teacher-pin-btn');

// Lightbox Elements
const imgLightbox = document.getElementById('image-lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxImgTitle = document.getElementById('lightbox-img-title');
const lightboxImgActions = document.getElementById('lightbox-img-actions-container');
const closeLightboxBtn = document.getElementById('close-lightbox-btn');

const vidLightbox = document.getElementById('video-player-modal');
const previewVideoElement = document.getElementById('preview-video-element');
const lightboxVidTitle = document.getElementById('lightbox-vid-title');
const lightboxVidActions = document.getElementById('lightbox-vid-actions-container');
const closeVideoBtn = document.getElementById('close-video-btn');

// Confirm Delete Elements
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deleteFileDisplayName = document.getElementById('delete-file-display-name');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Helper to determine file icon based on extension
const getFileIconClass = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'pdf':
      return { icon: 'fa-file-pdf pdf-icon', label: 'PDF' };
    case 'doc':
    case 'docx':
    case 'odt':
      return { icon: 'fa-file-word word-icon', label: 'Word' };
    case 'xls':
    case 'xlsx':
    case 'ods':
    case 'csv':
      return { icon: 'fa-file-excel excel-icon', label: 'Excel' };
    case 'ppt':
    case 'pptx':
    case 'odp':
      return { icon: 'fa-file-powerpoint powerpoint-icon', label: 'PowerPoint' };
    case 'txt':
    case 'rtf':
    case 'log':
      return { icon: 'fa-file-lines text-icon', label: 'Text' };
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return { icon: 'fa-file-zipper zip-icon', label: 'Archive' };
    case 'mp3':
    case 'wav':
    case 'm4a':
    case 'ogg':
    case 'aac':
      return { icon: 'fa-file-audio audio-icon', label: 'Audio' };
    default:
      return { icon: 'fa-file text-icon', label: 'File' };
  }
};

// Formatter for relative timestamps
const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'เมื่อครู่นี้';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
  
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' น.';
};

// Fetch data from Server
const fetchDashboardData = async () => {
  const refreshIcon = refreshBtn.querySelector('i');
  refreshIcon.classList.add('rotating');
  
  try {
    // 1. Fetch Status
    const statusRes = await fetch('/api/status', { credentials: 'same-origin' });
    if (statusRes.status === 401) {
      document.getElementById('pin-lock-overlay').classList.remove('fade-out');
      return;
    }
    const statusData = await statusRes.json();
    if (statusData.success) {
      serverStatus = statusData.status;
      updateStatusUI();
    }
    
    // 2. Fetch Files
    const filesRes = await fetch('/api/files', { credentials: 'same-origin' });
    if (filesRes.status === 401) {
      document.getElementById('pin-lock-overlay').classList.remove('fade-out');
      return;
    }
    const filesJson = await filesRes.json();
    if (filesJson.success) {
      filesData = filesJson.files;
      renderAllPanes();
      updateBadgeCounts();
    }
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    lineStatusDot.className = 'pulse-dot';
    lineStatusText.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์';
    driveStatusDot.className = 'pulse-dot';
    driveStatusText.textContent = 'การเชื่อมต่อผิดพลาด';
  } finally {
    setTimeout(() => {
      refreshIcon.classList.remove('rotating');
    }, 400);
  }
};

// Update Status indicators
let uptimeSeconds = 0;
let uptimeInterval = null;

const updateStatusUI = () => {
  if (!serverStatus) return;
  
  // LINE Webhook Pill
  if (serverStatus.lineConfigured) {
    lineStatusDot.className = 'pulse-dot active';
    lineStatusText.textContent = 'LINE: เชื่อมต่อแล้ว';
    configWarningBanner.classList.add('hidden');
  } else {
    lineStatusDot.className = 'pulse-dot warning';
    lineStatusText.textContent = 'LINE: โหมดทดสอบ';
    configWarningBanner.classList.remove('hidden');
  }

  // Google Drive Pill
  if (serverStatus.googleDriveConnected) {
    driveStatusDot.className = 'pulse-dot active';
    driveStatusText.textContent = 'Drive: เชื่อมต่อแล้ว';
  } else {
    driveStatusDot.className = 'pulse-dot';
    driveStatusText.textContent = 'Drive: ปิดใช้งาน';
  }
  
  // Stats
  statTotalFiles.textContent = serverStatus.totalFiles;
  statProcessedCount.textContent = `ประมวลผลแล้ว ${serverStatus.totalProcessed} รายการ`;
  statTotalSize.textContent = serverStatus.totalSizeFormatted;
  statWebhookCalls.textContent = serverStatus.webhookCalls;
  
  if (serverStatus.lastEventTime) {
    statLastCall.textContent = `ล่าสุด: ${formatRelativeTime(serverStatus.lastEventTime)}`;
  } else {
    statLastCall.textContent = 'ยังไม่มีสัญญาณเข้ามา';
  }
  
  statPort.textContent = `พอร์ตเซิร์ฟเวอร์: ${serverStatus.port}`;
  
  // Uptime management
  uptimeSeconds = Math.floor(serverStatus.uptime);
  if (uptimeInterval) clearInterval(uptimeInterval);
  
  const renderUptime = () => {
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    
    const hDisplay = hours.toString();
    const mDisplay = minutes.toString().padStart(2, '0');
    const sDisplay = seconds.toString().padStart(2, '0');
    
    statUptime.textContent = `${hDisplay}:${mDisplay}:${sDisplay}`;
  };
  
  renderUptime();
  uptimeInterval = setInterval(() => {
    uptimeSeconds++;
    renderUptime();
  }, 1000);
};

// Update Admin Pill UI
const updateAdminUI = () => {
  const guideTab = document.getElementById('tab-guide');
  if (isAdmin) {
    adminLockDot.className = 'pulse-dot active';
    adminStatusText.textContent = '🔓 Admin: เข้าสู่ระบบแล้ว';
    adminLoginPillBtn.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    adminLoginPillBtn.style.background = 'rgba(16, 185, 129, 0.1)';
    adminLoginPillBtn.title = 'คลิกเพื่อออกจากระบบ (Log Out)';
    if (guideTab) guideTab.style.display = 'flex';
    if (changeTeacherPinBtn) changeTeacherPinBtn.hidden = false;
  } else {
    adminLockDot.className = 'pulse-dot warning';
    adminStatusText.textContent = '🔒 Admin Login';
    adminLoginPillBtn.style.border = '1px solid rgba(249, 115, 22, 0.2)';
    adminLoginPillBtn.style.background = 'rgba(249, 115, 22, 0.05)';
    adminLoginPillBtn.title = 'คลิกเพื่อเข้าสู่ระบบผู้ดูแลระบบ';
    if (guideTab) {
      guideTab.style.display = 'none';
      if (currentTab === 'guide') {
        const docTab = document.getElementById('tab-documents');
        if (docTab) docTab.click();
      }
    }
    if (changeTeacherPinBtn) changeTeacherPinBtn.hidden = true;
  }
  renderAllPanes();
};

// Update badge numbers on tabs
const updateBadgeCounts = () => {
  const categories = ['documents', 'images', 'videos', 'others'];
  categories.forEach(cat => {
    const badge = document.getElementById(`badge-${cat}`);
    if (badge) {
      badge.textContent = filesData[cat] ? filesData[cat].length : 0;
    }
  });
};

// Render lists and grids
const renderAllPanes = () => {
  renderDocuments();
  renderImages();
  renderVideos();
  renderOthers();
};

// Filter files based on search
const getFilteredFiles = (category) => {
  const files = filesData[category] || [];
  if (!searchQuery) return files;
  return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
};

// 1. Documents Pane
const renderDocuments = () => {
  const tbody = document.getElementById('list-documents-body');
  const emptyState = document.getElementById('empty-documents');
  const table = document.getElementById('table-documents');
  
  const filtered = getFilteredFiles('documents');
  tbody.innerHTML = '';
  
  if (filtered.length === 0) {
    table.style.display = 'none';
    emptyState.classList.remove('hidden');
    return;
  }
  
  table.style.display = 'table';
  emptyState.classList.add('hidden');
  
  filtered.forEach(file => {
    const iconMeta = getFileIconClass(file.name);
    const tr = document.createElement('tr');
    const safeName = escapeHtml(file.name);
    const downloadUrl = escapeHtml(safeUrl(file.url) || '#');
    const driveUrl = safeUrl(file.driveUrl);
    
    // Check if Google Drive url is available
    const driveCellHTML = driveUrl
      ? `<a href="${escapeHtml(driveUrl)}" target="_blank" rel="noopener noreferrer" class="drive-pill-link"><i class="fa-brands fa-google-drive"></i> เปิดใน Drive</a>`
      : `<span class="no-drive">ไม่ได้อัปโหลด</span>`;

    // Only show the delete button if logged in as admin
    const deleteButtonHTML = isAdmin 
      ? `<button class="action-btn btn-delete" title="ลบไฟล์" data-delete-category="documents" data-delete-filename="${safeName}">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    tr.innerHTML = `
      <td>
        <div class="file-name-cell">
          <div class="file-icon-wrapper ${iconMeta.icon.split(' ')[1]}">
            <i class="fa-solid ${iconMeta.icon.split(' ')[0]}"></i>
          </div>
          <span class="file-name-text" title="${safeName}">${safeName}</span>
        </div>
      </td>
      <td class="size-cell">${escapeHtml(file.sizeFormatted)}</td>
      <td class="date-cell">${escapeHtml(formatRelativeTime(file.createdAt))}</td>
      <td>${driveCellHTML}</td>
      <td class="actions-cell">
        <a href="${downloadUrl}" download class="action-btn btn-download" title="ดาวน์โหลดเก็บในเครื่อง">
          <i class="fa-solid fa-download"></i>
          </a>
        ${driveUrl ? `
          <a href="${escapeHtml(driveUrl)}" target="_blank" rel="noopener noreferrer" class="action-btn btn-drive" title="เปิดใน Google Drive">
            <i class="fa-brands fa-google-drive"></i>
          </a>
        ` : ''}
        ${deleteButtonHTML}
      </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('[data-delete-filename]')?.addEventListener('click', () => openDeleteConfirm('documents', file.name));
  });
};

// 2. Images Gallery Pane
const renderImages = () => {
  const gallery = document.getElementById('gallery-images');
  const emptyState = document.getElementById('empty-images');
  
  const filtered = getFilteredFiles('images');
  gallery.innerHTML = '';
  
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  filtered.forEach(file => {
    const card = document.createElement('div');
    card.className = 'image-card';
    const safeName = escapeHtml(file.name);
    const downloadUrl = safeUrl(file.url);
    const driveUrl = safeUrl(file.driveUrl);
    const previewUrl = safeUrl(file.thumbnailUrl || file.url);
    
    // Build buttons
    const driveBtnHTML = driveUrl
      ? `<a href="${escapeHtml(driveUrl)}" target="_blank" rel="noopener noreferrer" class="image-btn image-btn-drive" title="เปิดใน Google Drive" data-stop-propagation="true">
          <i class="fa-brands fa-google-drive"></i>
         </a>`
      : '';

    const deleteBtnHTML = isAdmin
      ? `<button class="image-btn image-btn-delete" title="ลบไฟล์" data-stop-propagation="true" data-delete-category="images" data-delete-filename="${safeName}">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    card.innerHTML = `
      <img src="${escapeHtml(previewUrl || '/images/placeholder.png')}" alt="${safeName}" loading="lazy">
      <div class="image-overlay">
        <span class="image-name" title="${safeName}">${safeName}</span>
        <div class="image-details">
          <span class="image-size">${escapeHtml(file.sizeFormatted)}</span>
          <div class="image-card-actions">
            <a href="${escapeHtml(downloadUrl || '#')}" download class="image-btn" title="ดาวน์โหลด" data-stop-propagation="true">
              <i class="fa-solid fa-download"></i>
            </a>
            ${driveBtnHTML}
            ${deleteBtnHTML}
          </div>
        </div>
      </div>
    `;
    
    const image = card.querySelector('img');
    image.addEventListener('error', () => {
      image.src = '/images/placeholder.png';
      image.onerror = null;
    });
    card.querySelectorAll('[data-stop-propagation]').forEach((element) => {
      element.addEventListener('click', (event) => event.stopPropagation());
    });
    card.querySelector('[data-delete-filename]')?.addEventListener('click', () => openDeleteConfirm('images', file.name));
    const lightboxUrl = file.thumbnailUrl ? getLargeThumbnail(previewUrl) : downloadUrl;
    card.addEventListener('click', () => openImageLightbox(lightboxUrl, file.name, driveUrl));
    gallery.appendChild(card);
  });
};

// 3. Videos Pane
const renderVideos = () => {
  const grid = document.getElementById('grid-videos');
  const emptyState = document.getElementById('empty-videos');
  
  const filtered = getFilteredFiles('videos');
  grid.innerHTML = '';
  
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  filtered.forEach(file => {
    const card = document.createElement('div');
    card.className = 'video-card';
    const safeName = escapeHtml(file.name);
    const downloadUrl = safeUrl(file.url);
    const driveUrl = safeUrl(file.driveUrl);
    const posterUrl = file.thumbnailUrl ? getLargeThumbnail(safeUrl(file.thumbnailUrl)) : '';
    const openUrl = driveUrl || downloadUrl;
    
    const driveBtnHTML = driveUrl
      ? `<a href="${escapeHtml(driveUrl)}" target="_blank" rel="noopener noreferrer" class="action-btn btn-drive" title="เปิดใน Google Drive">
          <i class="fa-brands fa-google-drive"></i>
         </a>`
      : '';

    const deleteBtnHTML = isAdmin
      ? `<button class="action-btn btn-delete" title="ลบไฟล์" data-delete-category="videos" data-delete-filename="${safeName}">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    card.innerHTML = `
      <div class="video-thumbnail-wrapper" role="button" tabindex="0" aria-label="เปิดวิดีโอ">
        ${posterUrl 
          ? `<img src="${escapeHtml(posterUrl)}" class="video-poster" alt="${safeName}" style="width: 100%; height: 100%; object-fit: cover;">`
          : `<div class="video-placeholder-icon" style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 2rem; color: rgba(255,255,255,0.4);"><i class="fa-solid fa-video"></i></div>`
        }
        <div class="video-play-btn">
          <i class="fa-solid fa-play"></i>
        </div>
      </div>
      <div class="video-info">
        <span class="video-title" title="${safeName}">${safeName}</span>
        <div class="video-meta">
          <span class="video-size-text">${escapeHtml(file.sizeFormatted)}</span>
          <div class="video-actions">
            <a href="${escapeHtml(downloadUrl || '#')}" download class="action-btn btn-download" title="ดาวน์โหลด" data-stop-propagation="true">
              <i class="fa-solid fa-download"></i>
            </a>
            ${driveBtnHTML}
            ${deleteBtnHTML}
          </div>
        </div>
      </div>
    `;
    const thumbnail = card.querySelector('.video-thumbnail-wrapper');
    thumbnail.addEventListener('click', () => {
      if (openUrl) window.open(openUrl, '_blank', 'noopener,noreferrer');
    });
    thumbnail.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && openUrl) {
        event.preventDefault();
        window.open(openUrl, '_blank', 'noopener,noreferrer');
      }
    });
    card.querySelector('[data-delete-filename]')?.addEventListener('click', () => openDeleteConfirm('videos', file.name));
    grid.appendChild(card);
  });
};

// 4. Others Pane
const renderOthers = () => {
  const tbody = document.getElementById('list-others-body');
  const emptyState = document.getElementById('empty-others');
  const table = document.getElementById('table-others');
  
  const filtered = getFilteredFiles('others');
  tbody.innerHTML = '';
  
  if (filtered.length === 0) {
    table.style.display = 'none';
    emptyState.classList.remove('hidden');
    return;
  }
  
  table.style.display = 'table';
  emptyState.classList.add('hidden');
  
  filtered.forEach(file => {
    const iconMeta = getFileIconClass(file.name);
    const tr = document.createElement('tr');
    const safeName = escapeHtml(file.name);
    const downloadUrl = escapeHtml(safeUrl(file.url) || '#');
    const driveUrl = safeUrl(file.driveUrl);
    
    const driveCellHTML = driveUrl
      ? `<a href="${escapeHtml(driveUrl)}" target="_blank" rel="noopener noreferrer" class="drive-pill-link"><i class="fa-brands fa-google-drive"></i> เปิดใน Drive</a>`
      : `<span class="no-drive">ไม่ได้อัปโหลด</span>`;

    const deleteButtonHTML = isAdmin 
      ? `<button class="action-btn btn-delete" title="ลบไฟล์" data-delete-category="others" data-delete-filename="${safeName}">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    tr.innerHTML = `
      <td>
        <div class="file-name-cell">
          <div class="file-icon-wrapper ${iconMeta.icon.split(' ')[1]}">
            <i class="fa-solid ${iconMeta.icon.split(' ')[0]}"></i>
          </div>
          <span class="file-name-text" title="${safeName}">${safeName}</span>
        </div>
      </td>
      <td class="size-cell">${escapeHtml(file.sizeFormatted)}</td>
      <td class="date-cell">${escapeHtml(formatRelativeTime(file.createdAt))}</td>
      <td>${driveCellHTML}</td>
      <td class="actions-cell">
        <a href="${downloadUrl}" download class="action-btn btn-download" title="ดาวน์โหลด">
          <i class="fa-solid fa-download"></i>
          </a>
        ${driveUrl ? `
          <a href="${escapeHtml(driveUrl)}" target="_blank" rel="noopener noreferrer" class="action-btn btn-drive" title="เปิดใน Google Drive">
            <i class="fa-brands fa-google-drive"></i>
          </a>
        ` : ''}
        ${deleteButtonHTML}
      </td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('[data-delete-filename]')?.addEventListener('click', () => openDeleteConfirm('others', file.name));
  });
};

// Lightbox Openers
const openImageLightbox = (url, name, driveUrl) => {
  const safeImageUrl = safeUrl(url);
  const safeDriveUrl = safeUrl(driveUrl);
  lightboxImg.src = safeImageUrl;
  lightboxImgTitle.textContent = name;
  
  // Set up action buttons
  let actionsHTML = safeImageUrl ? `<a href="${escapeHtml(safeImageUrl)}" download class="btn-primary-action"><i class="fa-solid fa-download"></i> ดาวน์โหลด</a>` : '';
  if (safeDriveUrl) {
    actionsHTML += `<a href="${escapeHtml(safeDriveUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary-action btn-drive-action"><i class="fa-brands fa-google-drive"></i> เปิดใน Google Drive</a>`;
  }
  lightboxImgActions.innerHTML = actionsHTML;
  
  imgLightbox.showModal();
};

const openVideoPlayer = (url, name, driveUrl) => {
  const safeVideoUrl = safeUrl(url);
  const safeDriveUrl = safeUrl(driveUrl);
  previewVideoElement.src = safeVideoUrl;
  lightboxVidTitle.textContent = name;
  
  let actionsHTML = safeVideoUrl ? `<a href="${escapeHtml(safeVideoUrl)}" download class="btn-primary-action"><i class="fa-solid fa-download"></i> ดาวน์โหลด</a>` : '';
  if (safeDriveUrl) {
    actionsHTML += `<a href="${escapeHtml(safeDriveUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary-action btn-drive-action"><i class="fa-brands fa-google-drive"></i> เปิดใน Google Drive</a>`;
  }
  lightboxVidActions.innerHTML = actionsHTML;

  vidLightbox.showModal();
  if (safeVideoUrl) previewVideoElement.play().catch(() => {});
};

// Confirm Delete opener
window.openDeleteConfirm = (category, filename) => {
  fileToDelete = { category, filename };
  deleteFileDisplayName.textContent = filename;
  deleteConfirmModal.showModal();
};

// Delete Execution
const executeDeleteFile = async () => {
  if (!fileToDelete) return;
  
  const { category, filename } = fileToDelete;
  try {
    const url = `/api/files/${category}/${encodeURIComponent(filename)}`;
    const response = await fetch(url, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    
    const result = await response.json();
    if (result.success) {
      deleteConfirmModal.close();
      fileToDelete = null;
      // Refresh dashboard
      fetchDashboardData();
    } else if (response.status === 401) {
      isAdmin = false;
      updateAdminUI();
      alert('เซสชันผู้ดูแลหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    } else {
      alert(`ลบไฟล์ไม่สำเร็จ: ${result.error || 'คุณไม่มีสิทธิ์ในการลบไฟล์'}`);
    }
  } catch (err) {
    console.error('Error deleting file:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์เพื่อลบไฟล์');
  }
};

// Event Listeners for tabs
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // Toggle active classes on buttons
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Toggle active panes
    const tabName = btn.getAttribute('data-tab');
    currentTab = tabName;
    
    panes.forEach(pane => {
      pane.classList.remove('active');
      if (pane.id === `pane-${tabName}`) {
        pane.classList.add('active');
      }
    });
    
    // Hide search toolbar if on guide pane
    if (tabName === 'guide') {
      toolbar.classList.add('hidden');
    } else {
      toolbar.classList.remove('hidden');
    }
    
    // Filter search results instantly when switching tabs
    renderAllPanes();
  });
});

// Search input handling
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  if (searchQuery) {
    searchClearBtn.classList.remove('hidden');
  } else {
    searchClearBtn.classList.add('hidden');
  }
  renderAllPanes();
});

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClearBtn.classList.add('hidden');
  renderAllPanes();
});

// Refresh button trigger
refreshBtn.addEventListener('click', fetchDashboardData);

// Warning banner close button
hideWarningBtn.addEventListener('click', () => {
  configWarningBanner.classList.add('hidden');
});

// Lightbox close events
closeLightboxBtn.addEventListener('click', () => imgLightbox.close());
closeVideoBtn.addEventListener('click', () => {
  previewVideoElement.pause();
  vidLightbox.close();
});

// Light dismiss for dialogs (click outside to close)
const registerLightDismiss = (dialog) => {
  dialog.addEventListener('click', (e) => {
    const rect = dialog.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      if (dialog.id === 'video-player-modal') {
        previewVideoElement.pause();
      }
      dialog.close();
    }
  });
};

registerLightDismiss(imgLightbox);
registerLightDismiss(vidLightbox);
registerLightDismiss(deleteConfirmModal);
registerLightDismiss(adminLoginModal);
registerLightDismiss(teacherPinModal);

// Confirm delete button triggers
cancelDeleteBtn.addEventListener('click', () => deleteConfirmModal.close());
confirmDeleteBtn.addEventListener('click', executeDeleteFile);

// Admin Login Events
adminLoginPillBtn.addEventListener('click', () => {
  if (isAdmin) {
    // Log out if already admin
    if (confirm('คุณต้องการออกจากระบบผู้ดูแลระบบใช่หรือไม่? (ปุ่มลบไฟล์จะถูกซ่อน)')) {
      fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
        .finally(() => {
          isAdmin = false;
          updateAdminUI();
        });
    }
  } else {
    // Show login modal
    adminPasswordInput.value = '';
    loginErrorMessage.classList.add('hidden');
    adminLoginModal.showModal();
  }
});

adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = adminPasswordInput.value;
  
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    
    const result = await response.json();
    if (response.status === 401) {
      loginErrorMessage.textContent = 'ADMIN_PASSWORD ไม่ถูกต้อง (Teacher PIN ใช้คนละช่อง)';
      loginErrorMessage.classList.remove('hidden');
      adminPasswordInput.focus();
    } else if (response.ok && result.success) {
      isAdmin = true;
      adminLoginModal.close();
      updateAdminUI();
    } else {
      loginErrorMessage.textContent = result.error || 'เข้าสู่ระบบ Admin ไม่สำเร็จ';
      loginErrorMessage.classList.remove('hidden');
      adminPasswordInput.focus();
    }
  } catch (err) {
    console.error('Error logging in:', err);
    loginErrorMessage.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่';
    loginErrorMessage.classList.remove('hidden');
  }
});

cancelLoginBtn.addEventListener('click', () => {
  adminLoginModal.close();
});

changeTeacherPinBtn.addEventListener('click', () => {
  teacherPinInput.value = '';
  teacherPinMessage.textContent = '';
  teacherPinMessage.classList.add('hidden');
  teacherPinModal.showModal();
  teacherPinInput.focus();
});

teacherPinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = teacherPinInput.value.trim();
  if (pin.length < 6) {
    teacherPinMessage.textContent = 'Teacher PIN ต้องยาวอย่างน้อย 6 ตัวอักษร';
    teacherPinMessage.style.color = '#ef4444';
    teacherPinMessage.classList.remove('hidden');
    return;
  }

  try {
    const response = await fetch('/api/admin/dashboard-pin', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'บันทึก Teacher PIN ไม่สำเร็จ');
    }

    teacherPinModal.close();
    alert(result.persisted
      ? 'เปลี่ยน Teacher PIN และบันทึกถาวรแล้ว'
      : 'เปลี่ยน Teacher PIN แล้ว แต่ฐานข้อมูลยังไม่พร้อม จึงมีผลจนกว่า service จะ restart');
  } catch (err) {
    teacherPinMessage.textContent = err.message;
    teacherPinMessage.style.color = '#ef4444';
    teacherPinMessage.classList.remove('hidden');
  }
});

cancelTeacherPinBtn.addEventListener('click', () => teacherPinModal.close());

// PIN Lock Screen Logic
const pinLockOverlay = document.getElementById('pin-lock-overlay');
const pinCardBox = document.getElementById('pin-card-box');
const pinLockForm = document.getElementById('pin-lock-form');
const pinCodeInput = document.getElementById('pin-code-input');
const pinErrorMsg = document.getElementById('pin-error-msg');

const checkPinLockStatus = async () => {
  try {
    const res = await fetch('/api/dashboard/session', { credentials: 'same-origin' });
    const session = await res.json();
    if (session.authenticated) {
      pinLockOverlay.classList.add('fade-out');
      fetchDashboardData();
    } else {
      pinLockOverlay.classList.remove('fade-out');
      pinCodeInput.focus();
    }
  } catch (err) {
    console.error('Error probing server status:', err);
    pinLockOverlay.classList.remove('fade-out');
  }
};

  if (pinLockForm) {
  pinLockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = pinCodeInput.value.trim();
    try {
      const response = await fetch('/api/dashboard/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const result = await response.json();
      if (result.success) {
        pinErrorMsg.classList.add('hidden');
        pinLockOverlay.classList.add('fade-out');
        fetchDashboardData();
        return;
      }
      pinErrorMsg.classList.remove('hidden');
      pinCardBox.classList.add('shake');
      pinCodeInput.value = '';
      pinCodeInput.focus();
      setTimeout(() => {
        pinCardBox.classList.remove('shake');
      }, 400);
    } catch (err) {
      console.error('Error logging into dashboard:', err);
      pinErrorMsg.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์';
      pinErrorMsg.classList.remove('hidden');
    }
  });
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  updateAdminUI();
  fetch('/api/admin/session', { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((session) => {
      isAdmin = Boolean(session.authenticated);
      updateAdminUI();
    })
    .catch(() => {});
  checkPinLockStatus();
  // Poll server status/new files every 10 seconds to keep UI up-to-date
  setInterval(() => {
    fetchDashboardData();
  }, 10000);
});
