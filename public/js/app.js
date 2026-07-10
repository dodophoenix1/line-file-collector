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

// Admin Authentication State
let isAdmin = localStorage.getItem('adminPassword') ? true : false;

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
  const pin = sessionStorage.getItem('dashboardPin') || '';
  if (!pin) {
    document.getElementById('pin-lock-overlay').classList.remove('fade-out');
    return;
  }

  const refreshIcon = refreshBtn.querySelector('i');
  refreshIcon.classList.add('rotating');
  
  try {
    const headers = {
      'x-dashboard-pin': pin
    };

    // 1. Fetch Status
    const statusRes = await fetch('/api/status', { headers });
    if (statusRes.status === 401) {
      sessionStorage.removeItem('dashboardPin');
      document.getElementById('pin-lock-overlay').classList.remove('fade-out');
      return;
    }
    const statusData = await statusRes.json();
    if (statusData.success) {
      serverStatus = statusData.status;
      updateStatusUI();
    }
    
    // 2. Fetch Files
    const filesRes = await fetch('/api/files', { headers });
    if (filesRes.status === 401) {
      sessionStorage.removeItem('dashboardPin');
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
    
    // Check if Google Drive url is available
    const driveCellHTML = file.driveUrl 
      ? `<a href="${file.driveUrl}" target="_blank" class="drive-pill-link"><i class="fa-brands fa-google-drive"></i> เปิดใน Drive</a>`
      : `<span class="no-drive">ไม่ได้อัปโหลด</span>`;

    // Only show the delete button if logged in as admin
    const deleteButtonHTML = isAdmin 
      ? `<button class="action-btn btn-delete" title="ลบไฟล์" onclick="openDeleteConfirm('documents', '${file.name.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    tr.innerHTML = `
      <td>
        <div class="file-name-cell">
          <div class="file-icon-wrapper ${iconMeta.icon.split(' ')[1]}">
            <i class="fa-solid ${iconMeta.icon.split(' ')[0]}"></i>
          </div>
          <span class="file-name-text" title="${file.name}">${file.name}</span>
        </div>
      </td>
      <td class="size-cell">${file.sizeFormatted}</td>
      <td class="date-cell">${formatRelativeTime(file.createdAt)}</td>
      <td>${driveCellHTML}</td>
      <td class="actions-cell">
        <a href="${file.url}" download class="action-btn btn-download" title="ดาวน์โหลดเก็บในเครื่อง">
          <i class="fa-solid fa-download"></i>
        </a>
        ${file.driveUrl ? `
          <a href="${file.driveUrl}" target="_blank" class="action-btn btn-drive" title="เปิดใน Google Drive">
            <i class="fa-brands fa-google-drive"></i>
          </a>
        ` : ''}
        ${deleteButtonHTML}
      </td>
    `;
    tbody.appendChild(tr);
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
    
    // Build buttons
    const driveBtnHTML = file.driveUrl
      ? `<a href="${file.driveUrl}" target="_blank" class="image-btn image-btn-drive" title="เปิดใน Google Drive" onclick="event.stopPropagation()">
          <i class="fa-brands fa-google-drive"></i>
         </a>`
      : '';

    const deleteBtnHTML = isAdmin
      ? `<button class="image-btn image-btn-delete" title="ลบไฟล์" onclick="event.stopPropagation(); openDeleteConfirm('images', '${file.name.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    const previewUrl = file.thumbnailUrl || file.url;

    card.innerHTML = `
      <img src="${previewUrl}" alt="${file.name}" loading="lazy" onerror="this.src='/images/placeholder.png'">
      <div class="image-overlay">
        <span class="image-name" title="${file.name}">${file.name}</span>
        <div class="image-details">
          <span class="image-size">${file.sizeFormatted}</span>
          <div class="image-card-actions">
            <a href="${file.url}" download class="image-btn" title="ดาวน์โหลด" onclick="event.stopPropagation()">
              <i class="fa-solid fa-download"></i>
            </a>
            ${driveBtnHTML}
            ${deleteBtnHTML}
          </div>
        </div>
      </div>
    `;
    
    const lightboxUrl = file.thumbnailUrl ? getLargeThumbnail(file.thumbnailUrl) : file.url;
    card.addEventListener('click', () => openImageLightbox(lightboxUrl, file.name, file.driveUrl));
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
    
    const driveBtnHTML = file.driveUrl
      ? `<a href="${file.driveUrl}" target="_blank" class="action-btn btn-drive" title="เปิดใน Google Drive">
          <i class="fa-brands fa-google-drive"></i>
         </a>`
      : '';

    const deleteBtnHTML = isAdmin
      ? `<button class="action-btn btn-delete" title="ลบไฟล์" onclick="openDeleteConfirm('videos', '${file.name.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    const posterUrl = file.thumbnailUrl ? getLargeThumbnail(file.thumbnailUrl) : '';

    card.innerHTML = `
      <div class="video-thumbnail-wrapper" onclick="window.open('${file.driveUrl || file.url}', '_blank')">
        ${posterUrl 
          ? `<img src="${posterUrl}" class="video-poster" alt="${file.name}" style="width: 100%; height: 100%; object-fit: cover;">` 
          : `<div class="video-placeholder-icon" style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 2rem; color: rgba(255,255,255,0.4);"><i class="fa-solid fa-video"></i></div>`
        }
        <div class="video-play-btn">
          <i class="fa-solid fa-play"></i>
        </div>
      </div>
      <div class="video-info">
        <span class="video-title" title="${file.name}">${file.name}</span>
        <div class="video-meta">
          <span class="video-size-text">${file.sizeFormatted}</span>
          <div class="video-actions">
            <a href="${file.url}" download class="action-btn btn-download" title="ดาวน์โหลด">
              <i class="fa-solid fa-download"></i>
            </a>
            ${driveBtnHTML}
            ${deleteBtnHTML}
          </div>
        </div>
      </div>
    `;
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
    
    const driveCellHTML = file.driveUrl 
      ? `<a href="${file.driveUrl}" target="_blank" class="drive-pill-link"><i class="fa-brands fa-google-drive"></i> เปิดใน Drive</a>`
      : `<span class="no-drive">ไม่ได้อัปโหลด</span>`;

    const deleteButtonHTML = isAdmin 
      ? `<button class="action-btn btn-delete" title="ลบไฟล์" onclick="openDeleteConfirm('others', '${file.name.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';

    tr.innerHTML = `
      <td>
        <div class="file-name-cell">
          <div class="file-icon-wrapper ${iconMeta.icon.split(' ')[1]}">
            <i class="fa-solid ${iconMeta.icon.split(' ')[0]}"></i>
          </div>
          <span class="file-name-text" title="${file.name}">${file.name}</span>
        </div>
      </td>
      <td class="size-cell">${file.sizeFormatted}</td>
      <td class="date-cell">${formatRelativeTime(file.createdAt)}</td>
      <td>${driveCellHTML}</td>
      <td class="actions-cell">
        <a href="${file.url}" download class="action-btn btn-download" title="ดาวน์โหลด">
          <i class="fa-solid fa-download"></i>
        </a>
        ${file.driveUrl ? `
          <a href="${file.driveUrl}" target="_blank" class="action-btn btn-drive" title="เปิดใน Google Drive">
            <i class="fa-brands fa-google-drive"></i>
          </a>
        ` : ''}
        ${deleteButtonHTML}
      </td>
    `;
    tbody.appendChild(tr);
  });
};

