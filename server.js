const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { google } = require('googleapis');
const mysql = require('mysql2/promise');

// Load environment variables
dotenv.config();

const app = reportExpressServer = express();
const PORT = process.env.PORT || 3000;

// Ensure base directories exist
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const CATEGORIES = ['documents', 'images', 'videos', 'others'];

// Stats structure to track in-memory
const stats = {
  totalProcessed: 0,
  webhookCalls: 0,
  errors: 0,
  lastEventTime: null
};

// Create folders recursively if they don't exist
const initializeFolders = () => {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
  
  CATEGORIES.forEach(cat => {
    const dir = path.join(DOWNLOADS_DIR, cat);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const publicDirs = [
    path.join(__dirname, 'public'),
    path.join(__dirname, 'public', 'css'),
    path.join(__dirname, 'public', 'js')
  ];

  publicDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

initializeFolders();



// Helper to check if Line configuration is filled
const isLineConfigured = () => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const secret = process.env.LINE_CHANNEL_SECRET;
  return token && 
         token !== 'your_line_channel_access_token_here' && 
         token.trim() !== '' &&
         secret && 
         secret !== 'your_line_channel_secret_here' && 
         secret.trim() !== '';
};

// Utility functions
const sanitizeFilename = (filename) => {
  return filename.replace(/[\\/:*?"<>|]/g, '_');
};

const formatBytes = (bytes, decimals = 2) => {
  const sizeBytes = parseInt(bytes || 0);
  if (sizeBytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(sizeBytes) / Math.log(k));
  return parseFloat((sizeBytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getExtensionFromMime = (mimeType, defaultExt) => {
  if (!mimeType) return defaultExt;
  if (mimeType.includes('image/png')) return '.png';
  if (mimeType.includes('image/jpeg')) return '.jpg';
  if (mimeType.includes('image/gif')) return '.gif';
  if (mimeType.includes('image/webp')) return '.webp';
  if (mimeType.includes('image/svg+xml')) return '.svg';
  if (mimeType.includes('video/mp4')) return '.mp4';
  if (mimeType.includes('video/quicktime')) return '.mov';
  if (mimeType.includes('video/x-msvideo')) return '.avi';
  if (mimeType.includes('video/webm')) return '.webm';
  if (mimeType.includes('audio/mp4') || mimeType.includes('audio/x-m4a')) return '.m4a';
  if (mimeType.includes('audio/mpeg')) return '.mp3';
  if (mimeType.includes('audio/ogg')) return '.ogg';
  if (mimeType.includes('audio/wav') || mimeType.includes('audio/x-wav')) return '.wav';
  if (mimeType.includes('application/pdf')) return '.pdf';
  if (mimeType.includes('application/zip')) return '.zip';
  return defaultExt;
};

const getMimeFromExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.doc': return 'application/msword';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls': return 'application/vnd.ms-excel';
    case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.ppt': return 'application/vnd.ms-powerpoint';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.m4a': return 'audio/mp4';
    case '.mp3': return 'audio/mpeg';
    case '.zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
};

// File classification
const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv', '.rtf', '.xml', '.odt', '.ods', '.odp'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.3gp', '.wmv'];

const getCategoryFromFilename = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'documents';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'images';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'videos';
  return 'others';
};

// --- MYSQL DATABASE SERVICE ---

let dbPool = null;
let dbConnected = false;

const initializeDatabase = async () => {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = process.env.DB_PORT || 3306;

  if (!host || !database || !user) {
    console.log('ℹ️  MySQL Database: NOT INITIALIZED (Missing DB credentials in .env, using direct Drive fallback)');
    return;
  }

  try {
    dbPool = mysql.createPool({
      host,
      user,
      password,
      database,
      port: parseInt(port),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    const connection = await dbPool.getConnection();
    console.log('✅ MySQL Database: CONNECTED');
    
    // Auto-create table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`files\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(50) NOT NULL,
        \`size\` BIGINT NOT NULL,
        \`size_formatted\` VARCHAR(50) NOT NULL,
        \`drive_file_id\` VARCHAR(255) DEFAULT NULL,
        \`drive_url\` TEXT DEFAULT NULL,
        \`thumbnail_url\` TEXT DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Alter table to add column if it doesn't exist (for existing database schemas)
    try {
      await connection.query(`
        ALTER TABLE \`files\` ADD COLUMN IF NOT EXISTS \`thumbnail_url\` TEXT DEFAULT NULL AFTER \`drive_url\`;
      `);
    } catch (alterErr) {
      console.log('ℹ️  MySQL Schema update note:', alterErr.message);
    }
    
    connection.release();
    dbConnected = true;
  } catch (err) {
    console.error('❌ Failed to connect to MySQL database:', err.message);
    console.log('ℹ️  MySQL Database: falling back to direct Google Drive queries.');
    dbConnected = false;
  }
};

// --- GOOGLE DRIVE SERVICE ---

let driveClient = null;

const initializeGoogleDrive = () => {
  try {
    const tokenEnv = process.env.GOOGLE_TOKEN_JSON;
    const secretEnv = process.env.GOOGLE_CLIENT_SECRET_JSON;
    const credEnv = process.env.GOOGLE_CREDENTIALS_JSON;
    
    const tokenPath = path.join(__dirname, 'google-token.json');
    const secretPath = path.join(__dirname, 'google-client-secret.json');
    const credPath = path.join(__dirname, 'google-credentials.json');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!folderId || folderId.trim() === '') {
      console.log('ℹ️  Google Drive Service: NOT INITIALIZED (Missing folder ID)');
      return false;
    }

    // 1. Prioritize OAuth2 User Token (Impersonation Mode)
    let tokenData = null;
    let secretData = null;

    if (tokenEnv && secretEnv) {
      tokenData = JSON.parse(tokenEnv);
      secretData = JSON.parse(secretEnv);
    } else {
      if (fs.existsSync(tokenPath) && fs.existsSync(secretPath)) {
        tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        secretData = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
      }
    }

    if (tokenData && secretData) {
      const { client_secret, client_id, redirect_uris } = secretData.installed || secretData.web;
      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris ? redirect_uris[0] : 'urn:ietf:wg:oauth:2.0:oob'
      );
      oAuth2Client.setCredentials(tokenData);
      
      driveClient = google.drive({ version: 'v3', auth: oAuth2Client });
      console.log('✅ Google Drive Service: INITIALIZED (User OAuth2 Mode)');
      return true;
    } 
    // 2. Fallback to Service Account Mode
    else {
      let credData = null;
      if (credEnv) {
        credData = JSON.parse(credEnv);
      }

      if (credData) {
        const auth = google.auth.fromJSON(credData);
        auth.scopes = ['https://www.googleapis.com/auth/drive.file'];
        driveClient = google.drive({ version: 'v3', auth });
        console.log('✅ Google Drive Service: INITIALIZED (Service Account Env Mode)');
        return true;
      } else if (fs.existsSync(credPath)) {
        const auth = new google.auth.GoogleAuth({
          keyFile: credPath,
          scopes: ['https://www.googleapis.com/auth/drive.file']
        });
        driveClient = google.drive({ version: 'v3', auth });
        console.log('✅ Google Drive Service: INITIALIZED (Service Account File Mode)');
        return true;
      }
    }

    console.log('ℹ️  Google Drive Service: NOT INITIALIZED (Missing OAuth credentials or Service Account key)');
    return false;
  } catch (err) {
    console.error('❌ Failed to initialize Google Drive client:', err.message);
    return false;
  }
};

const uploadToGoogleDrive = async (filePath, filename, mimeType) => {
  if (!driveClient) {
    throw new Error('Google Drive client is not active');
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  console.log(`[Google Drive] Uploading "${filename}" (${mimeType}) to folder ID: ${folderId}...`);

  const response = await driveClient.files.create({
    requestBody: {
      name: filename,
      parents: [folderId]
    },
    media: {
      mimeType: mimeType,
      body: fs.createReadStream(filePath)
    },
    fields: 'id, webViewLink, thumbnailLink'
  });

  console.log(`[Google Drive] Upload complete. File ID: ${response.data.id}`);
  return {
    id: response.data.id,
    url: response.data.webViewLink,
    thumbnailLink: response.data.thumbnailLink || null
  };
};

const deleteFromGoogleDrive = async (fileId) => {
  if (!driveClient || !fileId) return;
  
  try {
    console.log(`[Google Drive] Requesting deletion of file ID: ${fileId}...`);
    await driveClient.files.delete({ fileId });
    console.log('[Google Drive] File deleted successfully.');
  } catch (err) {
    console.error(`[Google Drive] Error deleting file ID ${fileId}:`, err.message);
  }
};

// Initialize Services
initializeGoogleDrive();
initializeDatabase();

// Enable Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Native Line signature verification
const verifyLineSignature = (req, res, buf, encoding) => {
  req.rawBody = buf;
};

// LINE Webhook route
app.post('/webhook', express.json({ verify: verifyLineSignature }), async (req, res) => {
  stats.webhookCalls++;
  
  // 1. Signature Verification
  const signature = req.headers['x-line-signature'];
  if (!signature) {
    console.warn('[Webhook] Missing x-line-signature header.');
    stats.errors++;
    return res.status(401).send('Unauthorized');
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret || channelSecret === 'your_line_channel_secret_here') {
    console.warn('[Webhook] LINE_CHANNEL_SECRET is not configured. Skipping verification (Testing mode).');
  } else {
    const hash = crypto
      .createHmac('sha256', channelSecret)
      .update(req.rawBody)
      .digest('base64');
      
    if (hash !== signature) {
      console.error('[Webhook] Signature verification failed.');
      stats.errors++;
      return res.status(401).send('Invalid signature');
    }
  }

  const events = req.body.events;
  if (!events || !Array.isArray(events)) {
    return res.sendStatus(200);
  }

  // 2. Process events
  for (const event of events) {
    stats.lastEventTime = new Date();
    if (event.type === 'message') {
      try {
        await handleMessageEvent(event);
      } catch (err) {
        console.error(`[Webhook] Error handling event ${event.message.id}:`, err);
        stats.errors++;
      }
    }
  }

  res.sendStatus(200);
});

// Download helper using native fetch
const downloadLineMessageContent = async (messageId, outputPath) => {
  if (!isLineConfigured()) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to download LINE content: ${response.status} ${response.statusText} - ${errText}`);
  }

  const contentType = response.headers.get('content-type');
  const fileStream = fs.createWriteStream(outputPath);
  
  await new Promise((resolve, reject) => {
    Readable.fromWeb(response.body).pipe(fileStream);
    fileStream.on('finish', resolve);
    fileStream.on('error', (err) => {
      fileStream.close();
      reject(err);
    });
  });

  return contentType;
};

// Send reply message using native fetch
const replyLineMessage = async (replyToken, text) => {
  if (!isLineConfigured()) {
    console.log(`[Reply Mock] replyToken: ${replyToken}, message: ${text}`);
    return;
  }

  const url = 'https://api.line.me/v2/bot/message/reply';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: 'text',
          text: text
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[LINE Reply API Error]', errText);
  }
};

// Main logic for processing incoming message
const handleMessageEvent = async (event) => {
  const msg = event.message;
  const replyToken = event.replyToken;
  
  if (!msg) return;

  stats.totalProcessed++;
  const msgType = msg.type;
  
  let filename = '';
  let category = '';
  let sizeText = 'N/A';
  let mimeType = '';
  let finalPath = '';
  
  // Handle different message types
  if (msgType === 'file') {
    const rawFilename = msg.fileName || `file_${msg.id}`;
    filename = sanitizeFilename(rawFilename);
    category = getCategoryFromFilename(filename);
    
    const size = msg.fileSize || 0;
    sizeText = formatBytes(size);

    const destDir = path.join(DOWNLOADS_DIR, category);
    finalPath = path.join(destDir, filename);
    mimeType = getMimeFromExtension(filename);

    console.log(`[File Collector] Downloading file: "${filename}" into "${category}" folder...`);

    if (isLineConfigured()) {
      const detectedMime = await downloadLineMessageContent(msg.id, finalPath);
      if (detectedMime) mimeType = detectedMime;
    } else {
      fs.writeFileSync(finalPath, `Dummy content representing line file: ${filename}\nSize: ${sizeText}`);
    }

  } else if (msgType === 'image') {
    const destDir = path.join(DOWNLOADS_DIR, 'images');
    let tempPath = path.join(destDir, `img_${msg.id}.jpg`);
    let actualExt = '.jpg';
    mimeType = 'image/jpeg';
    
    console.log(`[File Collector] Downloading image: img_${msg.id}...`);
    
    if (isLineConfigured()) {
      const mime = await downloadLineMessageContent(msg.id, tempPath);
      mimeType = mime;
      actualExt = getExtensionFromMime(mime, '.jpg');
      
      if (actualExt !== '.jpg') {
        finalPath = path.join(destDir, `img_${msg.id}${actualExt}`);
        fs.renameSync(tempPath, finalPath);
      } else {
        finalPath = tempPath;
      }
    } else {
      fs.writeFileSync(tempPath, 'MOCK_IMAGE_DATA');
      finalPath = tempPath;
    }

    filename = `img_${msg.id}${actualExt}`;
    category = 'images';
    
    const stat = fs.statSync(finalPath);
    sizeText = formatBytes(stat.size);

  } else if (msgType === 'video') {
    const destDir = path.join(DOWNLOADS_DIR, 'videos');
    let tempPath = path.join(destDir, `vid_${msg.id}.mp4`);
    let actualExt = '.mp4';
    mimeType = 'video/mp4';
    
    console.log(`[File Collector] Downloading video: vid_${msg.id}...`);

    if (isLineConfigured()) {
      const mime = await downloadLineMessageContent(msg.id, tempPath);
      mimeType = mime;
      actualExt = getExtensionFromMime(mime, '.mp4');
      
      if (actualExt !== '.mp4') {
        finalPath = path.join(destDir, `vid_${msg.id}${actualExt}`);
        fs.renameSync(tempPath, finalPath);
      } else {
        finalPath = tempPath;
      }
    } else {
      fs.writeFileSync(tempPath, 'MOCK_VIDEO_DATA');
      finalPath = tempPath;
    }

    filename = `vid_${msg.id}${actualExt}`;
    category = 'videos';
    
    const stat = fs.statSync(finalPath);
    sizeText = formatBytes(stat.size);

  } else if (msgType === 'audio') {
    const destDir = path.join(DOWNLOADS_DIR, 'others');
    let tempPath = path.join(destDir, `aud_${msg.id}.m4a`);
    let actualExt = '.m4a';
    mimeType = 'audio/x-m4a';

    console.log(`[File Collector] Downloading audio: aud_${msg.id}...`);

    if (isLineConfigured()) {
      const mime = await downloadLineMessageContent(msg.id, tempPath);
      mimeType = mime;
      actualExt = getExtensionFromMime(mime, '.m4a');
      
      if (actualExt !== '.m4a') {
        finalPath = path.join(destDir, `aud_${msg.id}${actualExt}`);
        fs.renameSync(tempPath, finalPath);
      } else {
        finalPath = tempPath;
      }
    } else {
      fs.writeFileSync(tempPath, 'MOCK_AUDIO_DATA');
      finalPath = tempPath;
    }

    filename = `aud_${msg.id}${actualExt}`;
    category = 'others';
    
    const stat = fs.statSync(finalPath);
    sizeText = formatBytes(stat.size);

  } else {
    console.log(`[File Collector] Skipping unsupported message type: "${msgType}"`);
    return;
  }

  // --- UPLOAD TO GOOGLE DRIVE IF INITIALIZED ---
  let driveFileId = null;
  let driveUrl = null;
  let driveThumbnailLink = null;
  let driveUploaded = false;

  const stat = fs.statSync(finalPath);

  if (driveClient) {
    try {
      const driveResult = await uploadToGoogleDrive(finalPath, filename, mimeType);
      driveFileId = driveResult.id;
      driveUrl = driveResult.url;
      driveThumbnailLink = driveResult.thumbnailLink;
      driveUploaded = true;
      
      // Stateless Clean-Up: Immediately delete the file locally to free up host storage
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
        console.log(`[File Collector] Stateless clean-up: deleted local file "${filename}"`);
      }
    } catch (err) {
      console.error('[Google Drive] Auto-upload failed:', err.message);
    }
  }

  // --- SAVE TO DATABASE IF CONNECTED ---
  if (dbConnected) {
    try {
      await dbPool.query(
        'INSERT INTO files (name, category, size, size_formatted, drive_file_id, drive_url, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [filename, category, stat.size, formatBytes(stat.size), driveFileId, driveUrl, driveThumbnailLink]
      );
      console.log(`[Database] Saved metadata for "${filename}" in MySQL.`);
    } catch (dbErr) {
      console.error('[Database] Failed to write to MySQL:', dbErr.message);
    }
  }

  // Success reply back to LINE user (Disabled per user request for silent operation)
  /*
  const categoryNamesTh = {
    'documents': 'เอกสาร',
    'images': 'รูปภาพ',
    'videos': 'วิดีโอ',
    'others': 'อื่นๆ'
  };

  const catNameTh = categoryNamesTh[category] || category;
  let successReply = `📥 บันทึกไฟล์สำเร็จ!
📁 หมวดหมู่: ไฟล์${catNameTh}
📄 ชื่อไฟล์: ${filename}
💾 ขนาด: ${sizeText}`;

  if (driveUploaded) {
    successReply += '\n☁️ บันทึกลง Google Drive แล้ว!';
  }

  await replyLineMessage(replyToken, successReply);
  */
  console.log(`[File Collector] File saved: ${filename} (${category}) - ${sizeText} (Google Drive: ${driveUploaded ? 'Yes' : 'No'})`);
};

// --- REST API FOR DASHBOARD ---

// Middleware to verify Dashboard PIN (Security Lock)
const verifyDashboardPin = (req, res, next) => {

  // If running in Demo Mode, allow unauthenticated access to showcase mock files
  if (process.env.DEMO_MODE === 'true') {
    return next();
  }

  const pin = req.headers['x-dashboard-pin'] || req.query.pin;
  const expectedPin = 'fw2569';

  if (pin === expectedPin) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid PIN' });
  }
};

// GET /ping (Public keep-alive endpoint, does not require PIN)
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET /api/files (Reads from MySQL if connected, otherwise falls back to Drive API)
app.get('/api/files', verifyDashboardPin, async (req, res) => {
  try {
    const results = { documents: [], images: [], videos: [], others: [] };
    
    // Check Demo Mode
    if (process.env.DEMO_MODE === 'true') {
      return res.json({ success: true, files: getDemoFiles() });
    }
    
    // 1. Primary: Try MySQL
    if (dbConnected) {
      try {
        const [rows] = await dbPool.query('SELECT * FROM files ORDER BY created_at DESC');
        rows.forEach(file => {
          const category = file.category;
          if (results[category]) {
            results[category].push({
              name: file.name,
              category: category,
              size: parseInt(file.size),
              sizeFormatted: file.size_formatted,
              createdAt: file.created_at,
              url: file.drive_url,
              thumbnailUrl: file.thumbnail_url,
              driveFileId: file.drive_file_id,
              driveUrl: file.drive_url
            });
          }
        });
        return res.json({ success: true, files: results });
      } catch (dbErr) {
        console.error('[Database] MySQL query failed, falling back to Drive API:', dbErr.message);
      }
    }

    // 2. Fallback: Drive API Direct Listing
    if (!driveClient) {
      return res.json({ success: true, files: results });
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    const response = await driveClient.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime, webViewLink, thumbnailLink)',
      pageSize: 1000
    });

    const driveFiles = response.data.files || [];

    driveFiles.forEach(file => {
      const category = getCategoryFromFilename(file.name);
      const size = parseInt(file.size || 0);
      
      if (results[category]) {
        results[category].push({
          name: file.name,
          category: category,
          size: size,
          sizeFormatted: formatBytes(size),
          createdAt: file.createdTime,
          url: file.webViewLink,
          thumbnailUrl: file.thumbnailLink || null,
          driveFileId: file.id,
          driveUrl: file.webViewLink
        });
      }
    });

    // Sort by creation date descending
    Object.keys(results).forEach(cat => {
      results[cat].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });

    res.json({ success: true, files: results });
  } catch (err) {
    console.error('Error fetching files:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/login
app.post('/api/admin/login', express.json(), (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'รหัสผ่านไม่ถูกต้อง' });
  }
});

// DELETE /api/files/:category/:filename (Deletes files from Google Drive and MySQL)
app.delete('/api/files/:category/:filename', async (req, res) => {
  const { category, filename } = req.params;
  
  // Auth Check
  const clientPassword = req.headers['x-admin-password'];
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (clientPassword !== adminPassword) {
    return res.status(401).json({ success: false, error: 'คุณไม่มีสิทธิ์ในการลบไฟล์ (Unauthorized)' });
  }
  
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, error: 'Invalid category' });
  }
  
  const sanitizedFilename = sanitizeFilename(filename);
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  // 1. Delete from MySQL if connected
  if (dbConnected) {
    try {
      await dbPool.query('DELETE FROM files WHERE name = ? AND category = ?', [sanitizedFilename, category]);
      console.log(`[Database] Deleted metadata for "${sanitizedFilename}" from MySQL.`);
    } catch (dbErr) {
      console.error('[Database] Failed to delete from MySQL:', dbErr.message);
    }
  }

  // 2. Delete from Google Drive
  if (driveClient) {
    try {
      const listResponse = await driveClient.files.list({
        q: `'${folderId}' in parents and name = '${sanitizedFilename.replace(/'/g, "\\'")}' and trashed = false`,
        fields: 'files(id)'
      });

      const files = listResponse.data.files || [];
      for (const file of files) {
        await deleteFromGoogleDrive(file.id);
      }
    } catch (err) {
      console.error('[Google Drive] Delete failed:', err.message);
    }
  }

  // 3. Delete local leftover file if it somehow exists
  const localPath = path.join(DOWNLOADS_DIR, category, sanitizedFilename);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }

  return res.json({ success: true, message: 'File deleted successfully' });
});

