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

console.log("🔍 DEBUG: Environment check - EMAIL_USER:", !!process.env.EMAIL_USER, "EMAIL_PASS:", !!process.env.EMAIL_PASS, "SUPABASE_URL:", !!process.env.SUPABASE_URL, "SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);

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

function openInbox(cb) {
  imapManager.connection.openBox("INBOX", true, cb);
}

// ✅ UPDATED: Check duplicate using Supabase only
async function checkDuplicate(messageId) {
  try {
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

// FIXED: Enhanced email data structure
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

  return emailData;
}

// ========== API ENDPOINTS ==========

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

// Debug environment
app.get("/api/debug-env", (req, res) => {
  res.json({
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_URL: process.env.SUPABASE_URL ? "Set" : "Not set",
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? `Set (length: ${process.env.SUPABASE_SERVICE_KEY.length})` : "Not set",
      EMAIL_USER: process.env.EMAIL_USER ? "Set" : "Not set"
    },
    supabase: {
      enabled: supabaseEnabled,
      initialized: !!supabase
    }
  });
});

// FIXED: Fetch emails - Save to Supabase only
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
                  status: 'duplicate'
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
          // Save to Supabase ONLY
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} emails to Supabase...`);
            
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
// Add to your server.js
app.post("/api/sync-deletions", async (req, res) => {
  try {
    await imapManager.connect();
    
    openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }

      // Get all message IDs from IMAP
      const f = imapManager.connection.seq.fetch('1:*', { 
        bodies: ['HEADER.FIELDS (MESSAGE-ID)'],
        struct: true 
      });

      const imapMessageIds = new Set();
      
      f.on("message", function (msg) {
        msg.on("body", function (stream) {
          let buffer = "";
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
          stream.on("end", function () {
            // Extract Message-ID from headers
            const messageIdMatch = buffer.match(/Message-ID:\s*<([^>]+)>/i);
            if (messageIdMatch) {
              imapMessageIds.add(messageIdMatch[1]);
            }
          });
        });
      });

      f.once("end", async function () {
        try {
          // Get all message IDs from Supabase
          const { data: dbEmails, error } = await supabase
            .from('emails')
            .select('message_id');
          
          if (error) throw error;

          const dbMessageIds = new Set(dbEmails.map(email => email.message_id));
          
          // Find emails in DB but not in IMAP (deleted)
          const deletedMessageIds = [...dbMessageIds].filter(id => !imapMessageIds.has(id));
          
          // Delete from Supabase
          if (deletedMessageIds.length > 0) {
            const { error: deleteError } = await supabase
              .from('emails')
              .delete()
              .in('message_id', deletedMessageIds);
              
            if (deleteError) throw deleteError;
            
            console.log(`🗑️ Deleted ${deletedMessageIds.length} emails from database`);
            clearCache();
          }
          
          res.json({
            success: true,
            deleted: deletedMessageIds.length,
            deletedIds: deletedMessageIds
          });
          
        } catch (syncError) {
          console.error("❌ Sync error:", syncError);
          res.status(500).json({ error: syncError.message });
        }
      });
    });
  } catch (error) {
    console.error("❌ Sync deletions error:", error);
    res.status(500).json({ error: error.message });
  }
});


// NEW: Fast fetch from Supabase only (no IMAP)
app.post("/api/fast-fetch", async (req, res) => {
  try {
    const { mode = "latest", count = 50 } = req.body;
    
    console.log(`🚀 Fast fetching ${count} emails from Supabase in ${mode} mode`);
    
    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        success: false,
        error: "Supabase is not available" 
      });
    }

    let query = supabase
      .from('emails')
      .select('*')
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

    // Enhanced email data for frontend
    const enhancedEmails = emails.map(email => ({
      id: email.message_id,
      _id: email.message_id,
      messageId: email.message_id,
      subject: email.subject,
      from: email.from_text,
      from_text: email.from_text,
      to: email.to_text,
      to_text: email.to_text,
      date: email.date,
      text: email.text_content,
      text_content: email.text_content,
      html: email.html_content,
      html_content: email.html_content,
      attachments: email.attachments || [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      read: email.read || false
    }));

    console.log(`✅ Fast fetch completed: ${enhancedEmails.length} emails from Supabase`);

    res.json({
      success: true,
      message: `Fetched ${enhancedEmails.length} emails from database`,
      data: {
        emails: enhancedEmails,
        total: enhancedEmails.length,
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

// ✅ UPDATED: Get emails from Supabase ONLY
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

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({ 
        error: "Supabase is not available" 
      });
    }

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
    
    const { data: emails, error, count } = await query;
    
    if (error) {
      console.error("❌ Supabase query error:", error);
      return res.status(500).json({ 
        error: "Failed to fetch emails from Supabase",
        details: error.message 
      });
    }

    // Enhanced email data for frontend
    const enhancedEmails = emails.map(email => ({
      id: email.message_id,
      _id: email.message_id,
      messageId: email.message_id,
      subject: email.subject,
      from: email.from_text,
      from_text: email.from_text,
      to: email.to_text,
      to_text: email.to_text,
      date: email.date,
      text: email.text_content,
      text_content: email.text_content,
      html: email.html_content,
      html_content: email.html_content,
      attachments: email.attachments || [],
      hasAttachments: email.has_attachments,
      attachmentsCount: email.attachments_count,
      read: email.read || false
    }));

    const hasMore = skip + enhancedEmails.length < count;

    const response = {
      emails: enhancedEmails,
      total: count,
      hasMore,
      page: pageNum,
      limit: limitNum,
      source: 'supabase'
    };

    setToCache(cacheKey, response);

    console.log(`✅ Sending ${enhancedEmails.length} emails from Supabase`);
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
// ✅ NEW: Test storage permissions and deletion
// ✅ NEW: Delete email with attachments
app.delete("/api/emails/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    console.log(`🗑️ Attempting to delete email: ${messageId}`);

    if (!supabaseEnabled || !supabase) {
      return res.status(500).json({
        success: false,
        error: "Supabase is not available"
      });
    }

    // Step 1: Get the email first to find attachment paths
    const { data: email, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('message_id', messageId)
      .single();

    if (fetchError || !email) {
      console.error("❌ Email not found:", fetchError);
      return res.status(404).json({
        success: false,
        error: "Email not found"
      });
    }

    // Step 2: Delete attachments from storage if they exist
    let attachmentDeleteResult = { success: true, deleted: 0 };
    if (email.attachments && email.attachments.length > 0) {
      console.log(`📎 Deleting ${email.attachments.length} attachments...`);
      
      const attachmentPaths = email.attachments
        .filter(att => att.path)
        .map(att => att.path);

      if (attachmentPaths.length > 0) {
        const { data: deleteData, error: storageError } = await supabase.storage
          .from("attachments")
          .remove(attachmentPaths);

        if (storageError) {
          console.error("❌ Attachment deletion error:", storageError);
          attachmentDeleteResult = { 
            success: false, 
            error: storageError.message,
            deleted: 0
          };
        } else {
          attachmentDeleteResult = {
            success: true,
            deleted: deleteData?.length || 0
          };
          console.log(`✅ Deleted ${attachmentDeleteResult.deleted} attachments`);
        }
      }
    }

    // Step 3: Delete the email record from database
    console.log(`🗑️ Deleting email record from database...`);
    const { error: deleteError } = await supabase
      .from('emails')
      .delete()
      .eq('message_id', messageId);

    if (deleteError) {
      console.error("❌ Database deletion error:", deleteError);
      return res.status(500).json({
        success: false,
        error: "Failed to delete email from database",
        details: deleteError.message
      });
    }

    // Step 4: Clear cache
    clearCache();
    console.log("🗑️ Cleared cache after deletion");

    res.json({
      success: true,
      message: "Email deleted successfully",
      data: {
        messageId: messageId,
        attachments: attachmentDeleteResult,
        deletedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ Delete email error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Email IMAP Backend Server - Supabase Only",
    version: "3.0.0",
    environment: process.env.NODE_ENV || 'development',
    supabase: supabaseEnabled ? "enabled" : "disabled",
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/emails": "Get emails with attachments",
      "POST /api/fetch-emails": "Fetch new emails",
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