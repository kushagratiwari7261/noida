import express from "express";
import cors from "cors";
import Imap from "imap";
import { simpleParser } from "mailparser";
import { MongoClient } from "mongodb";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from 'url';

// Load environment variables locally (not needed in Vercel)
if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

console.log("🔍 DEBUG: Environment check - EMAIL_USER:", !!process.env.EMAIL_USER, "EMAIL_PASS:", !!process.env.EMAIL_PASS, "MONGO_URI:", !!process.env.MONGO_URI, "SUPABASE_URL:", !!process.env.SUPABASE_URL, "SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);

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

// FIXED: Enhanced Supabase client initialization with fallback
let supabase = null;
let supabaseEnabled = false;

const initializeSupabase = () => {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      console.log("🔧 Initializing Supabase client...");
      console.log("📋 SUPABASE_URL:", process.env.SUPABASE_URL);
      console.log("📋 SUPABASE_SERVICE_KEY length:", process.env.SUPABASE_SERVICE_KEY?.length);
      console.log("📋 SUPABASE_SERVICE_KEY preview:", process.env.SUPABASE_SERVICE_KEY?.substring(0, 20) + '...');
      
      // Test if the key is expired by decoding JWT
      try {
        const payload = JSON.parse(Buffer.from(process.env.SUPABASE_SERVICE_KEY.split('.')[1], 'base64').toString());
        console.log("📋 JWT Payload:", {
          role: payload.role,
          iss: payload.iss,
          exp: new Date(payload.exp * 1000),
          iat: new Date(payload.iat * 1000),
          now: new Date()
        });
        
        if (payload.exp * 1000 < Date.now()) {
          console.error("❌ Supabase service key has EXPIRED!");
          supabaseEnabled = false;
          return false;
        }
      } catch (jwtError) {
        console.error("❌ Failed to decode JWT:", jwtError.message);
      }
      
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          },
          global: {
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_KEY
            }
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

// Enhanced IMAP Connection Manager
class IMAPConnection {
  constructor() {
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
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASS,
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
        console.log("✅ IMAP connection ready");
        resolve(this.connection);
      });

      this.connection.once('error', (err) => {
        this.isConnecting = false;
        this.isConnected = false;
        console.error("❌ IMAP connection error:", err.message);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
          setTimeout(() => {
            this.connect().then(resolve).catch(reject);
          }, this.reconnectDelay);
        } else {
          reject(err);
        }
      });

      this.connection.once('end', () => {
        this.isConnected = false;
        console.log("📤 IMAP connection closed");
      });

      this.connection.on('close', (hadError) => {
        this.isConnected = false;
        console.log(`🔒 IMAP connection closed ${hadError ? 'with error' : 'normally'}`);
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
}

const imapManager = new IMAPConnection();

// Database connections
let mongoClient = null;
let isMongoConnected = false;
let db = null;

if (process.env.MONGO_URI) {
  mongoClient = new MongoClient(process.env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
}

async function ensureMongoConnection() {
  if (isMongoConnected && db) return db;

  if (!mongoClient) {
    console.log("⚠️ MongoDB URI not provided, skipping MongoDB connection");
    return null;
  }

  try {
    if (!isMongoConnected) {
      await mongoClient.connect();
      db = mongoClient.db("imapdb");
      isMongoConnected = true;
      console.log("✅ MongoDB connected");

      await setupIndexes();
    }
    return db;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    isMongoConnected = false;
    return null;
  }
}

async function setupIndexes() {
  try {
    if (db) {
      await db.collection("emails").createIndex({ messageId: 1 }, { unique: true });
      await db.collection("emails").createIndex({ date: -1 });
      await db.collection("emails").createIndex({ subject: 1 });
      await db.collection("emails").createIndex({ from: 1 });
      console.log("✅ Database indexes created");
    }
  } catch (err) {
    console.error("❌ Index creation error:", err.message);
  }
}

function openInbox(cb) {
  imapManager.connection.openBox("INBOX", true, cb);
}

async function checkDuplicate(messageId) {
  try {
    // Check MongoDB
    const mongoDb = await ensureMongoConnection();
    if (mongoDb) {
      const existing = await mongoDb.collection("emails").findOne({ messageId });
      if (existing) return true;
    }

    // Check Supabase only if enabled
    if (supabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from('emails')
        .select('message_id')
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

// FIXED: Enhanced storage setup with fallback
async function ensureStorageBucket() {
  try {
    console.log("🛠️ Ensuring storage bucket exists and is public...");

    if (!supabaseEnabled || !supabase) {
      console.log("⚠️ Supabase not available, using MongoDB-only mode");
      return false;
    }

    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error("❌ Cannot list buckets:", bucketsError.message);
      return false;
    }

    console.log("📋 Available buckets:", buckets?.map(b => ({ name: b.name, public: b.public })) || []);

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
    /\.gif$/i, // Skip all GIFs as they're often tracking pixels
    /signature/i
  ];
  
  return problematicPatterns.some(pattern => 
    pattern.test(lowerFilename) || pattern.test(lowerContentType)
  );
}

// FIXED: Enhanced attachment processing with fallback to base64
async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments`);
  
  // If Supabase is not available, use base64 encoding as fallback
  if (!supabaseEnabled || !supabase) {
    console.log("⚠️ Supabase not available, using base64 fallback for attachments");
    
    const base64Attachments = attachments.map((att, index) => {
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
        
        // Convert to base64 for fallback storage
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
          console.log(`   🚫 Skipping small file (likely tracking pixel): ${originalFilename}`);
          return null;
        }

        const base64Data = contentBuffer.toString('base64');
        
        const attachmentResult = {
          id: `att_base64_${Date.now()}_${index}`,
          filename: originalFilename,
          originalFilename: originalFilename,
          name: originalFilename,
          displayName: originalFilename,
          url: `data:${att.contentType || 'application/octet-stream'};base64,${base64Data}`,
          publicUrl: `data:${att.contentType || 'application/octet-stream'};base64,${base64Data}`,
          downloadUrl: `data:${att.contentType || 'application/octet-stream'};base64,${base64Data}`,
          previewUrl: `data:${att.contentType || 'application/octet-stream'};base64,${base64Data}`,
          contentType: att.contentType || 'application/octet-stream',
          type: att.contentType || 'application/octet-stream',
          mimeType: att.contentType || 'application/octet-stream',
          size: contentBuffer.length,
          extension: originalFilename.split('.').pop() || 'bin',
          path: 'base64_fallback',
          isImage: (att.contentType || '').startsWith('image/'),
          isPdf: (att.contentType || '') === 'application/pdf',
          isText: (att.contentType || '').startsWith('text/'),
          isAudio: (att.contentType || '').startsWith('audio/'),
          isVideo: (att.contentType || '').startsWith('video/'),
          base64: true
        };

        console.log(`   ✅ Base64 fallback for: ${originalFilename}`);
        return attachmentResult;

      } catch (attErr) {
        console.error(`   ❌ Base64 attachment processing error:`, attErr.message);
        return null;
      }
    }).filter(att => att !== null);

    console.log(`📎 Base64 fallback completed: ${base64Attachments.length}/${attachments.length} successful`);
    return base64Attachments;
  }

  // Normal Supabase processing
  const storageReady = await ensureStorageBucket();
  if (!storageReady) {
    console.error("❌ Storage not ready, using base64 fallback");
    return await processAttachments(attachments); // Recursive call with fallback
  }

  const attachmentPromises = attachments.map(async (att, index) => {
    try {
      console.log(`   🔍 Attachment ${index + 1}:`, {
        filename: att.filename,
        contentType: att.contentType,
        size: att.size || att.content?.length || 0
      });

      // Skip tracking pixels and problematic files
      if (isProblematicFile(att.filename, att.contentType)) {
        console.log(`   🚫 Skipping problematic file: ${att.filename}`);
        return null;
      }

      // Validate attachment content
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
        console.log(`   🚫 Skipping small file (likely tracking pixel): ${safeFilename}`);
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

      console.log(`   🔗 Generated URL: ${urlData.publicUrl}`);

      const attachmentResult = {
        id: `att_${timestamp}_${index}_${randomId}`,
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

      console.log(`   📋 Final attachment:`, {
        filename: attachmentResult.filename,
        url: attachmentResult.url,
        isImage: attachmentResult.isImage,
        size: attachmentResult.size
      });

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

// FIXED: Enhanced email data structure for frontend compatibility
function createEmailData(parsed, messageId, attachmentLinks, options = {}) {
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

  console.log(`📧 Created email data:`, {
    subject: emailData.subject,
    attachments: emailData.attachmentsCount,
    hasAttachments: emailData.hasAttachments,
    usingBase64: attachments.some(att => att.base64)
  });

  return emailData;
}

// ========== API ENDPOINTS ==========

// NEW: Test endpoint to verify attachment URLs
app.get("/api/test-attachment-urls", async (req, res) => {
  try {
    console.log("🧪 Testing attachment URL generation...");
    
    if (!supabaseEnabled || !supabase) {
      return res.json({
        success: false,
        message: "Supabase is not available",
        fallback: "Using base64 attachment encoding",
        environment: {
          SUPABASE_URL: !!process.env.SUPABASE_URL,
          SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
          supabaseEnabled: supabaseEnabled,
          serviceKeyPreview: process.env.SUPABASE_SERVICE_KEY?.substring(0, 20) + '...'
        }
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
        details: uploadError.message,
        supabaseUrl: process.env.SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("attachments")
      .getPublicUrl(uploadData.path);

    console.log("🔗 Generated URL:", urlData.publicUrl);

    // Test if URL is accessible
    let urlAccessible = false;
    let testResponse = null;
    try {
      testResponse = await fetch(urlData.publicUrl);
      urlAccessible = testResponse.ok;
      console.log("✅ URL accessibility test:", urlAccessible);
    } catch (fetchError) {
      console.log("❌ URL access test failed:", fetchError.message);
    }

    // Clean up test file
    await supabase.storage.from("attachments").remove([testPath]);

    res.json({
      success: true,
      test: {
        filename: testFilename,
        path: uploadData.path,
        publicUrl: urlData.publicUrl,
        urlAccessible: urlAccessible,
        status: testResponse?.status,
        bucket: 'attachments'
      },
      supabase: {
        url: process.env.SUPABASE_URL,
        hasClient: !!supabase,
        serviceKeyLength: process.env.SUPABASE_SERVICE_KEY?.length,
        enabled: supabaseEnabled
      }
    });

  } catch (error) {
    console.error("❌ Attachment URL test failed:", error);
    res.status(500).json({ 
      error: error.message,
      supabaseStatus: supabaseEnabled ? "enabled" : "disabled"
    });
  }
});

// NEW: Debug environment
app.get("/api/debug-env", (req, res) => {
  res.json({
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_URL: process.env.SUPABASE_URL ? "Set" : "Not set",
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? `Set (length: ${process.env.SUPABASE_SERVICE_KEY.length})` : "Not set",
      SERVICE_KEY_PREVIEW: process.env.SUPABASE_SERVICE_KEY ? process.env.SUPABASE_SERVICE_KEY.substring(0, 20) + '...' : null,
      EMAIL_USER: process.env.EMAIL_USER ? "Set" : "Not set",
      MONGO_URI: process.env.MONGO_URI ? "Set" : "Not set"
    },
    supabase: {
      enabled: supabaseEnabled,
      initialized: !!supabase
    }
  });
});

// FIXED: Unified fetch endpoint with fallback attachment handling
app.post("/api/fetch-emails", async (req, res) => {
  console.log("🔍 DEBUG: /api/fetch-emails called");
  try {
    const { mode = "latest", count = 20 } = req.body;
    
    await imapManager.connect();
    
    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log(`🔄 Fetching emails in ${mode} mode, count: ${count}`);
    console.log(`📋 Supabase enabled: ${supabaseEnabled}`);
    
    openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 Total Messages: ${box.messages.total}`);
      
      // Calculate fetch range
      const totalMessages = box.messages.total;
      const fetchCount = Math.min(count, totalMessages);
      const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
      const fetchEnd = totalMessages;
      const fetchRange = `${fetchStart}:${fetchEnd}`;

      console.log(`📨 Fetching range: ${fetchRange}`);

      const f = imapManager.connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let duplicateCount = 0;
      let newEmails = [];
      let processingDetails = [];

      f.on("message", function (msg, seqno) {
        console.log(`📨 Processing message #${seqno}`);
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
            const messageId = parsed.messageId || `email-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Check for duplicates (skip for force mode)
            if (mode !== "force") {
              const isDuplicate = await checkDuplicate(messageId);
              if (isDuplicate) {
                console.log(`   ⚠️ Duplicate skipped: ${parsed.subject}`);
                duplicateCount++;
                processingDetails.push({
                  messageId: messageId.substring(0, 50) + '...',
                  subject: parsed.subject || '(No Subject)',
                  status: 'duplicate',
                  reason: 'Already exists in database'
                });
                return;
              }
            }

            // Process attachments
            console.log(`   📎 Processing attachments for: ${parsed.subject}`);
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // Create email data with enhanced structure
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
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
              reason: `Processed in ${mode} mode`,
              attachments: attachmentLinks.length,
              usingBase64: attachmentLinks.some(att => att.base64)
            });

          } catch (parseErr) {
            console.error("   ❌ Parse error:", parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error("❌ Fetch error:", err);
        res.status(500).json({ 
          success: false,
          error: "Fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 Processing ${newEmails.length} new emails...`);
        
        try {
          // Save to databases
         // Save to databases
if (newEmails.length > 0) {
  console.log(`💾 Saving ${newEmails.length} emails to Supabase ONLY...`);
  
  const saveOps = newEmails.map(async (email) => {
    try {
      // ✅ Save to Supabase ONLY
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
          created_at: new Date(),
          updated_at: new Date()
        };

        const { error: supabaseError } = await supabase.from('emails').upsert(supabaseData);
        if (supabaseError) {
          console.error("   ❌ Supabase save error:", supabaseError);
        } else {
          console.log(`   ✅ Saved to Supabase: ${email.subject}`);
        }
      } else {
        console.log(`   ⚠️ Supabase not available, email not saved: ${email.subject}`);
      }
      
      return true;
    } catch (saveErr) {
      console.error(`   ❌ Error saving email:`, saveErr);
      return false;
    }
  });

  await Promise.allSettled(saveOps);
  clearCache();
  console.log(`🗑️ Cleared cache`);
}
          console.log(`✅ Fetch completed: ${processedCount} new, ${duplicateCount} duplicates`);
          
          res.json({
            success: true,
            message: `Processed ${processedCount} new emails`,
            data: {
              processed: processedCount,
              duplicates: duplicateCount,
              total: processedCount + duplicateCount,
              emails: newEmails,
              details: processingDetails,
              supabaseEnabled: supabaseEnabled
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

// FIXED: Enhanced emails endpoint with proper attachment enhancement
// FIXED: Enhanced emails endpoint with Supabase primary
app.get("/api/emails", async (req, res) => {
  try {
    const { search = "", sort = "date_desc", page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Create cache key
    const cacheKey = `emails:${search}:${sort}:${pageNum}:${limitNum}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log("📦 Serving from cache");
      return res.json(cached);
    }

    let emails = [];
    let total = 0;
    let source = 'unknown';

    // ✅ PRIMARY: Try Supabase first
    if (supabaseEnabled) {
      try {
        console.log("📧 Fetching from Supabase...");
        
        let query = supabase.from('emails').select('*', { count: 'exact' });
        
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
        
        const { data: supabaseEmails, error, count } = await query;
        
        if (!error && supabaseEmails) {
          emails = supabaseEmails;
          total = count;
          source = 'supabase';
          console.log(`✅ Found ${emails.length} emails in Supabase`);
        } else {
          console.error("Supabase query failed:", error?.message);
        }
      } catch (supabaseError) {
        console.error("Supabase fetch failed, falling back to MongoDB:", supabaseError);
      }
    }
    
    // ✅ FALLBACK: MongoDB (only if Supabase fails or not enabled)
    if (emails.length === 0) {
      const mongoDb = await ensureMongoConnection();
      if (mongoDb) {
        try {
          // Build query for search
          let query = {};
          if (search && search.trim().length > 0) {
            const searchRegex = new RegExp(search.trim(), 'i');
            query = {
              $or: [
                { subject: searchRegex },
                { from: searchRegex },
                { from_text: searchRegex },
                { text: searchRegex },
                { text_content: searchRegex }
              ]
            };
          }

          // Build sort
          let sortOption = {};
          switch (sort) {
            case "date_asc":
              sortOption = { date: 1 };
              break;
            case "subject_asc":
              sortOption = { subject: 1 };
              break;
            case "subject_desc":
              sortOption = { subject: -1 };
              break;
            default: // date_desc
              sortOption = { date: -1 };
          }

          emails = await mongoDb.collection("emails")
            .find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limitNum)
            .toArray();

          total = await mongoDb.collection("emails").countDocuments(query);
          source = 'mongodb';
          console.log(`📧 Found ${emails.length} emails in MongoDB (fallback)`);

        } catch (mongoError) {
          console.error("MongoDB query failed:", mongoError);
        }
      }
    }

    // FIXED: Enhanced attachment processing for frontend
    const enhancedEmails = emails.map(email => {
      const emailId = email.message_id || email._id || email.id || email.messageId;
      
      // Process attachments
      let processedAttachments = [];
      if (email.attachments && Array.isArray(email.attachments)) {
        processedAttachments = email.attachments.map(att => {
          const attachmentUrl = att.url || att.publicUrl || att.downloadUrl;
          
          return {
            id: att.id || `att_${emailId}_${Math.random().toString(36).substr(2, 9)}`,
            filename: att.filename || att.name || att.originalFilename || 'attachment',
            name: att.name || att.filename || 'attachment',
            originalFilename: att.originalFilename || att.filename || 'attachment',
            displayName: att.displayName || att.filename || 'attachment',
            url: attachmentUrl,
            publicUrl: att.publicUrl || attachmentUrl,
            downloadUrl: att.downloadUrl || attachmentUrl,
            previewUrl: att.previewUrl || attachmentUrl,
            contentType: att.contentType || att.type || att.mimeType || 'application/octet-stream',
            type: att.type || att.contentType || 'application/octet-stream',
            mimeType: att.mimeType || att.contentType || 'application/octet-stream',
            size: att.size || 0,
            extension: att.extension || (att.filename ? att.filename.split('.').pop() : 'bin'),
            path: att.path,
            isImage: att.isImage || (att.contentType || '').startsWith('image/'),
            isPdf: att.isPdf || (att.contentType || '') === 'application/pdf',
            isText: att.isText || (att.contentType || '').startsWith('text/'),
            isAudio: att.isAudio || (att.contentType || '').startsWith('audio/'),
            isVideo: att.isVideo || (att.contentType || '').startsWith('video/'),
            base64: att.base64 || false
          };
        }).filter(att => att.url); // Only keep attachments with URLs
      }

      const enhancedEmail = {
        id: emailId,
        _id: emailId,
        messageId: email.message_id || email.messageId,
        subject: email.subject || '(No Subject)',
        from: email.from_text || email.from,
        from_text: email.from_text || email.from,
        to: email.to_text || email.to,
        to_text: email.to_text || email.to,
        date: email.date,
        text: email.text_content || email.text,
        text_content: email.text_content || email.text,
        html: email.html_content || email.html,
        html_content: email.html_content || email.html,
        attachments: processedAttachments,
        hasAttachments: email.has_attachments || processedAttachments.length > 0,
        attachmentsCount: email.attachments_count || processedAttachments.length,
        read: email.read || false
      };

      return enhancedEmail;
    });

    const hasMore = skip + enhancedEmails.length < total;

    const response = {
      emails: enhancedEmails,
      total,
      hasMore,
      page: pageNum,
      limit: limitNum,
      source,
      supabaseEnabled: supabaseEnabled
    };

    setToCache(cacheKey, response);

    console.log(`✅ Sending ${enhancedEmails.length} emails to frontend (from ${source})`);
    res.json(response);

  } catch (error) {
    console.error("❌ Emails fetch error:", error);
    res.status(500).json({ 
      error: "Failed to fetch emails",
      details: error.message 
    });
  }
}); 

// 1. Check migration status (simplified)
app.get("/api/migration-status", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    if (!mongoDb) {
      return res.status(500).json({ error: "MongoDB not available" });
    }

    const totalEmails = await mongoDb.collection("emails").countDocuments();
    const migratedEmails = await mongoDb.collection("emails").countDocuments({ 
      migratedToSupabase: true 
    });
    const nonMigratedEmails = totalEmails - migratedEmails;

    res.json({
      totalEmails,
      migratedEmails,
      nonMigratedEmails,
      migrationProgress: totalEmails > 0 ? (migratedEmails / totalEmails * 100).toFixed(2) + '%' : '0%',
      supabaseEnabled: supabaseEnabled,
      recommendation: nonMigratedEmails > 0 ? 
        `Run metadata migration with batch size ${Math.min(100, nonMigratedEmails)}` : 
        'All emails migrated to Supabase!'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Simple metadata migration
app.post("/api/migrate-to-supabase", async (req, res) => {
  try {
    const { batchSize = 50 } = req.body;
    
    console.log(`🔄 Starting metadata migration for ${batchSize} emails...`);
    
    // Get MongoDB connection
    const mongoDb = await ensureMongoConnection();
    if (!mongoDb) {
      return res.status(500).json({ error: "MongoDB not available" });
    }

    if (!supabaseEnabled) {
      return res.status(500).json({ error: "Supabase not available" });
    }

    // Get emails from MongoDB that haven't been migrated
    const emails = await mongoDb.collection("emails")
      .find({ 
        $or: [
          { migratedToSupabase: { $exists: false } },
          { migratedToSupabase: false }
        ]
      })
      .limit(batchSize)
      .toArray();

    console.log(`📧 Found ${emails.length} emails to migrate...`);

    let migratedCount = 0;
    let errorCount = 0;
    const migrationResults = [];

    for (const email of emails) {
      try {
        console.log(`📤 Migrating metadata: ${email.subject?.substring(0, 50)}...`);

        // Process attachments - they should already point to Supabase Storage
        let attachments = email.attachments || [];
        
        // Verify attachments point to Supabase
        const verifiedAttachments = attachments.map(att => {
          // If attachment URL doesn't point to Supabase, try to fix it
          if (att.url && !att.url.includes('supabase.co') && att.path) {
            // Reconstruct URL from path
            const { data: urlData } = supabase.storage
              .from("attachments")
              .getPublicUrl(att.path);
            return {
              ...att,
              url: urlData.publicUrl,
              publicUrl: urlData.publicUrl,
              downloadUrl: urlData.publicUrl,
              previewUrl: urlData.publicUrl
            };
          }
          return att;
        });

        // Prepare clean data for Supabase
        const supabaseData = {
          message_id: email.messageId || email._id?.toString(),
          subject: email.subject || '(No Subject)',
          from_text: email.from || email.from_text || '',
          to_text: email.to || email.to_text || '',
          date: email.date || new Date(),
          text_content: email.text || email.text_content || '',
          html_content: email.html || email.html_content || '',
          attachments: verifiedAttachments,
          has_attachments: verifiedAttachments.length > 0,
          attachments_count: verifiedAttachments.length,
          created_at: email.date || new Date(),
          updated_at: new Date(),
          migrated_from_mongodb: true,
          original_mongo_id: email._id?.toString()
        };

        // Insert into Supabase
        const { error: supabaseError } = await supabase
          .from('emails')
          .upsert(supabaseData, {
            onConflict: 'message_id'
          });

        if (supabaseError) {
          throw new Error(`Supabase error: ${supabaseError.message}`);
        }

        // Mark as migrated in MongoDB
        await mongoDb.collection("emails").updateOne(
          { _id: email._id },
          { 
            $set: { 
              migratedToSupabase: true,
              migratedAt: new Date()
            } 
          }
        );

        migratedCount++;
        migrationResults.push({
          subject: email.subject,
          status: 'success',
          attachments: verifiedAttachments.length,
          messageId: email.messageId
        });
        
        console.log(`✅ Migrated: ${email.subject}`);

      } catch (emailError) {
        console.error(`❌ Failed to migrate:`, emailError.message);
        errorCount++;
        migrationResults.push({
          subject: email.subject,
          status: 'error',
          error: emailError.message
        });
      }
    }

    res.json({
      success: true,
      message: `Metadata migration completed: ${migratedCount} migrated, ${errorCount} errors`,
      stats: {
        batchSize: emails.length,
        migrated: migratedCount,
        errors: errorCount,
        remaining: emails.length - migratedCount
      },
      results: migrationResults
    });

  } catch (error) {
    console.error("❌ Migration error:", error);
    res.status(500).json({ 
      success: false,
      error: "Migration failed: " + error.message 
    });
  }
});

// 3. Verify Supabase data integrity
app.get("/api/verify-supabase-data", async (req, res) => {
  try {
    if (!supabaseEnabled) {
      return res.status(500).json({ error: "Supabase not available" });
    }

    // Get count from Supabase
    const { count, error: countError } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Supabase count error: ${countError.message}`);
    }

    // Get MongoDB count
    const mongoDb = await ensureMongoConnection();
    const mongoCount = mongoDb ? await mongoDb.collection("emails").countDocuments() : 0;

    // Check a few records for data integrity
    const { data: sampleData, error: sampleError } = await supabase
      .from('emails')
      .select('message_id, subject, attachments_count')
      .limit(5);

    res.json({
      success: true,
      counts: {
        supabase: count,
        mongodb: mongoCount,
        difference: mongoCount - count
      },
      sampleData: sampleData,
      dataQuality: sampleData ? 'Good' : 'Check failed',
      recommendation: count === mongoCount ? 
        'Migration complete!' : 
        `Run migration for ${mongoCount - count} more emails`
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Add this temporary debug endpoint
app.get("/api/fix-supabase", async (req, res) => {
  // Reinitialize Supabase
  const success = initializeSupabase();
  
  // Test connection
  let testResult = "Failed";
  if (supabase) {
    try {
      const { data, error } = await supabase.from('emails').select('count', { count: 'exact', head: true });
      testResult = error ? `Error: ${error.message}` : "Connected successfully";
    } catch (err) {
      testResult = `Exception: ${err.message}`;
    }
  }

  res.json({
    reinitialized: success,
    supabaseEnabled: supabaseEnabled,
    connectionTest: testResult,
    hasSupabaseClient: !!supabase,
    envVars: {
      hasUrl: !!process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_SERVICE_KEY,
      urlPreview: process.env.SUPABASE_URL?.substring(0, 50) + '...',
      keyPreview: process.env.SUPABASE_SERVICE_KEY?.substring(0, 20) + '...'
    }
  });
});


// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    const mongoStatus = mongoDb ? "connected" : "disconnected";

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

    let imapStatus = "disconnected";
    try {
      const imapAlive = await imapManager.checkConnection();
      imapStatus = imapAlive ? "connected" : "disconnected";
    } catch (imapErr) {
      imapStatus = "error";
    }

    res.json({
      status: "ok",
      services: {
        mongodb: mongoStatus,
        supabase: supabaseStatus,
        storage: storageStatus,
        imap: imapStatus,
        supabaseEnabled: supabaseEnabled
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
  res.json({
    message: "Email IMAP Backend Server - Working with Fallback",
    version: "2.4.0",
    environment: process.env.NODE_ENV || 'development',
    supabase: supabaseEnabled ? "enabled" : "disabled (using fallback)",
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/emails": "Get emails with attachments",
      "POST /api/fetch-emails": "Fetch new emails",
      "GET /api/test-attachment-urls": "Test attachment URL generation",
      "GET /api/debug-env": "Debug environment variables",
      "POST /api/clear-cache": "Clear cache"
    },
    features: [
      "Base64 fallback for attachments",
      "MongoDB primary storage",
      "Enhanced error handling",
      "Better debugging information"
    ]
  });
});

// Serve static files from the React app build directory
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log('Serving index.html for:', req.path);
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
  console.log(`📋 Supabase: ${supabaseEnabled ? 'ENABLED' : 'DISABLED (using fallback)'}`);
}

// Call initialization
initializeApp();

// Vercel serverless function handler
export default (req, res) => {
  try {
    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  };
};