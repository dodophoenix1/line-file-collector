const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

// Scopes required for Google Drive access
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = path.join(__dirname, 'google-token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'google-client-secret.json');

const loadCredentials = () => {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`❌ Missing credentials file: ${CREDENTIALS_PATH}`);
    console.log('Please download your OAuth client credentials JSON from Google Cloud Console,');
    console.log('save it in this directory, and rename it to "google-client-secret.json".');
    process.exit(1);
  }
  
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  return JSON.parse(content);
};

const authorize = (credentials, callback) => {
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris ? redirect_uris[0] : 'urn:ietf:wg:oauth:2.0:oob'
  );

  // Check if we have previously stored a token.
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  } else {
    getNewToken(oAuth2Client, callback);
  }
};

const getNewToken = (oAuth2Client, callback) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force refresh token
  });
  
  console.log('\n==================================================');
  console.log('🔑 GOOGLE DRIVE AUTHENTICATION REQUIRED');
  console.log('==================================================');
  console.log('1. Open this URL in your web browser:');
  console.log(`\x1b[36m${authUrl}\x1b[0m`);
  console.log('\n2. Sign in with your Google account and click "Allow".');
  console.log('3. Copy the authorization code shown on screen.');
  console.log('==================================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the authorization code here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code.trim(), (err, token) => {
      if (err) return console.error('❌ Error retrieving access token:', err.message);
      oAuth2Client.setCredentials(token);
      
      // Save the token to disk for future executions
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
      console.log('✅ Access token successfully generated and saved to "google-token.json"!');
      callback(oAuth2Client);
    });
  });
};

// Run auth flow
try {
  const creds = loadCredentials();
  authorize(creds, () => {
    console.log('\n🎉 Google Drive Authentication is complete and ready to use!');
  });
} catch (err) {
  console.error('Error during authentication:', err.message);
}
