import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// Load environment variables only in development
if (process.env.NODE_ENV === 'development') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

// FIXED: Enhanced Supabase client initialization
let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      console.log("🔧 Initializing Supabase client...");
      
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );
      
      supabaseEnabled = true;
      console.log("✅ Supabase client created successfully");
      return true;
    } else {
      console.error("❌ Supabase environment variables not set");
      supabaseEnabled = false;
      return false;
    }
  } catch (error) {
    console.error("❌ Failed to create Supabase client:", error.message);
    supabaseEnabled = false;
    return false;
  }
};

// Initialize Supabase immediately
initializeSupabase();

// ========== MULTI-EMAIL SUPPORT ==========

// Function to parse multiple email configurations from environment
function getEmailConfigsFromEnv() {
  const configs = {};
  
  // Parse multiple email configurations
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('EMAIL_CONFIG_')) {
      const [email, password] = value.split(':');
      if (email && password) {
        configs[email.trim()] = password.trim();
      }
    }
  }
  
  // Also support legacy single email config for backward compatibility
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    configs[process.env.EMAIL_USER] = process.env.EMAIL_PASS;
  }
  
  console.log(`📧 Loaded ${Object.keys(configs).length} email configurations:`);
  Object.keys(configs).forEach(email => {
    console.log(`   ✅ ${email}`);
  });
  
  return configs;
}

// Initialize email configs
const emailConfigs = getEmailConfigsFromEnv();

// Enhanced IMAP Connection Manager for multiple users
class IMAPConnectionManager {
  constructor() {
    this.connections = new Map(); // Store connections by user ID
  }

  async getUserConnection(userId, userEmail) {
    // Check if user's email has configuration
    if (!emailConfigs[userEmail]) {
      throw new Error(`No email configuration found for ${userEmail}`);
    }

    // Return existing connection if available and valid
    if (this.connections.has(userId)) {
      const existingConnection = this.connections.get(userId);
      if (await existingConnection.checkConnection()) {
        return existingConnection;
      }
      // Remove stale connection
      this.connections.delete(userId);
    }

    // Create new connection
    const newConnection = new UserIMAPConnection(userId, userEmail, emailConfigs[userEmail]);
    this.connections.set(userId, newConnection);
    await newConnection.connect();
    return newConnection;
  }

  disconnectUser(userId) {
    if (this.connections.has(userId)) {
      this.connections.get(userId).disconnect();
      this.connections.delete(userId);
    }
  }
}

class UserIMAPConnection {
  constructor(userId, userEmail, password) {
    this.userId = userId;
    this.userEmail = userEmail;
    this.password = password;
    this.connection = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 2000;
  }

