import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// Load environment variables locally (not needed in Vercel)
if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

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

// Email Configuration Manager
class EmailConfigManager {
  constructor() {
    this.configs = new Map();
    this.loadConfigs();
  }

  loadConfigs() {
    try {
      // Parse email configurations from environment
      let configIndex = 1;
      while (true) {
        const configKey = `EMAIL_CONFIG_${configIndex}`;
        const configValue = process.env[configKey];
        
        if (!configValue) break;

        const [email, password] = configValue.split(':');
        if (email && password) {
          this.configs.set(configIndex, {
            id: configIndex,
            email: email.trim(),
            password: password.trim(),
            name: `Account ${configIndex}`
          });
          console.log(`✅ Loaded email config ${configIndex}: ${email}`);
        }
        configIndex++;
      }

      console.log(`📧 Loaded ${this.configs.size} email configurations`);
    } catch (error) {
      console.error("❌ Error loading email configs:", error);
    }
  }

  getConfig(configId) {
    return this.configs.get(parseInt(configId));
  }

  getAllConfigs() {
    return Array.from(this.configs.values());
  }

  getConfigByEmail(email) {
    for (const config of this.configs.values()) {
      if (config.email === email) {
        return config;
      }
    }
    return null;
  }
}

const emailConfigManager = new EmailConfigManager();

// Enhanced IMAP Connection Manager with multi-account support
class IMAPConnectionManager {
  constructor() {
    this.connections = new Map();
  }

  async getConnection(configId) {
    if (this.connections.has(configId)) {
      const connection = this.connections.get(configId);
      if (await connection.checkConnection()) {
        return connection;
      }
      // Remove stale connection
      this.connections.delete(configId);
    }

    const config = emailConfigManager.getConfig(configId);
    if (!config) {
      throw new Error(`Email configuration ${configId} not found`);
    }

    const connection = new IMAPConnection(config);
    await connection.connect();
    this.connections.set(configId, connection);
    return connection;
  }

  async disconnectAll() {
    for (const [configId, connection] of this.connections) {
      await connection.disconnect();
    }
    this.connections.clear();
  }
}

class IMAPConnection {
  constructor(config) {
    this.config = config;
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
        user: this.config.email,
        password: this.config.password,
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
        console.log(`✅ IMAP connection ready for ${this.config.email}`);
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        this.isConnecting = false;
        this.isConnected = false;
        console.error(`❌ IMAP connection error for ${this.config.email}:`, err.message);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} for ${this.config.email}`);
          setTimeout(() => {
            this.connect().then(resolve).catch(reject);
          }, this.reconnectDelay);
        } else {
          reject(err);
        }
      });

      this.connection.once('end', () => {
        this.isConnected = false;
        console.log(`📤 IMAP connection closed for ${this.config.email}`);
      });

      this.connection.on('close', (hadError) => {
        this.isConnected = false;
        console.log(`🔒 IMAP connection closed ${hadError ? 'with error' : 'normally'} for ${this.config.email}`);
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

const imapManager = new IMAPConnectionManager();

// ✅ UPDATED: Check duplicate using Supabase with account info
async function checkDuplicate(messageId, accountId) {
  try {
    if (supabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from('emails')
        .select('message_id')
        .eq('message_id', messageId)
        .eq('account_id', accountId)
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

// FIXED: Enhanced storage setup
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

// FIXED: Enhanced attachment processing
async function processAttachments(attachments, accountId) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments for account ${accountId}`);
  
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

      // Create unique path with account ID and timestamp
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const uniquePath = `emails/account_${accountId}/${timestamp}_${randomId}_${safeFilename}`;

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
        console.log(`   🚫 Skipping small file: ${safeFilename}`);
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

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path);

      const attachmentResult = {
        id: `att_${accountId}_${timestamp}_${index}_${randomId}`,
        filename: safeFilename,
        originalFilename: originalFilename,
        name: originalFilename,
        displayName: originalFilename,
        url: urlData.publicUrl,
        publicUrl: urlData.publicUrl,
        downloadUrl: urlData.publicUrl,
        previewUrl: urlData.publicUrl,
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

  console.log(`📎 Completed: ${successfulAttachments.length}/${attachments.length} successful for account ${accountId}`);
  
  return successfulAttachments;
}