// GET /api/status (Aggregates stats from MySQL or Google Drive)
app.get('/api/status', verifyDashboardPin, async (req, res) => {
  // Check Demo Mode
  if (process.env.DEMO_MODE === 'true') {
    return res.json({
      success: true,
      status: {
        lineConfigured: true,
        googleDriveConnected: true,
        googleDriveFolderId: 'demo-folder-id-12345',
        port: PORT,
        totalFiles: 5,
        totalSize: 18051892,
        totalSizeFormatted: '17.22 MB',
        categoryBreakdown: {
          documents: { count: 2, size: 2301892, sizeFormatted: '2.19 MB' },
          images: { count: 2, size: 570000, sizeFormatted: '556.6 KB' },
          videos: { count: 1, size: 15400000, sizeFormatted: '14.68 MB' },
          others: { count: 0, size: 0, sizeFormatted: '0 Bytes' }
        },
        webhookCalls: 42,
        totalProcessed: 42,
        errors: 0,
        lastEventTime: new Date().toISOString(),
        uptime: process.uptime()
      }
    });
  }

  let totalSpace = 0;
  let totalFilesCount = 0;
  const breakdown = {
    documents: { count: 0, size: 0, sizeFormatted: '0 Bytes' },
    images: { count: 0, size: 0, sizeFormatted: '0 Bytes' },
    videos: { count: 0, size: 0, sizeFormatted: '0 Bytes' },
    others: { count: 0, size: 0, sizeFormatted: '0 Bytes' }
  };

  let statsFetched = false;

  // 1. Primary: Fetch stats from MySQL
  if (dbConnected) {
    try {
      const [rows] = await dbPool.query('SELECT category, COUNT(*) as count, SUM(size) as size FROM files GROUP BY category');
      rows.forEach(row => {
        const cat = row.category;
        const count = parseInt(row.count || 0);
        const size = parseInt(row.size || 0);
        totalFilesCount += count;
        totalSpace += size;
        
        if (breakdown[cat]) {
          breakdown[cat].count = count;
          breakdown[cat].size = size;
          breakdown[cat].sizeFormatted = formatBytes(size);
        }
      });
      statsFetched = true;
    } catch (dbErr) {
      console.error('[Database] MySQL status query failed, falling to Google Drive:', dbErr.message);
    }
  }

  // 2. Fallback: Fetch stats from Google Drive API
  if (!statsFetched && driveClient) {
    try {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      const response = await driveClient.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(name, size)',
        pageSize: 1000
      });

      const driveFiles = response.data.files || [];
      totalFilesCount = driveFiles.length;

      driveFiles.forEach(file => {
        const cat = getCategoryFromFilename(file.name);
        const size = parseInt(file.size || 0);
        totalSpace += size;

        if (breakdown[cat]) {
          breakdown[cat].count++;
          breakdown[cat].size += size;
          breakdown[cat].sizeFormatted = formatBytes(breakdown[cat].size);
        }
      });
    } catch (err) {
      console.error('Error getting status from Google Drive:', err.message);
    }
  }

  res.json({
    success: true,
    status: {
      lineConfigured: isLineConfigured(),
      googleDriveConnected: !!driveClient,
      googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      port: PORT,
      totalFiles: totalFilesCount,
      totalSize: totalSpace,
      totalSizeFormatted: formatBytes(totalSpace),
      categoryBreakdown: breakdown,
      webhookCalls: stats.webhookCalls,
      totalProcessed: stats.totalProcessed,
      errors: stats.errors,
      lastEventTime: stats.lastEventTime,
      uptime: process.uptime()
    }
  });
});