  async connect() {
    if (this.isConnected && this.connection) return this.connection;
    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (this.isConnected) {
            clearInterval(checkConnection);
            resolve(this.connection);
          }
          if (!this.isConnecting) {
            clearInterval(checkConnection);
            reject(new Error('Connection failed'));
          }
        }, 100);
      });
    }

    this.isConnecting = true;
    
    return new Promise((resolve, reject) => {
      this.connection = new Imap({
        user: this.userEmail,
        password: this.password,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 30000,
        authTimeout: 15000,
        keepAlive: true
      });

      this.connection.once('ready', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log(`✅ IMAP connection ready for user: ${this.userEmail}`);
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        this.isConnecting = false;
        this.isConnected = false;
        console.error(`❌ IMAP connection error for user ${this.userEmail}:`, err.message);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} for ${this.userEmail}`);
          setTimeout(() => {
            this.connect().then(resolve).catch(reject);
          }, this.reconnectDelay);
        } else {
          reject(err);
        }
      });

      this.connection.once('end', () => {
        this.isConnected = false;
        console.log(`📤 IMAP connection closed for user: ${this.userEmail}`);
      });

      this.connection.on('close', (hadError) => {
        this.isConnected = false;
        console.log(`🔒 IMAP connection closed ${hadError ? 'with error' : 'normally'} for user: ${this.userEmail}`);
      });

      this.connection.connect();
    });
  }

  async disconnect() {
    if (this.connection && this.isConnected) {
      this.connection.end();
      this.isConnected = false;
    }
  }

  async checkConnection() {
    if (!this.connection || !this.isConnected) {
      return false;
    }
    
    return new Promise((resolve) => {
      try {
        this.connection.state;
        resolve(true);
      } catch (err) {
        this.isConnected = false;
        resolve(false);
      }
    });
  }

  openInbox(cb) {
    this.connection.openBox("INBOX", true, cb);
  }
}

// Initialize the multi-user manager
const imapManager = new IMAPConnectionManager();

// Authentication middleware - Vercel optimized
const authenticateUser = async (req, res, next) => {
  try {
    // Skip authentication for public endpoints
    const publicEndpoints = ['/api/health', '/api/test-attachment-urls', '/api/debug-env', '/api/debug-attachments'];
    if (publicEndpoints.includes(req.path)) {
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('❌ No authorization header found');
      return res.status(401).json({ 
        success: false,
        error: "Authentication required. Please log in again." 
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.log('❌ Invalid token:', error?.message);
      return res.status(401).json({ 
        success: false,
        error: "Invalid token. Please log in again." 
      });
    }

    // Check if user's email has configuration
    if (!emailConfigs[user.email]) {
      console.log(`❌ No email config for: ${user.email}`);
      return res.status(403).json({ 
        success: false,
        error: `No email configuration found for ${user.email}. Please contact administrator.` 
      });
    }

    req.user = user;
    console.log(`✅ Authenticated user: ${user.email}`);
    next();
  } catch (error) {
    console.error("❌ Authentication error:", error);
    res.status(500).json({ 
      success: false,
      error: "Authentication failed" 
    });
  }
};

// ✅ UPDATED: Check duplicate using user_id
async function checkDuplicate(userId, messageId) {
  try {
    if (supabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from('emails')
        .select('message_id')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .single();

      if (!error && data) return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Duplicate check error:", error);
    return false;
  }
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setToCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

function clearCache() {
  cache.clear();
}

// FIXED: Enhanced storage setup with proper public permissions
async function ensureStorageBucket() {
  try {
    console.log("🛠️ Ensuring storage bucket exists and is public...");

    if (!supabaseEnabled || !supabase) {
      console.log("⚠️ Supabase not available");
      return false;
    }

    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error("❌ Cannot list buckets:", bucketsError.message);
      return false;
    }

    const attachmentsBucket = buckets?.find(b => b.name === 'attachments');

    if (!attachmentsBucket) {
      console.log("📦 Creating attachments bucket...");
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/*', 'application/pdf', 'text/*', 'application/*', 'audio/*', 'video/*']
      });

      if (createError) {
        console.error("❌ Failed to create bucket:", createError.message);
        return false;
      }
      console.log("✅ Created attachments bucket");
    } else {
      console.log("✅ Attachments bucket exists");
      
      // Ensure the bucket is public
      if (!attachmentsBucket.public) {
        console.log("🔓 Making bucket public...");
        const { error: updateError } = await supabase.storage.updateBucket('attachments', {
          public: true
        });
        
        if (updateError) {
          console.error("❌ Failed to make bucket public:", updateError.message);
        } else {
          console.log("✅ Bucket is now public");
        }
      }
    }

    return true;

  } catch (error) {
    console.error("❌ Storage setup failed:", error.message);
    return false;
  }
}

// Helper function to identify problematic files
function isProblematicFile(filename, contentType) {
  if (!filename) return false;
  
  const lowerFilename = filename.toLowerCase();
  const lowerContentType = (contentType || '').toLowerCase();
  
  // Skip tracking pixels and analytics files
  const problematicPatterns = [
    /tracking/i,
    /pixel/i,
    /beacon/i,
    /analytics/i,
    /spacer/i,
    /forward/i,
    /gem\.gif$/i,
    /native_forward\.gif$/i,
    /\.gif$/i,
    /signature/i
  ];
  
  return problematicPatterns.some(pattern => 
    pattern.test(lowerFilename) || pattern.test(lowerContentType)
  );
}

// FIXED: Enhanced attachment processing with better URL handling
async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments`);
  
  if (!supabaseEnabled || !supabase) {
    console.log("⚠️ Supabase not available, skipping attachments");
    return [];
  }

  const storageReady = await ensureStorageBucket();
  if (!storageReady) {
    console.error("❌ Storage not ready");
    return [];
  }

  const attachmentPromises = attachments.map(async (att, index) => {
    try {
      if (isProblematicFile(att.filename, att.contentType)) {
        console.log(`   🚫 Skipping problematic file: ${att.filename}`);
        return null;
      }

      if (!att.content) {
        console.log(`   ❌ Attachment ${index + 1} has no content`);
        return null;
      }

      const originalFilename = att.filename || `attachment_${Date.now()}_${index}.bin`;
      const safeFilename = originalFilename
        .replace(/[^a-zA-Z0-9.\-_]/g, '_')
        .substring(0, 100);

      // Create unique path with timestamp
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const uniquePath = `emails/${timestamp}_${randomId}_${safeFilename}`;

      console.log(`   📤 Uploading: ${safeFilename} -> ${uniquePath}`);

      // Convert to Buffer
      let contentBuffer;
      if (Buffer.isBuffer(att.content)) {
        contentBuffer = att.content;
      } else if (typeof att.content === 'string') {
        contentBuffer = Buffer.from(att.content, 'utf8');
      } else {
        contentBuffer = Buffer.from(att.content);
      }

      // Skip if file is too small (likely tracking pixel)
      if (contentBuffer.length < 100) {
        console.log(`   🚫 Skipping small file: ${safeFilename} (${contentBuffer.length} bytes)`);
        return null;
      }

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(uniquePath, contentBuffer, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600'
        });

      if (error) {
        console.error(`   ❌ Upload failed for ${safeFilename}:`, error.message);
        return null;
      }

      console.log(`   ✅ Upload successful: ${safeFilename}`);

      // Get public URL - ENHANCED URL GENERATION
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path);

      // Verify the URL is accessible
      const publicUrl = urlData.publicUrl;
      console.log(`   🔗 Generated URL: ${publicUrl}`);

      const attachmentResult = {
        id: `att_${timestamp}_${index}_${randomId}`,
        filename: safeFilename,
        originalFilename: originalFilename,
        name: originalFilename,
        displayName: originalFilename,
        url: publicUrl,
        publicUrl: publicUrl,
        downloadUrl: publicUrl,
        previewUrl: publicUrl,
        contentType: att.contentType || 'application/octet-stream',
        type: att.contentType || 'application/octet-stream',
        mimeType: att.contentType || 'application/octet-stream',
        size: contentBuffer.length,
        extension: originalFilename.split('.').pop() || 'bin',
        path: data.path,
        isImage: (att.contentType || '').startsWith('image/'),
        isPdf: (att.contentType || '') === 'application/pdf',
        isText: (att.contentType || '').startsWith('text/'),
        isAudio: (att.contentType || '').startsWith('audio/'),
        isVideo: (att.contentType || '').startsWith('video/'),
        base64: false
      };

      return attachmentResult;

    } catch (attErr) {
      console.error(`   ❌ Attachment processing error:`, attErr.message);
      return null;
    }
  });

  const results = await Promise.allSettled(attachmentPromises);
  
  const successfulAttachments = results
    .filter(result => result.status === 'fulfilled' && result.value !== null)
    .map(result => result.value);

  console.log(`📎 Completed: ${successfulAttachments.length}/${attachments.length} successful`);
  
  return successfulAttachments;
}

