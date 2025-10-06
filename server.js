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

// FIXED: Enhanced Supabase client initialization
let supabase = null;

const initializeSupabase = () => {
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      console.log("🔧 Initializing Supabase client...");
      console.log("📋 SUPABASE_URL:", process.env.SUPABASE_URL);
      console.log("📋 SUPABASE_SERVICE_KEY length:", process.env.SUPABASE_SERVICE_KEY?.length);
      
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
      console.log("✅ Supabase client created successfully");
      return true;
    } else {
      console.error("❌ Supabase environment variables not set");
      console.error("❌ SUPABASE_URL:", !!process.env.SUPABASE_URL);
      console.error("❌ SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);
      return false;
    }
  } catch (error) {
    console.error("❌ Failed to create Supabase client:", error.message);
    console.error("❌ Error details:", error);
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

    // Check Supabase
    if (supabase) {
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

// FIXED: Enhanced storage setup with proper bucket configuration
async function ensureStorageBucket() {
  try {
    console.log("🛠️ Ensuring storage bucket exists and is public...");

    if (!supabase) {
      console.error("❌ Supabase client not available");
      const initialized = initializeSupabase();
      if (!initialized) {
        return false;
      }
    }

    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error("❌ Cannot list buckets:", bucketsError);
      console.error("❌ Bucket error details:", bucketsError.message);
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
        console.error("❌ Failed to create bucket:", createError);
        console.error("❌ Create bucket error details:", createError.message);
        return false;
      }
      console.log("✅ Created attachments bucket");
    } else {
      console.log("✅ Attachments bucket exists");
      
      // Ensure bucket is public
      const { error: updateError } = await supabase.storage.updateBucket('attachments', {
        public: true
      });

      if (updateError) {
        console.log("⚠️ Could not update bucket to public:", updateError.message);
      } else {
        console.log("✅ Bucket is public");
      }
    }

    // Test upload to verify everything works
    console.log("🧪 Testing upload...");
    const testContent = "Test file for storage verification";
    const testPath = `test-${Date.now()}.txt`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(testPath, testContent, {
        contentType: 'text/plain',
        upsert: false
      });

    if (uploadError) {
      console.error("❌ Test upload failed:", uploadError);
      return false;
    }

    console.log("✅ Test upload successful");

    // Get public URL and verify it's accessible
    const { data: urlData } = supabase.storage
      .from("attachments")
      .getPublicUrl(uploadData.path);

    console.log("🔗 Public URL:", urlData.publicUrl);

    // Clean up test file
    await supabase.storage.from("attachments").remove([testPath]);

    console.log("✅ Storage setup completed successfully");
    return true;

  } catch (error) {
    console.error("❌ Storage setup failed:", error);
    console.error("❌ Storage error details:", error.message);
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

// FIXED: Enhanced attachment processing with proper URL generation
async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments`);
  
  // Ensure storage is ready
  if (!supabase) {
    console.error("❌ Supabase client not available");
    const initialized = initializeSupabase();
    if (!initialized) {
      return [];
    }
  }

  const storageReady = await ensureStorageBucket();
  if (!storageReady) {
    console.error("❌ Storage not ready, skipping attachments");
    return [];
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

      // FIXED: Get public URL - this is the key fix
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path);

      console.log(`   🔗 Generated URL: ${urlData.publicUrl}`);

      // Enhanced attachment object for frontend
      const attachmentResult = {
        // Core identification
        id: `att_${timestamp}_${index}_${randomId}`,
        
        // File information
        filename: safeFilename,
        originalFilename: originalFilename,
        name: originalFilename,
        displayName: originalFilename,
        
        // URL information - FIXED: Provide multiple URL options
        url: urlData.publicUrl,
        publicUrl: urlData.publicUrl,
        downloadUrl: urlData.publicUrl,
        previewUrl: urlData.publicUrl,
        
        // File metadata
        contentType: att.contentType || 'application/octet-stream',
        type: att.contentType || 'application/octet-stream',
        mimeType: att.contentType || 'application/octet-stream',
        size: contentBuffer.length,
        extension: originalFilename.split('.').pop() || 'bin',
        path: data.path,
        
        // Frontend helpers
        isImage: (att.contentType || '').startsWith('image/'),
        isPdf: (att.contentType || '') === 'application/pdf',
        isText: (att.contentType || '').startsWith('text/'),
        isAudio: (att.contentType || '').startsWith('audio/'),
        isVideo: (att.contentType || '').startsWith('video/'),
        
        // Original data for reference
        originalData: {
          filename: att.filename,
          contentType: att.contentType,
          size: att.size
        }
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
  // Enhanced attachment structure for frontend
  const attachments = attachmentLinks.map(att => ({
    // Core identification
    id: att.id,
    
    // File information
    filename: att.filename,
    originalFilename: att.originalFilename,
    name: att.name,
    displayName: att.displayName,
    
    // URL information - FIXED: Multiple URL options
    url: att.url,
    publicUrl: att.publicUrl,
    downloadUrl: att.downloadUrl,
    previewUrl: att.previewUrl,
    
    // File metadata
    contentType: att.contentType,
    type: att.type,
    mimeType: att.mimeType,
    size: att.size,
    extension: att.extension,
    path: att.path,
    
    // Frontend helpers
    isImage: att.isImage,
    isPdf: att.isPdf,
    isText: att.isText,
    isAudio: att.isAudio,
    isVideo: att.isVideo
  }));

  const emailData = {
    // Core email data
    messageId: messageId,
    subject: parsed.subject || '(No Subject)',
    from: parsed.from?.text || "",
    to: parsed.to?.text || "",
    date: parsed.date || new Date(),
    text: parsed.text || "",
    html: parsed.html || "",
    
    // Enhanced from parsing
    fromName: parsed.from?.value?.[0]?.name || "",
    fromAddress: parsed.from?.value?.[0]?.address || "",
    
    // Attachments with enhanced structure
    attachments: attachments,
    hasAttachments: attachments.length > 0,
    attachmentsCount: attachments.length,
    
    // Processing info
    processedAt: new Date(),
    
    // Frontend helpers
    id: messageId, // For React keys
    
    ...options
  };

  console.log(`📧 Created email data:`, {
    subject: emailData.subject,
    attachments: emailData.attachmentsCount,
    hasAttachments: emailData.hasAttachments
  });

  return emailData;
}

// ========== API ENDPOINTS ==========

// NEW: Test endpoint to verify attachment URLs - FIXED PATH
app.get("/api/test-attachment-urls", async (req, res) => {
  try {
    console.log("🧪 Testing attachment URL generation...");
    
    if (!supabase) {
      console.error("❌ Supabase client not available, reinitializing...");
      const initialized = initializeSupabase();
      if (!initialized) {
        return res.status(500).json({ 
          error: "Supabase client not available",
          details: "Failed to initialize Supabase client. Check environment variables."
        });
      }
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
        serviceKeyLength: process.env.SUPABASE_SERVICE_KEY?.length
      },
      environment: {
        node_env: process.env.NODE_ENV
      }
    });

  } catch (error) {
    console.error("❌ Attachment URL test failed:", error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      supabaseStatus: supabase ? "initialized" : "not initialized"
    });
  }
});

// NEW: Debug Supabase connection
app.get("/api/debug-supabase", async (req, res) => {
  try {
    console.log("🔧 Debugging Supabase connection...");
    
    if (!supabase) {
      console.log("❌ Supabase client not available, attempting to initialize...");
      const initialized = initializeSupabase();
      if (!initialized) {
        return res.status(500).json({
          error: "Supabase client initialization failed",
          environment: {
            SUPABASE_URL: !!process.env.SUPABASE_URL,
            SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
            NODE_ENV: process.env.NODE_ENV
          }
        });
      }
    }

    // Test storage
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    // Test auth
    const { data: authData, error: authError } = await supabase.auth.getUser();

    res.json({
      supabase: {
        initialized: !!supabase,
        url: process.env.SUPABASE_URL,
        serviceKeyLength: process.env.SUPABASE_SERVICE_KEY?.length
      },
      storage: {
        buckets: bucketsError ? { error: bucketsError.message } : buckets,
        bucketsCount: buckets?.length || 0
      },
      auth: {
        user: authError ? { error: authError.message } : "Authenticated"
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV
      }
    });

  } catch (error) {
    console.error("❌ Supabase debug failed:", error);
    res.status(500).json({
      error: error.message,
      supabaseInitialized: !!supabase
    });
  }
});

// FIXED: Unified fetch endpoint with proper attachment handling
app.post("/api/fetch-emails", async (req, res) => {
  console.log("🔍 DEBUG: /api/fetch-emails called");
  try {
    const { mode = "latest", count = 20 } = req.body;
    
    await imapManager.connect();
    
    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log(`🔄 Fetching emails in ${mode} mode, count: ${count}`);
    
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
              attachments: attachmentLinks.length
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
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} emails...`);
            
            const saveOps = newEmails.map(async (email) => {
              try {
                // MongoDB upsert
                const mongoDb = await ensureMongoConnection();
                if (mongoDb) {
                  await mongoDb.collection("emails").updateOne(
                    { messageId: email.messageId },
                    { $set: email },
                    { upsert: true }
                  );
                  console.log(`   💾 Saved to MongoDB: ${email.subject}`);
                }
                
                // Supabase upsert
                if (supabase) {
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
                    console.log(`   💾 Saved to Supabase: ${email.subject}`);
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

// FIXED: Enhanced emails endpoint with proper attachment enhancement
app.get("/api/emails", async (req, res) => {
  try {
    const { search = "", sort = "date_desc", page = 1, limit = 50, includeAttachments = "true" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Create cache key
    const cacheKey = `emails:${search}:${sort}:${pageNum}:${limitNum}:${includeAttachments}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log("📦 Serving from cache");
      return res.json(cached);
    }

    let emails = [];
    let total = 0;
    let source = 'unknown';

    // Try MongoDB first
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
        console.log(`📧 Found ${emails.length} emails in MongoDB`);

      } catch (mongoError) {
        console.error("MongoDB query failed:", mongoError);
        // Fall through to Supabase
      }
    }

    // If MongoDB failed or not available, use Supabase
    if (emails.length === 0 && supabase) {
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;

      let query = supabase
        .from('emails')
        .select('*', { count: 'exact' });

      if (search && search.trim().length > 0) {
        query = query.or(`subject.ilike.%${search.trim()}%,from_text.ilike.%${search.trim()}%,text_content.ilike.%${search.trim()}%`);
      }

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

      query = query.range(from, to);

      const { data: supabaseEmails, error, count } = await query;

      if (error) {
        console.error("Supabase query error:", error);
      } else {
        emails = supabaseEmails || [];
        total = count || 0;
        source = 'supabase';
        console.log(`📧 Found ${emails.length} emails in Supabase`);
      }
    }

    // FIXED: Enhanced attachment processing for frontend
    const enhancedEmails = emails.map(email => {
      // Ensure consistent ID for React
      const emailId = email._id || email.id || email.messageId || email.message_id;
      
      // Process attachments
      let processedAttachments = [];
      if (email.attachments && Array.isArray(email.attachments)) {
        processedAttachments = email.attachments.map(att => {
          // Use the URL from the attachment data
          const attachmentUrl = att.url || att.publicUrl || att.downloadUrl;
          
          return {
            // Core identification
            id: att.id || `att_${emailId}_${Math.random().toString(36).substr(2, 9)}`,
            
            // File information
            filename: att.filename || att.name || att.originalFilename || 'attachment',
            name: att.name || att.filename || 'attachment',
            originalFilename: att.originalFilename || att.filename || 'attachment',
            displayName: att.displayName || att.filename || 'attachment',
            
            // URL information - FIXED: Ensure URL is available
            url: attachmentUrl,
            publicUrl: att.publicUrl || attachmentUrl,
            downloadUrl: att.downloadUrl || attachmentUrl,
            previewUrl: att.previewUrl || attachmentUrl,
            
            // File metadata
            contentType: att.contentType || att.type || att.mimeType || 'application/octet-stream',
            type: att.type || att.contentType || 'application/octet-stream',
            mimeType: att.mimeType || att.contentType || 'application/octet-stream',
            size: att.size || 0,
            extension: att.extension || (att.filename ? att.filename.split('.').pop() : 'bin'),
            path: att.path,
            
            // Frontend helpers
            isImage: att.isImage || (att.contentType || '').startsWith('image/'),
            isPdf: att.isPdf || (att.contentType || '') === 'application/pdf',
            isText: att.isText || (att.contentType || '').startsWith('text/'),
            isAudio: att.isAudio || (att.contentType || '').startsWith('audio/'),
            isVideo: att.isVideo || (att.contentType || '').startsWith('video/')
          };
        }).filter(att => att.url); // Only keep attachments with URLs
      }

      const enhancedEmail = {
        // Core email data
        id: emailId,
        _id: emailId,
        messageId: email.messageId || email.message_id,
        subject: email.subject || '(No Subject)',
        from: email.from || email.from_text,
        from_text: email.from_text || email.from,
        to: email.to || email.to_text,
        to_text: email.to_text || email.to,
        date: email.date,
        text: email.text || email.text_content,
        text_content: email.text_content || email.text,
        html: email.html || email.html_content,
        html_content: email.html_content || email.html,
        
        // Enhanced attachments
        attachments: processedAttachments,
        hasAttachments: processedAttachments.length > 0,
        attachmentsCount: processedAttachments.length,
        
        // Frontend helpers
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
      source
    };

    setToCache(cacheKey, response);

    console.log(`✅ Sending ${enhancedEmails.length} emails to frontend`);
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
    const mongoDb = await ensureMongoConnection();
    const mongoStatus = mongoDb ? "connected" : "disconnected";

    let supabaseStatus = "not_configured";
    let storageStatus = "not_configured";
    
    if (supabase) {
      try {
        // Test basic auth
        const { error: authError } = await supabase.auth.getUser();
        supabaseStatus = authError ? "disconnected" : "connected";

        // Test storage
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
        imap: imapStatus
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
    message: "Email IMAP Backend Server - Fixed Supabase Attachments",
    version: "2.3.0",
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/emails": "Get emails with enhanced attachments",
      "POST /api/fetch-emails": "Fetch new emails (mode: latest, force, simple)",
      "GET /api/test-attachment-urls": "Test attachment URL generation",
      "GET /api/debug-supabase": "Debug Supabase connection",
      "POST /api/clear-cache": "Clear cache"
    },
    features: [
      "Fixed Supabase client initialization",
      "Enhanced attachment structure for frontend",
      "Better error handling",
      "Multiple URL fallbacks",
      "Tracking pixel filtering"
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
  
  // Ensure storage is ready
  if (supabase) {
    await ensureStorageBucket();
  }
  
  console.log("✅ Application initialized");
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