// FIXED: Enhanced email data structure with account info
function createEmailData(parsed, messageId, attachmentLinks, accountId, options = {}) {
  const attachments = attachmentLinks.map(att => ({
    id: att.id,
    filename: att.filename,
    originalFilename: att.originalFilename,
    name: att.name,
    displayName: att.displayName,
    url: att.url,
    publicUrl: att.publicUrl,
    downloadUrl: att.downloadUrl,
    previewUrl: att.previewUrl,
    contentType: att.contentType,
    type: att.type,
    mimeType: att.mimeType,
    size: att.size,
    extension: att.extension,
    path: att.path,
    isImage: att.isImage,
    isPdf: att.isPdf,
    isText: att.isText,
    isAudio: att.isAudio,
    isVideo: att.isVideo,
    base64: att.base64 || false
  }));

  const emailData = {
    messageId: messageId,
    accountId: accountId,
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

// NEW: Get all email configurations
app.get("/api/email-configs", (req, res) => {
  try {
    const configs = emailConfigManager.getAllConfigs().map(config => ({
      id: config.id,
      email: config.email,
      name: config.name
    }));
    
    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error("❌ Get email configs error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// UPDATED: Fetch emails from specific account or all accounts
app.post("/api/fetch-emails", async (req, res) => {
  console.log("🔍 DEBUG: /api/fetch-emails called");
  try {
    const { 
      mode = "latest", 
      count = 20, 
      accountId = "all" // "all" or specific account ID
    } = req.body;
    
    let accountsToProcess = [];
    
    if (accountId === "all") {
      // Process all accounts
      accountsToProcess = emailConfigManager.getAllConfigs();
      console.log(`🔄 Processing ALL accounts: ${accountsToProcess.length} accounts`);
    } else {
      // Process specific account
      const config = emailConfigManager.getConfig(accountId);
      if (!config) {
        return res.status(400).json({ 
          success: false,
          error: `Account ${accountId} not found` 
        });
      }
      accountsToProcess = [config];
      console.log(`🔄 Processing specific account: ${config.email}`);
    }

    const allResults = [];
    
    for (const account of accountsToProcess) {
      console.log(`📧 Processing account ${account.id}: ${account.email}`);
      
      try {
        const connection = await imapManager.getConnection(account.id);
        
        if (connection.connection.state !== 'authenticated') {
          console.error(`❌ IMAP not connected for account ${account.id}`);
          continue;
        }

        const accountResult = await new Promise((resolve) => {
          connection.openInbox(async function (err, box) {
            if (err) {
              console.error(`❌ Failed to open inbox for ${account.email}:`, err.message);
              resolve({
                accountId: account.id,
                accountEmail: account.email,
                success: false,
                error: "Failed to open inbox: " + err.message
              });
              return;
            }
            
            console.log(`📥 Total Messages for ${account.email}: ${box.messages.total}`);
            
            // Calculate fetch range
            const totalMessages = box.messages.total;
            const fetchCount = Math.min(count, totalMessages);
            const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
            const fetchEnd = totalMessages;
            const fetchRange = `${fetchStart}:${fetchEnd}`;

            console.log(`📨 Fetching range for ${account.email}: ${fetchRange}`);

            const f = connection.connection.seq.fetch(fetchRange, { 
              bodies: "",
              struct: true 
            });

            let processedCount = 0;
            let duplicateCount = 0;
            let newEmails = [];
            let processingDetails = [];

            f.on("message", function (msg, seqno) {
              console.log(`📨 Processing message #${seqno} for ${account.email}`);
              let buffer = "";

              msg.on("body", function (stream) {
                stream.on("data", function (chunk) {
                  buffer += chunk.toString("utf8");
                });
              });

              msg.once("end", async function () {
                try {
                  const parsed = await simpleParser(buffer);

                  // Generate messageId if missing
                  const messageId = parsed.messageId || `email-${account.id}-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

                  // Check for duplicates (skip for force mode)
                  if (mode !== "force") {
                    const isDuplicate = await checkDuplicate(messageId, account.id);
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
                  const attachmentLinks = await processAttachments(parsed.attachments || [], account.id);

                  // Create email data with enhanced structure
                  const emailData = createEmailData(parsed, messageId, attachmentLinks, account.id, {
                    fetchMode: mode,
                    sequenceNumber: seqno
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
            });

            f.once("error", function (err) {
              console.error(`❌ Fetch error for ${account.email}:`, err);
              resolve({
                accountId: account.id,
                accountEmail: account.email,
                success: false,
                error: "Fetch error: " + err.message
              });
            });

            f.once("end", async function () {
              console.log(`🔄 Processing ${newEmails.length} new emails for ${account.email}...`);
              
              try {
                // Save to Supabase ONLY
                if (newEmails.length > 0) {
                  console.log(`💾 Saving ${newEmails.length} emails to Supabase for ${account.email}...`);
                  
                  const saveOps = newEmails.map(async (email) => {
                    try {
                      if (supabaseEnabled && supabase) {
                        const supabaseData = {
                          message_id: email.messageId,
                          account_id: email.accountId,
                          subject: email.subject,
                          from_text: email.from,
                          to_text: email.to,
                          date: email.date,
                          text_content: email.text,
                          html_content: email.html,
                          attachments: email.attachments,
                          has_attachments: email.hasAttachments,
                          attachments_count: email.attachmentsCount,
                          created_at: new Date(),
                          updated_at: new Date()
                        };

                        const { error: supabaseError } = await supabase.from('emails').upsert(supabaseData);
                        if (supabaseError) {
                          console.error("   ❌ Supabase save error:", supabaseError);
                        } else {
                          console.log(`   ✅ Saved to Supabase: ${email.subject}`);
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
                  console.log(`🗑️ Cleared cache for ${account.email}`);
                }

                console.log(`✅ Fetch completed for ${account.email}: ${processedCount} new, ${duplicateCount} duplicates`);
                
                resolve({
                  accountId: account.id,
                  accountEmail: account.email,
                  success: true,
                  message: `Processed ${processedCount} new emails`,
                  data: {
                    processed: processedCount,
                    duplicates: duplicateCount,
                    total: processedCount + duplicateCount,
                    emails: newEmails,
                    details: processingDetails
                  }
                });

              } catch (batchError) {
                console.error(`❌ Batch processing error for ${account.email}:`, batchError);
                resolve({
                  accountId: account.id,
                  accountEmail: account.email,
                  success: false,
                  error: "Batch processing failed: " + batchError.message
                });
              }
            });
          });
        });

        allResults.push(accountResult);

      } catch (accountError) {
        console.error(`❌ Account processing error for ${account.email}:`, accountError);
        allResults.push({
          accountId: account.id,
          accountEmail: account.email,
          success: false,
          error: accountError.message
        });
      }
    }

    // Summarize results
    const successfulAccounts = allResults.filter(r => r.success);
    const failedAccounts = allResults.filter(r => !r.success);
    const totalProcessed = successfulAccounts.reduce((sum, r) => sum + (r.data?.processed || 0), 0);
    const totalDuplicates = successfulAccounts.reduce((sum, r) => sum + (r.data?.duplicates || 0), 0);

    res.json({
      success: true,
      message: `Processed ${accountsToProcess.length} accounts`,
      summary: {
        totalAccounts: accountsToProcess.length,
        successfulAccounts: successfulAccounts.length,
        failedAccounts: failedAccounts.length,
        totalProcessed,
        totalDuplicates
      },
      accounts: allResults
    });

  } catch (error) {
    console.error("❌ Fetch emails API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ FIXED: Get emails from Supabase - Handle includeAttachments parameter
app.get("/api/emails", async (req, res) => {
  try {
    const { 
      search = "", 
      sort = "date_desc", 
      page = 1, 
      limit = 50,
      accountId = "all", // "all" or specific account ID
      includeAttachments = "true" // Handle the new parameter
    } = req.query;
    
    console.log(`📧 GET /api/emails called with params:`, {
      search, sort, page, limit, accountId, includeAttachments
    });
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    const includeAttachmentsBool = includeAttachments === "true";

    // Create cache key with account filter
    const cacheKey = `emails:${accountId}:${search}:${sort}:${pageNum}:${limitNum}:${includeAttachments}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log("📦 Serving from cache");
      return res.json(cached);
    }

    if (!supabaseEnabled || !supabase) {
      console.error("❌ Supabase is not available");
      return res.status(500).json({ 
        error: "Supabase is not available" 
      });
    }

    let query = supabase.from('emails').select('*', { count: 'exact' });
    
    // Add account filter if not "all"
    if (accountId !== "all") {
      const accountNum = parseInt(accountId);
      if (isNaN(accountNum)) {
        return res.status(400).json({
          error: "Invalid accountId parameter"
        });
      }
      query = query.eq('account_id', accountNum);
    }
    
    // Add search if provided
    if (search && search.trim().length > 0) {
      query = query.or(`subject.ilike.%${search}%,from_text.ilike.%${search}%,text_content.ilike.%${search}%`);
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
    
    const { data: emails, error, count: totalCount } = await query;
    
    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch emails from Supabase",
        details: error.message 
      });
    }

    // Enhanced email data for frontend
    const enhancedEmails = emails.map(email => {
      // Ensure attachments is always an array
      let attachments = [];
      try {
        if (email.attachments && Array.isArray(email.attachments)) {
          attachments = email.attachments;
        } else if (email.attachments && typeof email.attachments === 'string') {
          // Try to parse if it's a string
          attachments = JSON.parse(email.attachments);
        }
      } catch (parseError) {
        console.warn(`⚠️ Could not parse attachments for email ${email.message_id}:`, parseError);
        attachments = [];
      }

      const emailData = {
        id: email.message_id,
        _id: email.message_id,
        messageId: email.message_id,
        accountId: email.account_id,
        subject: email.subject || '(No Subject)',
        from: email.from_text || '',
        from_text: email.from_text || '',
        to: email.to_text || '',
        to_text: email.to_text || '',
        date: email.date || email.created_at,
        text: email.text_content || '',
        text_content: email.text_content || '',
        html: email.html_content || '',
        html_content: email.html_content || '',
        hasAttachments: email.has_attachments || false,
        attachmentsCount: email.attachments_count || 0,
        read: email.read || false,
        created_at: email.created_at,
        updated_at: email.updated_at
      };

      // Only include attachments data if requested
      if (includeAttachmentsBool) {
        emailData.attachments = attachments;
      } else {
        emailData.attachments = [];
      }

      return emailData;
    });

    const hasMore = skip + enhancedEmails.length < totalCount;

    const response = {
      success: true,
      emails: enhancedEmails,
      total: totalCount,
      hasMore,
      page: pageNum,
      limit: limitNum,
      source: 'supabase',
      accountFilter: accountId,
      includeAttachments: includeAttachmentsBool
    };

    setToCache(cacheKey, response);

    console.log(`✅ Sending ${enhancedEmails.length} emails from Supabase (account: ${accountId})`);
    res.json(response);

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch emails",
      details: error.message 
    });
  }
});

// NEW: Get emails grouped by account
app.get("/api/emails-by-account", async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        error: "Supabase is not available" 
      });
    }

    // Get latest emails from each account
    const accounts = emailConfigManager.getAllConfigs();
    const accountEmails = {};

    for (const account of accounts) {
      const { data: emails, error } = await supabase
        .from('emails')
        .select('*')
        .eq('account_id', account.id)
        .order('date', { ascending: false })
        .limit(parseInt(limit));

      if (!error && emails) {
        accountEmails[account.id] = {
          account: {
            id: account.id,
            email: account.email,
            name: account.name
          },
          emails: emails.map(email => ({
            id: email.message_id,
            subject: email.subject,
            from: email.from_text,
            date: email.date,
            hasAttachments: email.has_attachments,
            attachmentsCount: email.attachments_count
          }))
        };
      }
    }

    res.json({
      success: true,
      data: accountEmails
    });

  } catch (error) {
    console.error("❌ Emails by account error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
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

    const accounts = emailConfigManager.getAllConfigs();
    const accountStatus = {};

    for (const account of accounts) {
      try {
        const connection = await imapManager.getConnection(account.id);
        const isConnected = await connection.checkConnection();
        accountStatus[account.id] = isConnected ? "connected" : "disconnected";
      } catch (error) {
        accountStatus[account.id] = "error";
      }
    }

    res.json({
      status: "ok",
      services: {
        supabase: supabaseStatus,
        storage: storageStatus,
        accounts: accountStatus
      },
      accounts: accounts.length,
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

// Clear cache endpoint
app.post("/api/clear-cache", (req, res) => {
  const cacheSize = cache.size;
  clearCache();
  res.json({ 
    success: true, 
    message: `Cleared ${cacheSize} cache entries` 
  });
});

// Root endpoint
app.get("/", (req, res) => {
  const accounts = emailConfigManager.getAllConfigs();
  
  res.json({
    message: "Email IMAP Backend Server - Multi-Account Support",
    version: "4.0.0",
    environment: process.env.NODE_ENV || 'development',
    supabase: supabaseEnabled ? "enabled" : "disabled",
    accounts: accounts.length,
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/email-configs": "Get all email configurations",
      "GET /api/emails": "Get emails with account filtering",
      "GET /api/emails-by-account": "Get emails grouped by account",
      "POST /api/fetch-emails": "Fetch new emails from specific or all accounts",
      "DELETE /api/emails/:messageId": "Delete email and attachments",
      "GET /api/test-attachment-urls": "Test attachment URL generation",
      "GET /api/debug-env": "Debug environment variables",
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
  console.log(`📧 Email Accounts: ${emailConfigManager.getAllConfigs().length}`);
}

// Call initialization
initializeApp();

// Vercel serverless function handler
const handler = async (req, res) => {
  try {
    // Initialize Supabase on each request to ensure it's ready
    if (!supabaseEnabled) {
      initializeSupabase();
    }
    
    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export default handler;