// FIXED: Enhanced email data structure with better fallbacks
function createEmailData(parsed, messageId, attachmentLinks, options = {}) {
  // Ensure attachments is always a proper array
  const attachments = Array.isArray(attachmentLinks) ? attachmentLinks.map(att => ({
    id: att.id || `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    filename: att.filename || att.name || 'attachment',
    originalFilename: att.originalFilename || att.filename || att.name || 'attachment',
    name: att.name || att.filename || 'attachment',
    displayName: att.displayName || att.filename || att.name || 'attachment',
    url: att.url || att.publicUrl || att.downloadUrl || '',
    publicUrl: att.publicUrl || att.url || att.downloadUrl || '',
    downloadUrl: att.downloadUrl || att.url || att.publicUrl || '',
    previewUrl: att.previewUrl || att.url || att.publicUrl || '',
    contentType: att.contentType || att.type || att.mimeType || 'application/octet-stream',
    type: att.type || att.contentType || att.mimeType || 'application/octet-stream',
    mimeType: att.mimeType || att.contentType || att.type || 'application/octet-stream',
    size: att.size || 0,
    extension: att.extension || (att.filename ? att.filename.split('.').pop() : 'bin'),
    path: att.path || '',
    isImage: (att.contentType || att.type || '').startsWith('image/'),
    isPdf: (att.contentType || att.type || '') === 'application/pdf',
    isText: (att.contentType || att.type || '').startsWith('text/'),
    isAudio: (att.contentType || att.type || '').startsWith('audio/'),
    isVideo: (att.contentType || att.type || '').startsWith('video/'),
    base64: att.base64 || false
  })) : [];

  const emailData = {
    messageId: messageId,
    subject: parsed.subject || '(No Subject)',
    from: parsed.from?.text || "",
    to: parsed.to?.text || "",
    date: parsed.date || new Date(),
    text: parsed.text || "",
    html: parsed.html || "",
    fromName: parsed.from?.value?.[0]?.name || "",
    fromAddress: parsed.from?.value?.[0]?.address || "",
    attachments: attachments,
    hasAttachments: attachments.length > 0,
    attachmentsCount: attachments.length,
    processedAt: new Date(),
    id: messageId,
    ...options
  };

  return emailData;
}

// ========== API ENDPOINTS ==========

// FIXED: Load ALL emails endpoint with better error handling
app.post("/api/load-all-emails", authenticateUser, async (req, res) => {
  console.log(`🚀 Loading ALL emails for user: ${req.user.email}`);
  
  let userImap;
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    userImap = await imapManager.getUserConnection(userId, userEmail);
    
    userImap.openInbox(async function (err, box) {
      if (err) {
        console.error("❌ Failed to open inbox:", err);
        return res.status(500).json({ 
          success: false,
          error: "Failed to open inbox: " + err.message 
        });
      }
      
      console.log(`📥 ${userEmail} - Total Messages: ${box.messages.total}`);
      
      if (box.messages.total === 0) {
        return res.json({
          success: true,
          message: "No emails found in inbox",
          data: {
            processed: 0,
            duplicates: 0,
            totalInInbox: 0,
            userEmail: userEmail
          }
        });
      }
      
      // Fetch ALL emails
      const fetchRange = `1:${box.messages.total}`;
      console.log(`📨 ${userEmail} - Fetching ALL ${box.messages.total} emails`);

      const f = userImap.connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let duplicateCount = 0;
      let newEmails = [];
      let errorCount = 0;

      f.on("message", function (msg, seqno) {
        let buffer = "";
        let messageProcessed = false;

        msg.on("body", function (stream) {
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
        });

        msg.once("end", async function () {
          if (messageProcessed) return;
          messageProcessed = true;
          
          try {
            const parsed = await simpleParser(buffer);
            const messageId = parsed.messageId || `email-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Skip duplicates
            const isDuplicate = await checkDuplicate(userId, messageId);
            if (isDuplicate) {
              duplicateCount++;
              return;
            }

            const attachmentLinks = await processAttachments(parsed.attachments || []);
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              userId: userId,
              userEmail: userEmail
            });

            newEmails.push(emailData);
            processedCount++;
            
            // Log progress for large batches
            if (processedCount % 10 === 0) {
              console.log(`   📧 Processed ${processedCount}/${box.messages.total} emails...`);
            }
            
          } catch (parseErr) {
            console.error("❌ Parse error:", parseErr.message);
            errorCount++;
          }
        });

        msg.once("error", (msgErr) => {
          if (messageProcessed) return;
          messageProcessed = true;
          console.error("❌ Message processing error:", msgErr.message);
          errorCount++;
        });
      });

      f.once("error", function (err) {
        console.error("❌ Fetch stream error:", err);
        res.status(500).json({ 
          success: false,
          error: "Fetch stream error: " + err.message 
        });
      });

      f.once("end", async function () {
        try {
          console.log(`🔄 Processing ${newEmails.length} new emails...`);
          
          // Save to Supabase in smaller batches
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} new emails to Supabase...`);
            
            const batchSize = 5; // Smaller batches for reliability
            for (let i = 0; i < newEmails.length; i += batchSize) {
              const batch = newEmails.slice(i, i + batchSize);
              
              const batchOps = batch.map(async (email) => {
                try {
                  const supabaseData = {
                    message_id: email.messageId,
                    subject: email.subject,
                    from_text: email.from,
                    to_text: email.to,
                    date: email.date,
                    text_content: email.text,
                    html_content: email.html,
                    attachments: email.attachments,
                    has_attachments: email.hasAttachments,
                    attachments_count: email.attachmentsCount,
                    user_id: userId,
                    user_email: userEmail,
                    created_at: new Date()
                  };

                  const { error } = await supabase.from('emails').upsert(supabaseData);
                  if (error) {
                    console.error("❌ Supabase save error:", error.message);
                    return false;
                  }
                  return true;
                } catch (saveErr) {
                  console.error("❌ Email save error:", saveErr.message);
                  return false;
                }
              });

              const results = await Promise.allSettled(batchOps);
              const successfulSaves = results.filter(r => r.status === 'fulfilled' && r.value).length;
              
              console.log(`   ✅ Saved batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(newEmails.length/batchSize)}: ${successfulSaves}/${batch.length} successful`);
              
              // Small delay between batches to avoid overwhelming the server
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            clearCache();
          }

          console.log(`✅ Load All completed: ${processedCount} new, ${duplicateCount} duplicates, ${errorCount} errors`);
          
          res.json({
            success: true,
            message: `Loaded ${processedCount} new emails for ${userEmail}`,
            data: {
              processed: processedCount,
              duplicates: duplicateCount,
              errors: errorCount,
              totalInInbox: box.messages.total,
              userEmail: userEmail
            }
          });

        } catch (batchError) {
          console.error("❌ Batch processing error:", batchError);
          res.status(500).json({ 
            success: false,
            error: "Processing failed: " + batchError.message 
          });
        }
      });
    });

  } catch (error) {
    console.error("❌ Load All error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// NEW: Enhanced search endpoint for ALL emails
app.post("/api/search-emails", authenticateUser, async (req, res) => {
  try {
    const { search = "", limit = 10000 } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    console.log(`🔍 Searching emails for ${userEmail}: "${search}"`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        success: false,
        error: "Supabase is not available" 
      });
    }

    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    // Add search conditions
    if (search && search.trim().length > 0) {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(`subject.ilike.${searchTerm},from_text.ilike.${searchTerm},text_content.ilike.${searchTerm},to_text.ilike.${searchTerm}`);
    }

    // Get ALL matching emails without pagination for search
    query = query.order('date', { ascending: false }).limit(limit);

    const { data: emails, error, count } = await query;
    
    if (error) {
      console.error("❌ Search query error:", error);
      return res.status(500).json({ 
        success: false,
        error: "Failed to search emails",
        details: error.message 
      });
    }

    // Enhanced email data normalization
    const enhancedEmails = emails.map(email => {
      let attachments = [];
      try {
        if (email.attachments && Array.isArray(email.attachments)) {
          attachments = email.attachments.map(att => ({
            id: att.id || `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            filename: att.filename || att.name || 'attachment',
            originalFilename: att.originalFilename || att.filename || att.name || 'attachment',
            name: att.name || att.filename || 'attachment',
            displayName: att.displayName || att.filename || att.name || 'attachment',
            url: att.url || att.publicUrl || att.downloadUrl || '',
            publicUrl: att.publicUrl || att.url || att.downloadUrl || '',
            downloadUrl: att.downloadUrl || att.url || att.publicUrl || '',
            previewUrl: att.previewUrl || att.url || att.publicUrl || '',
            contentType: att.contentType || att.type || att.mimeType || 'application/octet-stream',
            type: att.type || att.contentType || att.mimeType || 'application/octet-stream',
            mimeType: att.mimeType || att.contentType || att.type || 'application/octet-stream',
            size: att.size || 0,
            extension: att.extension || (att.filename ? att.filename.split('.').pop() : 'bin'),
            path: att.path || '',
            isImage: (att.contentType || att.type || '').startsWith('image/'),
            isPdf: (att.contentType || att.type || '') === 'application/pdf',
            isText: (att.contentType || att.type || '').startsWith('text/'),
            isAudio: (att.contentType || att.type || '').startsWith('audio/'),
            isVideo: (att.contentType || att.type || '').startsWith('video/'),
            base64: att.base64 || false
          }));
        }
      } catch (attError) {
        console.error('❌ Error processing attachments for email:', email.message_id, attError);
        attachments = [];
      }

      return {
        id: email.message_id,
        _id: email.message_id,
        messageId: email.message_id,
        subject: email.subject || '(No Subject)',
        from: email.from_text || email.from || '',
        from_text: email.from_text || email.from || '',
        to: email.to_text || email.to || '',
        to_text: email.to_text || email.to || '',
        date: email.date || email.created_at || new Date(),
        text: email.text_content || email.text || '',
        text_content: email.text_content || email.text || '',
        html: email.html_content || email.html || '',
        html_content: email.html_content || email.html || '',
        attachments: attachments,
        hasAttachments: email.has_attachments || attachments.length > 0,
        attachmentsCount: email.attachments_count || attachments.length,
        read: email.read || false
      };
    });

    console.log(`✅ Search completed: Found ${enhancedEmails.length} emails for "${search}"`);

    res.json({
      success: true,
      data: {
        emails: enhancedEmails,
        total: count,
        userEmail: userEmail,
        searchTerm: search
      }
    });

  } catch (error) {
    console.error("❌ Search emails error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Test endpoint to verify attachment URLs
app.get("/api/test-attachment-urls", async (req, res) => {
  try {
    if (!supabaseEnabled || !supabase) {
      return res.json({
        success: false,
        message: "Supabase is not available"
      });
    }

    // Test file content
    const testContent = "This is a test file for URL verification";
    const testFilename = `test-verification-${Date.now()}.txt`;
    const testPath = `test-emails/${testFilename}`;

    // Upload test file
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(testPath, testContent, {
        contentType: 'text/plain'
      });

    if (uploadError) {
      return res.status(500).json({ 
        error: "Upload failed", 
        details: uploadError.message
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("attachments")
      .getPublicUrl(uploadData.path);

    // Clean up test file
    await supabase.storage.from("attachments").remove([testPath]);

    res.json({
      success: true,
      test: {
        filename: testFilename,
        path: uploadData.path,
        publicUrl: urlData.publicUrl,
        bucket: 'attachments'
      }
    });

  } catch (error) {
    console.error("❌ Attachment URL test failed:", error);
    res.status(500).json({ 
      error: error.message
    });
  }
});

// Debug endpoint for attachment issues
app.get("/api/debug-attachments/:messageId", authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ error: "Supabase not available" });
    }

    // Get the email
    const { data: email, error } = await supabase
      .from('emails')
      .select('*')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .single();

    if (error || !email) {
      return res.status(404).json({ error: "Email not found" });
    }

    // Test attachment URLs
    const attachmentTests = [];
    if (email.attachments && Array.isArray(email.attachments)) {
      for (const att of email.attachments) {
        if (att && att.url) {
          try {
            const response = await fetch(att.url, { method: 'HEAD' });
            attachmentTests.push({
              filename: att.filename,
              url: att.url,
              status: response.status,
              ok: response.ok,
              path: att.path
            });
          } catch (fetchError) {
            attachmentTests.push({
              filename: att.filename,
              url: att.url,
              status: 'fetch error',
              ok: false,
              error: fetchError.message
            });
          }
        }
      }
    }

    res.json({
      email: {
        messageId: email.message_id,
        subject: email.subject,
        hasAttachments: email.has_attachments,
        attachmentsCount: email.attachments_count
      },
      attachments: email.attachments || [],
      attachmentTests,
      storage: {
        enabled: supabaseEnabled,
        bucket: 'attachments'
      }
    });

  } catch (error) {
    console.error("❌ Debug attachments error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Debug environment
app.get("/api/debug-env", (req, res) => {
  res.json({
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_URL: process.env.SUPABASE_URL ? "Set" : "Not set",
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? `Set (length: ${process.env.SUPABASE_SERVICE_KEY.length})` : "Not set",
      EMAIL_CONFIGS: Object.keys(emailConfigs)
    },
    supabase: {
      enabled: supabaseEnabled,
      initialized: !!supabase
    },
    emailConfigs: {
      count: Object.keys(emailConfigs).length,
      emails: Object.keys(emailConfigs)
    }
  });
});

// ✅ UPDATED: Fetch emails for authenticated user
app.post("/api/fetch-emails", authenticateUser, async (req, res) => {
  console.log(`🔍 DEBUG: /api/fetch-emails called for user: ${req.user.email}`);
  try {
    const { mode = "latest", count = 20 } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    // Get user-specific IMAP connection
    const userImap = await imapManager.getUserConnection(userId, userEmail);
    
    if (!userImap.connection || userImap.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log(`🔄 Fetching emails for ${userEmail} in ${mode} mode, count: ${count}`);
    
    userImap.openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 ${userEmail} - Total Messages: ${box.messages.total}`);
      
      // Calculate fetch range
      const totalMessages = box.messages.total;
      const fetchCount = Math.min(count, totalMessages);
      const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
      const fetchEnd = totalMessages;
      const fetchRange = `${fetchStart}:${fetchEnd}`;

      console.log(`📨 ${userEmail} - Fetching range: ${fetchRange}`);

      const f = userImap.connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let duplicateCount = 0;
      let newEmails = [];
      let processingDetails = [];

      f.on("message", function (msg, seqno) {
        console.log(`📨 ${userEmail} - Processing message #${seqno}`);
        let buffer = "";
        let messageProcessed = false;

        msg.on("body", function (stream) {
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
        });

        msg.once("end", async function () {
          if (messageProcessed) return;
          messageProcessed = true;
          
          try {
            const parsed = await simpleParser(buffer);

            // Generate messageId if missing
            const messageId = parsed.messageId || `email-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Check for duplicates for this user
            if (mode !== "force") {
              const isDuplicate = await checkDuplicate(userId, messageId);
              if (isDuplicate) {
                console.log(`   ⚠️ Duplicate skipped: ${parsed.subject}`);
                duplicateCount++;
                processingDetails.push({
                  messageId: messageId.substring(0, 50) + '...',
                  subject: parsed.subject || '(No Subject)',
                  status: 'duplicate'
                });
                return;
              }
            }

            // Process attachments
            console.log(`   📎 Processing attachments for: ${parsed.subject}`);
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // Create email data with user info
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              fetchMode: mode,
              sequenceNumber: seqno,
              userId: userId,
              userEmail: userEmail
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ New email: ${parsed.subject} (${attachmentLinks.length} attachments)`);
            
            processingDetails.push({
              messageId: messageId.substring(0, 50) + '...',
              subject: parsed.subject || '(No Subject)',
              status: 'new',
              attachments: attachmentLinks.length
            });

          } catch (parseErr) {
            console.error("   ❌ Parse error:", parseErr.message);
          }
        });

        msg.once("error", (msgErr) => {
          if (messageProcessed) return;
          messageProcessed = true;
          console.error("   ❌ Message processing error:", msgErr.message);
        });
      });

      f.once("error", function (err) {
        console.error(`❌ Fetch error for ${userEmail}:`, err);
        res.status(500).json({ 
          success: false,
          error: "Fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 Processing ${newEmails.length} new emails for ${userEmail}...`);
        
        try {
          // Save to Supabase with user_id
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} emails to Supabase for ${userEmail}...`);
            
            const saveOps = newEmails.map(async (email) => {
              try {
                if (supabaseEnabled && supabase) {
                  const supabaseData = {
                    message_id: email.messageId,
                    subject: email.subject,
                    from_text: email.from,
                    to_text: email.to,
                    date: email.date,
                    text_content: email.text,
                    html_content: email.html,
                    attachments: email.attachments,
                    has_attachments: email.hasAttachments,
                    attachments_count: email.attachmentsCount,
                    user_id: userId,
                    user_email: userEmail,
                    created_at: new Date(),
                    updated_at: new Date()
                  };

                  const { error: supabaseError } = await supabase.from('emails').upsert(supabaseData);
                  if (supabaseError) {
                    console.error("   ❌ Supabase save error:", supabaseError);
                  } else {
                    console.log(`   ✅ Saved to Supabase for ${userEmail}: ${email.subject}`);
                  }
                }
                
                return true;
              } catch (saveErr) {
                console.error(`   ❌ Error saving email:`, saveErr);
                return false;
              }
            });

            await Promise.allSettled(saveOps);
            clearCache();
            console.log(`🗑️ Cleared cache for ${userEmail}`);
          }

          console.log(`✅ Fetch completed for ${userEmail}: ${processedCount} new, ${duplicateCount} duplicates`);
          
          res.json({
            success: true,
            message: `Processed ${processedCount} new emails for ${userEmail}`,
            data: {
              processed: processedCount,
              duplicates: duplicateCount,
              total: processedCount + duplicateCount,
              userEmail: userEmail,
              emails: newEmails,
              details: processingDetails
            }
          });

        } catch (batchError) {
          console.error("❌ Batch processing error:", batchError);
          res.status(500).json({ 
            success: false,
            error: "Batch processing failed: " + batchError.message 
          });
        }
      });
    });

  } catch (error) {
    console.error("❌ Fetch emails API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// NEW: Fast fetch from Supabase only (no IMAP) - ENHANCED
app.post("/api/fast-fetch", authenticateUser, async (req, res) => {
  try {
    const { mode = "latest", count = 50 } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    console.log(`🚀 Fast fetching ${count} emails from Supabase for ${userEmail} in ${mode} mode`);
    
    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        success: false,
        error: "Supabase is not available" 
      });
    }

    let query = supabase
      .from('emails')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(count);

    const { data: emails, error } = await query;

    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        success: false,
        error: "Failed to fetch emails from Supabase",
        details: error.message 
      });
    }

    // ENHANCED: Better email data normalization with fallbacks
    const enhancedEmails = emails.map(email => {
      // Ensure attachments is always an array
      let attachments = [];
      try {
        if (email.attachments && Array.isArray(email.attachments)) {
          attachments = email.attachments.map(att => ({
            id: att.id || `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            filename: att.filename || att.name || 'attachment',
            originalFilename: att.originalFilename || att.filename || att.name || 'attachment',
            name: att.name || att.filename || 'attachment',
            displayName: att.displayName || att.filename || att.name || 'attachment',
            url: att.url || att.publicUrl || att.downloadUrl || '',
            publicUrl: att.publicUrl || att.url || att.downloadUrl || '',
            downloadUrl: att.downloadUrl || att.url || att.publicUrl || '',
            previewUrl: att.previewUrl || att.url || att.publicUrl || '',
            contentType: att.contentType || att.type || att.mimeType || 'application/octet-stream',
            type: att.type || att.contentType || att.mimeType || 'application/octet-stream',
            mimeType: att.mimeType || att.contentType || att.type || 'application/octet-stream',
            size: att.size || 0,
            extension: att.extension || (att.filename ? att.filename.split('.').pop() : 'bin'),
            path: att.path || '',
            isImage: (att.contentType || att.type || '').startsWith('image/'),
            isPdf: (att.contentType || att.type || '') === 'application/pdf',
            isText: (att.contentType || att.type || '').startsWith('text/'),
            isAudio: (att.contentType || att.type || '').startsWith('audio/'),
            isVideo: (att.contentType || att.type || '').startsWith('video/'),
            base64: att.base64 || false
          }));
        }
      } catch (attError) {
        console.error('❌ Error processing attachments for email:', email.message_id, attError);
        attachments = [];
      }

      return {
        id: email.message_id,
        _id: email.message_id,
        messageId: email.message_id,
        subject: email.subject || '(No Subject)',
        from: email.from_text || email.from || '',
        from_text: email.from_text || email.from || '',
        to: email.to_text || email.to || '',
        to_text: email.to_text || email.to || '',
        date: email.date || email.created_at || new Date(),
        text: email.text_content || email.text || '',
        text_content: email.text_content || email.text || '',
        html: email.html_content || email.html || '',
        html_content: email.html_content || email.html || '',
        attachments: attachments,
        hasAttachments: email.has_attachments || attachments.length > 0,
        attachmentsCount: email.attachments_count || attachments.length,
        read: email.read || false
      };
    });

    console.log(`✅ Fast fetch completed: ${enhancedEmails.length} emails from Supabase for ${userEmail}`);

    res.json({
      success: true,
      message: `Fetched ${enhancedEmails.length} emails from database for ${userEmail}`,
      data: {
        emails: enhancedEmails,
        total: enhancedEmails.length,
        userEmail: userEmail,
        source: 'supabase_fast'
      }
    });

  } catch (error) {
    console.error("❌ Fast fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ UPDATED: Get emails for authenticated user only - ENHANCED with search
app.get("/api/emails", authenticateUser, async (req, res) => {
  try {
    const { search = "", sort = "date_desc", page = 1, limit = 10000 } = req.query; // Increased limit
    const userId = req.user.id;
    const userEmail = req.user.email;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50000, Math.max(1, parseInt(limit))); // Increased limit to 50000
    const skip = (pageNum - 1) * limitNum;

    // Create user-specific cache key
    const cacheKey = `emails:${userId}:${search}:${sort}:${pageNum}:${limitNum}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log(`📦 Serving from cache for ${userEmail}`);
      return res.json(cached);
    }

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        error: "Supabase is not available" 
      });
    }

    let query = supabase.from('emails').select('*', { count: 'exact' })
      .eq('user_id', userId); // Only get this user's emails
    
    // Add search if provided
    if (search && search.trim().length > 0) {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(`subject.ilike.${searchTerm},from_text.ilike.${searchTerm},text_content.ilike.${searchTerm},to_text.ilike.${searchTerm}`);
    }
    
    // Add sorting
    switch (sort) {
      case "date_asc":
        query = query.order('date', { ascending: true });
        break;
      case "subject_asc":
        query = query.order('subject', { ascending: true });
        break;
      case "subject_desc":
        query = query.order('subject', { ascending: false });
        break;
      default: // date_desc
        query = query.order('date', { ascending: false });
    }
    
    // Add pagination
    query = query.range(skip, skip + limitNum - 1);
    
    const { data: emails, error, count } = await query;
    
    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch emails from Supabase",
        details: error.message 
      });
    }

    // ENHANCED: Better email data normalization with fallbacks
    const enhancedEmails = emails.map(email => {
      // Ensure attachments is always an array
      let attachments = [];
      try {
        if (email.attachments && Array.isArray(email.attachments)) {
          attachments = email.attachments.map(att => ({
            id: att.id || `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            filename: att.filename || att.name || 'attachment',
            originalFilename: att.originalFilename || att.filename || att.name || 'attachment',
            name: att.name || att.filename || 'attachment',
            displayName: att.displayName || att.filename || att.name || 'attachment',
            url: att.url || att.publicUrl || att.downloadUrl || '',
            publicUrl: att.publicUrl || att.url || att.downloadUrl || '',
            downloadUrl: att.downloadUrl || att.url || att.publicUrl || '',
            previewUrl: att.previewUrl || att.url || att.publicUrl || '',
            contentType: att.contentType || att.type || att.mimeType || 'application/octet-stream',
            type: att.type || att.contentType || att.mimeType || 'application/octet-stream',
            mimeType: att.mimeType || att.contentType || att.type || 'application/octet-stream',
            size: att.size || 0,
            extension: att.extension || (att.filename ? att.filename.split('.').pop() : 'bin'),
            path: att.path || '',
            isImage: (att.contentType || att.type || '').startsWith('image/'),
            isPdf: (att.contentType || att.type || '') === 'application/pdf',
            isText: (att.contentType || att.type || '').startsWith('text/'),
            isAudio: (att.contentType || att.type || '').startsWith('audio/'),
            isVideo: (att.contentType || att.type || '').startsWith('video/'),
            base64: att.base64 || false
          }));
        }
      } catch (attError) {
        console.error('❌ Error processing attachments for email:', email.message_id, attError);
        attachments = [];
      }

      return {
        id: email.message_id,
        _id: email.message_id,
        messageId: email.message_id,
        subject: email.subject || '(No Subject)',
        from: email.from_text || email.from || '',
        from_text: email.from_text || email.from || '',
        to: email.to_text || email.to || '',
        to_text: email.to_text || email.to || '',
        date: email.date || email.created_at || new Date(),
        text: email.text_content || email.text || '',
        text_content: email.text_content || email.text || '',
        html: email.html_content || email.html || '',
        html_content: email.html_content || email.html || '',
        attachments: attachments,
        hasAttachments: email.has_attachments || attachments.length > 0,
        attachmentsCount: email.attachments_count || attachments.length,
        read: email.read || false
      };
    });

    const hasMore = skip + enhancedEmails.length < count;

    const response = {
      emails: enhancedEmails,
      total: count,
      hasMore,
      page: pageNum,
      limit: limitNum,
      userEmail: userEmail,
      source: 'supabase'
    };

    setToCache(cacheKey, response);

    console.log(`✅ Sending ${enhancedEmails.length} emails from Supabase for ${userEmail}`);
    res.json(response);

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    res.status(500).json({ 
      error: "Failed to fetch emails",
      details: error.message 
    });
  }
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    let supabaseStatus = "not_configured";
    let storageStatus = "not_configured";
    
    if (supabaseEnabled && supabase) {
      try {
        const { error: authError } = await supabase.auth.getUser();
        supabaseStatus = authError ? "disconnected" : "connected";

        const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
        storageStatus = storageError ? "error" : "connected";

      } catch (supabaseErr) {
        supabaseStatus = "error";
        storageStatus = "error";
      }
    }

    let imapStatus = "multi_user";
    const emailConfigStatus = Object.keys(emailConfigs).length > 0 ? "configured" : "not_configured";

    res.json({
      status: "ok",
      services: {
        supabase: supabaseStatus,
        storage: storageStatus,
        imap: imapStatus,
        email_configs: emailConfigStatus
      },
      emailConfigs: {
        count: Object.keys(emailConfigs).length,
        emails: Object.keys(emailConfigs)
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

// Clear cache endpoint - Vercel optimized (no auth required for cache)
app.post("/api/clear-cache", (req, res) => {
  try {
    const cacheSize = cache.size;
    clearCache();
    console.log(`🗑️ Cache cleared: ${cacheSize} entries`);
    res.json({ 
      success: true, 
      message: `Cleared ${cacheSize} cache entries` 
    });
  } catch (error) {
    console.error('❌ Clear cache error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Delete email with attachments - Vercel compatible
app.delete("/api/emails/:messageId", authenticateUser, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    console.log(`🗑️ DELETE endpoint called for messageId: ${messageId} by user: ${userEmail}`);

    if (!supabaseEnabled || !supabase) {
      console.error("❌ Supabase not available");
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
      });
    }

    // Step 1: Get the email first to find attachment paths
    console.log(`🔍 Looking up email in database...`);
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('message_id', messageId)
      .eq('user_id', userId) // Ensure user can only delete their own emails
      .single();

    if (fetchError || !email) {
      console.error("❌ Email not found in database:", fetchError?.message || "No email data");
      return res.status(404).json({
        success: false,
        error: "Email not found",
        details: fetchError?.message
      });
    }

    console.log(`✅ Email found: ${email.subject}`);

    // Step 2: Delete attachments from storage if they exist
    let attachmentDeleteResult = { success: true, deleted: 0, errors: [] };
    
    if (email.attachments && Array.isArray(email.attachments) && email.attachments.length > 0) {
      console.log(`📎 Found ${email.attachments.length} attachments to delete...`);
      
      // Extract valid paths safely
      const attachmentPaths = email.attachments
        .filter(att => att && typeof att === 'object' && att.path && typeof att.path === 'string')
        .map(att => att.path);

      console.log(`📎 Valid attachment paths to delete: ${attachmentPaths.length}`);

      if (attachmentPaths.length > 0) {
        try {
          console.log(`🗑️ Deleting attachments from storage...`);
          const { data: deleteData, error: storageError } = await supabase.storage
            .from("attachments")
            .remove(attachmentPaths);

          if (storageError) {
            console.error("❌ Attachment deletion error:", storageError);
            attachmentDeleteResult.success = false;
            attachmentDeleteResult.errors.push(`Storage error: ${storageError.message}`);
          } else {
            attachmentDeleteResult.deleted = deleteData?.length || 0;
            console.log(`✅ Deleted ${attachmentDeleteResult.deleted} attachments from storage`);
          }
        } catch (storageErr) {
          console.error("❌ Storage deletion exception:", storageErr);
          attachmentDeleteResult.success = false;
          attachmentDeleteResult.errors.push(`Exception: ${storageErr.message}`);
        }
      } else {
        console.log("📎 No valid attachment paths found to delete");
      }
    } else {
      console.log("📎 No attachments found for this email");
    }

    // Step 3: Delete the email record from database
    console.log(`🗑️ Deleting email record from database...`);
    const { error: deleteError } = await supabase
      .from('emails')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId); // Ensure user can only delete their own emails

    if (deleteError) {
      console.error("❌ Database deletion error:", deleteError);
      return res.status(500).json({
        success: false,
        error: "Failed to delete email from database",
        details: deleteError.message,
        attachments: attachmentDeleteResult
      });
    }

    console.log(`✅ Email record deleted from database`);

    // Step 4: Clear cache
    clearCache();
    console.log("🗑️ Cleared cache after deletion");

    // Return success even if some attachments failed to delete
    res.json({
      success: true,
      message: "Email deleted successfully",
      data: {
        messageId: messageId,
        subject: email.subject,
        userEmail: userEmail,
        attachments: attachmentDeleteResult,
        deletedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ Delete email error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Email IMAP Backend Server - Multi-User Support",
    version: "4.0.0",
    environment: process.env.NODE_ENV || 'development',
    supabase: supabaseEnabled ? "enabled" : "disabled",
    emailConfigs: {
      count: Object.keys(emailConfigs).length,
      emails: Object.keys(emailConfigs)
    },
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/emails": "Get emails with attachments (authenticated)",
      "POST /api/fetch-emails": "Fetch new emails (authenticated)",
      "POST /api/load-all-emails": "Load ALL emails from inbox (authenticated)",
      "POST /api/search-emails": "Search ALL emails (authenticated)",
      "POST /api/fast-fetch": "Fast fetch from database only (authenticated)",
      "DELETE /api/emails/:messageId": "Delete email and attachments (authenticated)",
      "GET /api/test-attachment-urls": "Test attachment URL generation",
      "GET /api/debug-env": "Debug environment variables",
      "GET /api/debug-attachments/:messageId": "Debug attachment issues",
      "POST /api/clear-cache": "Clear cache"
    }
  });
});

// Serve static files from the React app build directory
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// Handle client-side routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Initialize application
async function initializeApp() {
  console.log("🚀 Initializing application...");
  
  if (supabaseEnabled) {
    await ensureStorageBucket();
  }
  
  console.log("✅ Application initialized");
  console.log(`📋 Supabase: ${supabaseEnabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`📧 Email Configurations: ${Object.keys(emailConfigs).length} loaded`);
}

// Call initialization
initializeApp();

// Vercel serverless function handler - SIMPLIFIED
export default app;