// Lightbox Openers
const openImageLightbox = (url, name, driveUrl) => {
  lightboxImg.src = url;
  lightboxImgTitle.textContent = name;
  
  // Set up action buttons
  let actionsHTML = `<a href="${url}" download class="btn-primary-action"><i class="fa-solid fa-download"></i> ดาวน์โหลด</a>`;
  if (driveUrl) {
    actionsHTML += `<a href="${driveUrl}" target="_blank" class="btn-primary-action btn-drive-action"><i class="fa-brands fa-google-drive"></i> เปิดใน Google Drive</a>`;
  }
  lightboxImgActions.innerHTML = actionsHTML;
  
  imgLightbox.showModal();
};

const openVideoPlayer = (url, name, driveUrl) => {
  previewVideoElement.src = url;
  lightboxVidTitle.textContent = name;
  
  let actionsHTML = `<a href="${url}" download class="btn-primary-action"><i class="fa-solid fa-download"></i> ดาวน์โหลด</a>`;
  if (driveUrl) {
    actionsHTML += `<a href="${driveUrl}" target="_blank" class="btn-primary-action btn-drive-action"><i class="fa-brands fa-google-drive"></i> เปิดใน Google Drive</a>`;
  }
  lightboxVidActions.innerHTML = actionsHTML;

  vidLightbox.showModal();
  previewVideoElement.play();
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
      headers: {
        'x-admin-password': localStorage.getItem('adminPassword') || ''
      }
    });
    
    const result = await response.json();
    if (result.success) {
      deleteConfirmModal.close();
      fileToDelete = null;
      // Refresh dashboard
      fetchDashboardData();
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

// Confirm delete button triggers
cancelDeleteBtn.addEventListener('click', () => deleteConfirmModal.close());
confirmDeleteBtn.addEventListener('click', executeDeleteFile);

// Admin Login Events
adminLoginPillBtn.addEventListener('click', () => {
  if (isAdmin) {
    // Log out if already admin
    if (confirm('คุณต้องการออกจากระบบผู้ดูแลระบบใช่หรือไม่? (ปุ่มลบไฟล์จะถูกซ่อน)')) {
      localStorage.removeItem('adminPassword');
      isAdmin = false;
      updateAdminUI();
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    
    const result = await response.json();
    if (result.success) {
      localStorage.setItem('adminPassword', password);
      isAdmin = true;
      adminLoginModal.close();
      updateAdminUI();
    } else {
      loginErrorMessage.classList.remove('hidden');
      adminPasswordInput.focus();
    }
  } catch (err) {
    console.error('Error logging in:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
});

cancelLoginBtn.addEventListener('click', () => {
  adminLoginModal.close();
});

// PIN Lock Screen Logic
const pinLockOverlay = document.getElementById('pin-lock-overlay');
const pinCardBox = document.getElementById('pin-card-box');
const pinLockForm = document.getElementById('pin-lock-form');
const pinCodeInput = document.getElementById('pin-code-input');
const pinErrorMsg = document.getElementById('pin-error-msg');

const checkPinLockStatus = async () => {
  const storedPin = sessionStorage.getItem('dashboardPin');
  if (storedPin === 'fw2569' || storedPin === 'demo') {
    pinLockOverlay.classList.add('fade-out');
    fetchDashboardData();
    return;
  }

  // Probe server status without a PIN to see if the server requires it (e.g. DEMO_MODE)
  try {
    const res = await fetch('/api/status');
    if (res.status === 200) {
      sessionStorage.setItem('dashboardPin', 'demo');
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

    if (pin === 'fw2569') {
      pinErrorMsg.classList.add('hidden');
      sessionStorage.setItem('dashboardPin', 'fw2569');
      pinLockOverlay.classList.add('fade-out');
      fetchDashboardData();
    } else {
      pinErrorMsg.classList.remove('hidden');
      pinCardBox.classList.add('shake');
      pinCodeInput.value = '';
      pinCodeInput.focus();
      
      setTimeout(() => {
        pinCardBox.classList.remove('shake');
      }, 400);
    }
  });
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  updateAdminUI();
  checkPinLockStatus();
  // Poll server status/new files every 10 seconds to keep UI up-to-date
  setInterval(() => {
    const pin = sessionStorage.getItem('dashboardPin');
    if (pin) {
      fetchDashboardData();
    }
  }, 10000);
});