const getDemoFiles = () => {
  return {
    documents: [
      {
        name: 'แผนการจัดการเรียนรู้_ฟิสิกส์_ม5.pdf',
        category: 'documents',
        size: 2256892,
        sizeFormatted: '2.15 MB',
        createdAt: new Date().toISOString(),
        url: '#',
        driveFileId: 'demo_doc_1',
        driveUrl: 'https://drive.google.com'
      },
      {
        name: 'ใบงานการทดลอง_เครื่องเคาะสัญญาณเวลา.docx',
        category: 'documents',
        size: 45000,
        sizeFormatted: '43.9 KB',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        url: '#',
        driveFileId: 'demo_doc_2',
        driveUrl: 'https://drive.google.com'
      }
    ],
    images: [
      {
        name: 'บรรยากาศห้องเรียนฟิสิกส์.jpg',
        category: 'images',
        size: 320000,
        sizeFormatted: '312.5 KB',
        createdAt: new Date(Date.now() - 10000000).toISOString(),
        url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800',
        thumbnailUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400',
        driveFileId: 'demo_img_1',
        driveUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200'
      },
      {
        name: 'การทดลองแล็บฟิสิกส์.jpg',
        category: 'images',
        size: 250000,
        sizeFormatted: '244.1 KB',
        createdAt: new Date(Date.now() - 20000000).toISOString(),
        url: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=800',
        thumbnailUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=400',
        driveFileId: 'demo_img_2',
        driveUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1200'
      }
    ],
    videos: [
      {
        name: 'สาธิตเครื่องเคาะสัญญาณเวลา.mp4',
        category: 'videos',
        size: 15400000,
        sizeFormatted: '14.68 MB',
        createdAt: new Date(Date.now() - 40000000).toISOString(),
        url: '#',
        thumbnailUrl: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=400',
        driveFileId: 'demo_vid_1',
        driveUrl: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=1200'
      }
    ],
    others: [
      {
        name: 'คะแนนเก็บ_ม5_เทอม1.xlsx',
        category: 'others',
        size: 15400,
        sizeFormatted: '15.0 KB',
        createdAt: new Date(Date.now() - 50000000).toISOString(),
        url: '#',
        driveFileId: 'demo_other_1',
        driveUrl: 'https://drive.google.com'
      }
    ]
  };
};

// Start Server
app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`🚀 LINE File Collector Hub started on port ${PORT}`);
  console.log(`🔗 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Webhook Endpoint: http://localhost:${PORT}/webhook`);
  console.log('--------------------------------------------------');
  
  if (isLineConfigured()) {
    console.log('✅ LINE Messaging API configuration: READY');
  } else {
    console.log('⚠️  LINE Messaging API configuration: MISSING/PLACEHOLDER');
    console.log('   Please set your LINE secrets in the .env file.');
  }

  const hasGdrive = initializeGoogleDrive();
  if (hasGdrive) {
    console.log('✅ Google Drive integration: ACTIVE');
  } else {
    console.log('⚠️  Google Drive integration: INACTIVE (Missing credential files or Folder ID)');
    console.log('   Add google-credentials.json and GOOGLE_DRIVE_FOLDER_ID in .env to link Google Drive.');
  }
  
  console.log('==================================================');
});
