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
console.log("🌐 NODE_ENV:", process.env.NODE_ENV);
console.log("🔗 SUPABASE_URL:", process.env.SUPABASE_URL ? "Set" : "NOT SET");
console.log("🔑 SUPABASE_SERVICE_KEY:", process.env.SUPABASE_SERVICE_KEY ? "Set (length: " + process.env.SUPABASE_SERVICE_KEY.length + ")" : "NOT SET");

// Check for required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("❌ Missing required environment variables:", missingVars);
  console.error("Please set these in your Vercel dashboard or .env file");
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

// === ADD THIS: Explicit API route handler ===
app.use('/api', (req, res, next) => {
  // Let the API routes handle /api requests
  next();
});

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

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

// FIXED: Use SUPABASE_SERVICE_KEY instead of SUPABASE_KEY
let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    console.log("🔧 Creating Supabase client with service key...");
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY, // CHANGED: Use service role key
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
    console.log("🔍 Supabase URL:", process.env.SUPABASE_URL);
    console.log("🔍 Service key length:", process.env.SUPABASE_SERVICE_KEY.length);
  } else {
    console.error("❌ Supabase environment variables not set");
    console.error("❌ SUPABASE_URL:", !!process.env.SUPABASE_URL);
    console.error("❌ SUPABASE_SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_KEY);
  }
} catch (error) {
  console.error("❌ Failed to create Supabase client:", error.message);
  console.error("❌ Client creation error details:", error);
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

// MongoDB connection will be established lazily when needed

function openInbox(cb) {
  imapManager.connection.openBox("INBOX", true, cb);
}

// Add missing checkDuplicate function
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

// FIXED: Enhanced processAttachments function with consistent structure
async function ensureStorageBucket() {
  try {
    console.log("🛠️ Ensuring storage bucket exists and is properly configured...");
    console.log("🔍 Supabase client available:", !!supabase);

    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error("❌ Cannot list buckets:", bucketsError);
      console.error("❌ Bucket error details:", {
        message: bucketsError.message,
        status: bucketsError.status,
        details: bucketsError.details
      });
      return false;
    }

    console.log("📋 Available buckets:", buckets?.map(b => ({ name: b.name, public: b.public })) || []);

    const attachmentsBucket = buckets?.find(b => b.name === 'attachments');

    if (!attachmentsBucket) {
      console.log("📦 Creating attachments bucket...");
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/*', 'application/pdf', 'text/*', 'application/*']
      });

      if (createError) {
        console.error("❌ Failed to create bucket:", createError);
        console.error("❌ Create bucket error details:", {
          message: createError.message,
          status: createError.status,
          details: createError.details
        });
        return false;
      }
      console.log("✅ Created attachments bucket:", newBucket);
    } else {
      console.log("✅ Attachments bucket exists, public:", attachmentsBucket.public);

      // Update bucket to ensure it's public
      const { error: updateError } = await supabase.storage.updateBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800
      });

      if (updateError) {
        console.log("⚠️ Could not update bucket settings:", updateError.message);
        console.log("⚠️ Update error details:", {
          message: updateError.message,
          status: updateError.status,
          details: updateError.details
        });
      } else {
        console.log("✅ Bucket updated to public");
      }
    }

    // Test public URL access
    const testPath = `test-access-${Date.now()}.txt`;
    const testContent = "Test file for URL access";

    console.log("🧪 Testing upload to bucket...");
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(testPath, testContent);

    if (uploadError) {
      console.error("❌ Test upload failed:", uploadError);
      console.error("❌ Upload error details:", {
        message: uploadError.message,
        status: uploadError.status,
        details: uploadError.details
      });
      return false;
    }

    console.log("✅ Test upload successful, path:", uploadData.path);

    // Get public URL and test it
    const { data: urlData } = supabase.storage
      .from("attachments")
      .getPublicUrl(uploadData.path);

    console.log("🔗 Public URL test:", urlData.publicUrl);
    console.log("🔗 URL structure check - includes supabase.co:", urlData.publicUrl?.includes('supabase.co'));

    // Clean up test file
    const { error: removeError } = await supabase.storage.from("attachments").remove([testPath]);
    if (removeError) {
      console.log("⚠️ Could not clean up test file:", removeError.message);
    } else {
      console.log("🧹 Test file cleaned up");
    }

    return true;
  } catch (error) {
    console.error("❌ Storage setup failed:", error);
    console.error("❌ Setup error details:", {
      message: error.message,
      stack: error.stack
    });
    return false;
  }
}

// FIXED: Consistent attachment processing function
async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments`);
  
  // Ensure storage is ready
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
        size: att.size || att.content?.length || 0,
        hasContent: !!att.content
      });

      // Validate attachment
      if (!att.content) {
        console.log(`   ❌ Attachment ${index + 1} has no content`);
        return null;
      }

      const originalFilename = att.filename || `attachment_${Date.now()}_${index}.bin`;
      const safeFilename = originalFilename
        .replace(/[^a-zA-Z0-9.\-_]/g, '_')
        .substring(0, 100); // Limit filename length

      const uniquePath = `emails/${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${safeFilename}`;

      console.log(`   📤 Uploading: ${safeFilename} -> ${uniquePath}`);
      console.log(`   📊 Content type: ${att.contentType || 'application/octet-stream'}`);
      console.log(`   📏 Content size: ${att.content?.length || 'unknown'}`);

      // Convert to Buffer
      let contentBuffer;
      if (Buffer.isBuffer(att.content)) {
        contentBuffer = att.content;
        console.log(`   🔄 Content already buffer, size: ${contentBuffer.length}`);
      } else if (typeof att.content === 'string') {
        contentBuffer = Buffer.from(att.content, 'utf8');
        console.log(`   🔄 Converted string to buffer, size: ${contentBuffer.length}`);
      } else {
        contentBuffer = Buffer.from(att.content);
        console.log(`   🔄 Converted to buffer, size: ${contentBuffer.length}`);
      }

      // Upload with retry logic
      console.log(`   ⬆️ Starting upload to Supabase...`);
      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(uniquePath, contentBuffer, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600'
        });

      if (error) {
        console.error(`   ❌ Upload failed for ${safeFilename}:`, error.message);
        console.error(`   ❌ Upload error details:`, {
          message: error.message,
          status: error.status,
          details: error.details
        });
        return null;
      }

      console.log(`   ✅ Upload successful: ${safeFilename}, path: ${data.path}`);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path);

      console.log(`   🔗 Public URL generated: ${urlData.publicUrl}`);
      console.log(`   🔍 URL validation - starts with https: ${urlData.publicUrl?.startsWith('https://')}`);
      console.log(`   🔍 URL validation - includes project ref: ${urlData.publicUrl?.includes('yjxtjtwkollqidngddor')}`);

      // FIXED: Return consistent attachment object for ALL endpoints
      const attachmentResult = {
        id: `${Date.now()}_${index}_${safeFilename}`,
        filename: safeFilename,
        originalFilename: originalFilename,
        url: urlData.publicUrl,
        contentType: att.contentType || 'application/octet-stream',
        size: contentBuffer.length,
        path: data.path,
        displayName: originalFilename,
        extension: originalFilename.split('.').pop() || 'bin',
        isImage: (att.contentType || '').startsWith('image/')
      };

      console.log(`   📋 Final attachment object:`, {
        id: attachmentResult.id,
        filename: attachmentResult.filename,
        url: attachmentResult.url?.substring(0, 50) + '...',
        contentType: attachmentResult.contentType,
        size: attachmentResult.size
      });

      return attachmentResult;

    } catch (attErr) {
      console.error(`   ❌ Attachment processing error:`, attErr.message);
      console.error(`   ❌ Error stack:`, attErr.stack);
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

// FIXED: Consistent email data structure function
function createEmailData(parsed, messageId, attachmentLinks, options = {}) {
  // FIXED: Use consistent attachment structure for ALL endpoints
  const attachments = attachmentLinks.map(att => ({
    id: att.id,
    filename: att.filename,
    url: att.url,
    contentType: att.contentType,
    size: att.size,
    displayName: att.displayName,
    isImage: att.isImage,
    extension: att.extension
  }));

  return {
    messageId: messageId,
    subject: parsed.subject || '(No Subject)',
    from: parsed.from?.text || "",
    to: parsed.to?.text || "",
    date: parsed.date || new Date(),
    text: parsed.text || "",
    html: parsed.html || "",
    attachments: attachments,
    processedAt: new Date(),
    ...options
  };
}

// NEW: Storage setup and debug endpoint
app.get("/api/debug-storage-setup", async (req, res) => {
  try {
    console.log("🛠️ Setting up and debugging storage...");
    
    // Test 1: Check current buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.log("❌ Cannot list buckets:", bucketsError);
    } else {
      console.log("✅ Available buckets:", buckets);
    }

    // Test 2: Create attachments bucket if it doesn't exist
    if (!buckets?.find(b => b.name === 'attachments')) {
      console.log("🛠️ Creating attachments bucket...");
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800 // 50MB
      });
      
      if (createError) {
        console.log("❌ Failed to create bucket:", createError);
      } else {
        console.log("✅ Created attachments bucket:", newBucket);
      }
    }

    // Test 3: Test upload
    console.log("📤 Testing upload...");
    const testContent = "Test file for storage setup";
    const testPath = `test-${Date.now()}.txt`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(testPath, testContent, {
        contentType: 'text/plain',
        upsert: false
      });

    if (uploadError) {
      console.log("❌ Upload test failed:", uploadError);
    } else {
      console.log("✅ Upload test successful!");
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(uploadData.path);
      console.log("🔗 Public URL:", urlData.publicUrl);
      
      // Clean up
      await supabase.storage.from("attachments").remove([testPath]);
    }

    // Test 4: List files
    const { data: files, error: filesError } = await supabase.storage
      .from("attachments")
      .list();
    
    if (filesError) {
      console.log("❌ Cannot list files:", filesError);
    } else {
      console.log(`✅ Files in bucket: ${files?.length || 0}`);
    }

    res.json({
      status: "Storage debug completed",
      buckets: bucketsError ? { error: bucketsError.message } : buckets,
      uploadTest: uploadError ? { error: uploadError.message } : { success: true },
      files: filesError ? { error: filesError.message } : { count: files?.length || 0 }
    });

  } catch (error) {
    console.error("❌ Storage debug failed:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// FIXED: Simple fetch with consistent structure
app.post("/api/simple-fetch", async (req, res) => {
  console.log("🔍 DEBUG: /api/simple-fetch called");
  try {
    await imapManager.connect();
    
    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log("🚀 SIMPLE FETCH: Bypassing all duplicate checks");
    
    openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 Total Messages: ${box.messages.total}`);
      
      // Fetch last 15 emails
      const totalMessages = box.messages.total;
      const fetchCount = 15;
      const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
      const fetchRange = `${fetchStart}:${totalMessages}`;

      console.log(`📨 Fetching range: ${fetchRange}`);

      const f = imapManager.connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let newEmails = [];
      let processingDetails = [];

      f.on("message", function (msg, seqno) {
        console.log(`🚀 Simple processing message #${seqno}`);
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
            const messageId = parsed.messageId || `simple-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Process attachments
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // FIXED: Use consistent email data structure
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              simpleFetched: true
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ Simple added: ${parsed.subject}`);
            
            processingDetails.push({
              messageId: messageId.substring(0, 50) + '...',
              subject: parsed.subject || '(No Subject)',
              status: 'simple_processed',
              reason: 'Simple processed (bypassed ALL checks)',
              attachments: attachmentLinks.length
            });

          } catch (parseErr) {
            console.error("   ❌ Simple parse error:", parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error("❌ Simple fetch error:", err);
        res.status(500).json({ 
          success: false,
          error: "Simple fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 Simple processing ${newEmails.length} messages...`);
        
        try {
          // Save to databases - use upsert to avoid conflicts
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} emails to databases...`);
            
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
                    created_at: new Date(),
                    updated_at: new Date()
                  };

                  await supabase.from('emails').upsert(supabaseData);
                }

                return true;
              } catch (saveErr) {
                console.error(`❌ Error saving email:`, saveErr);
                return null;
              }
            });

            await Promise.allSettled(saveOps);
            clearCache();
            console.log(`🗑️ Cleared cache (${cache.size} entries)`);
          }

          console.log(`✅ Simple fetch completed: ${processedCount} emails processed`);
          
          res.json({
            success: true,
            message: `Simple fetch processed ${processedCount} emails`,
            count: processedCount,
            added: processedCount,
            emails: newEmails,
            details: {
              totalProcessed: processedCount,
              simpleProcessed: processedCount,
              processingDetails: processingDetails
            }
          });

        } catch (batchError) {
          console.error("❌ Simple batch processing error:", batchError);
          res.status(500).json({ 
            success: false,
            error: "Simple batch processing failed: " + batchError.message 
          });
        }
      });
    });

  } catch (error) {
    console.error("❌ Simple fetch API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Add this endpoint to test attachment URLs
app.get("/api/debug-attachments", async (req, res) => {
  try {
    const { data: files, error } = await supabase.storage
      .from("attachments")
      .list("emails", {
        limit: 10,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const filesWithUrls = files.map(file => {
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(`emails/${file.name}`);
      
      return {
        name: file.name,
        url: urlData.publicUrl,
        metadata: file.metadata
      };
    });

    res.json({
      bucket: 'attachments',
      files: filesWithUrls,
      total: files.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FIXED: Latest email fetch with consistent structure
app.post("/api/fetch-latest", async (req, res) => {
  console.log("🔍 DEBUG: /api/fetch-latest called");
  try {
    await imapManager.connect();
    
    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log("🔄 Fetching latest emails with duplicate detection");
    
    openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 Total Messages: ${box.messages.total}`);
      
      // Fetch only the latest 20 emails
      const totalMessages = box.messages.total;
      const fetchCount = 20;
      const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
      const fetchRange = `${fetchStart}:${totalMessages}`;

      console.log(`📨 Fetching latest range: ${fetchRange}`);

      const f = imapManager.connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let duplicateCount = 0;
      let newEmails = [];
      let processingDetails = [];

      f.on("message", function (msg, seqno) {
        console.log(`📨 Processing latest message #${seqno}`);
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
            const messageId = parsed.messageId || `latest-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Check for duplicates
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

            // Process attachments
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // FIXED: Use consistent email data structure
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              latestFetched: true
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ New email: ${parsed.subject}`);
            
            processingDetails.push({
              messageId: messageId.substring(0, 50) + '...',
              subject: parsed.subject || '(No Subject)',
              status: 'new',
              reason: 'Successfully processed and saved',
              attachments: attachmentLinks.length
            });

          } catch (parseErr) {
            console.error("   ❌ Parse error:", parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error("❌ Latest fetch error:", err);
        res.status(500).json({ 
          success: false,
          error: "Latest fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 Processing ${newEmails.length} new emails...`);
        
        try {
          // Save to databases
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} new emails...`);
            
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
                    created_at: new Date(),
                    updated_at: new Date()
                  };

                  await supabase.from('emails').upsert(supabaseData);
                }
                
                return true;
              } catch (saveErr) {
                console.error(`❌ Error saving email:`, saveErr);
                return false;
              }
            });

            await Promise.allSettled(saveOps);
            clearCache();
            console.log(`🗑️ Cleared cache (${cache.size} entries)`);
          }

          console.log(`✅ Latest fetch: ${processedCount} new, ${duplicateCount} duplicates`);
          res.json({
            success: true,
            message: `Found ${processedCount} new emails`,
            count: processedCount,
            duplicates: duplicateCount,
            added: processedCount,
            newEmails: processedCount,
            details: {
              totalProcessed: processedCount + duplicateCount,
              newEmails: processedCount,
              duplicates: duplicateCount,
              processingDetails: processingDetails
            }
          });

        } catch (batchError) {
          console.error("❌ Latest batch processing error:", batchError);
          res.status(500).json({ 
            success: false,
            error: "Latest batch processing failed: " + batchError.message 
          });
        }
      });
    });

  } catch (error) {
    console.error("❌ Latest fetch API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// FIXED: Force fetch with consistent structure
app.post("/api/force-fetch", async (req, res) => {
  console.log("🔍 DEBUG: /api/force-fetch called");
  try {
    await imapManager.connect();
    
    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log("⚡ Force fetching emails (bypassing duplicate checks)");
    
    openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 Total Messages: ${box.messages.total}`);
      
      // Fetch last 10 emails for force fetch
      const totalMessages = box.messages.total;
      const fetchCount = 10;
      const fetchStart = Math.max(1, totalMessages - fetchCount + 1);
      const fetchRange = `${fetchStart}:${totalMessages}`;

      console.log(`📨 Force fetching range: ${fetchRange}`);

      const f = imapManager.connection.seq.fetch(fetchRange, { 
        bodies: "",
        struct: true 
      });

      let processedCount = 0;
      let newEmails = [];
      let processingDetails = [];

      f.on("message", function (msg, seqno) {
        console.log(`⚡ Force processing message #${seqno}`);
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
            const messageId = parsed.messageId || `force-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            // Process attachments
            const attachmentLinks = await processAttachments(parsed.attachments || []);

            // FIXED: Use consistent email data structure
            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              forceFetched: true
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ Force added: ${parsed.subject}`);
            
            processingDetails.push({
              messageId: messageId.substring(0, 50) + '...',
              subject: parsed.subject || '(No Subject)',
              status: 'force_processed',
              reason: 'Force processed (bypassed duplicate checks)',
              attachments: attachmentLinks.length
            });

          } catch (parseErr) {
            console.error("   ❌ Force parse error:", parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error("❌ Force fetch error:", err);
        res.status(500).json({ 
          success: false,
          error: "Force fetch error: " + err.message 
        });
      });

      f.once("end", async function () {
        console.log(`🔄 Force processing ${newEmails.length} messages...`);
        
        try {
          // Save to databases - update existing or insert new
          if (newEmails.length > 0) {
            console.log(`💾 Force saving ${newEmails.length} emails...`);
            
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
                    created_at: new Date(),
                    updated_at: new Date()
                  };

                  await supabase.from('emails').upsert(supabaseData);
                }

                return true;
              } catch (saveErr) {
                console.error(`❌ Error force saving email:`, saveErr);
                return false;
              }
            });

            await Promise.allSettled(saveOps);
            clearCache();
            console.log(`🗑️ Cleared cache (${cache.size} entries)`);
          }

          console.log(`✅ Force processed ${processedCount} emails`);
          res.json({
            success: true,
            message: `Force processed ${processedCount} emails`,
            count: processedCount,
            added: processedCount,
            emails: newEmails,
            details: {
              totalProcessed: processedCount,
              forceProcessed: processedCount,
              processingDetails: processingDetails
            }
          });

        } catch (batchError) {
          console.error("❌ Force batch processing error:", batchError);
          res.status(500).json({ 
            success: false,
            error: "Force batch processing failed: " + batchError.message 
          });
        }
      });
    });

  } catch (error) {
    console.error("❌ Force fetch API error:", error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// NEW: Debug endpoint for attachment structure
app.get("/api/debug-attachment-structure", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    const email = await mongoDb.collection("emails").findOne({ 
      "attachments.0": { $exists: true } 
    });

    if (!email) {
      return res.json({ 
        message: "No emails with attachments found",
        sampleStructure: {
          attachments: [{
            id: "string",
            filename: "string", 
            url: "string",
            contentType: "string",
            size: "number",
            displayName: "string",
            isImage: "boolean",
            extension: "string"
          }]
        }
      });
    }

    res.json({
      actualStructure: email.attachments ? email.attachments[0] : null,
      fullEmail: {
        messageId: email.messageId,
        subject: email.subject,
        attachmentsCount: email.attachments ? email.attachments.length : 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add this debug endpoint
app.get("/api/debug-storage-deep", async (req, res) => {
  try {
    console.log("🔍 Deep debugging Supabase storage...");
    
    // Test 1: Verify credentials
    console.log("🔑 Testing credentials...");
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    console.log("📋 URL exists:", !!supabaseUrl);
    console.log("📋 Key exists:", !!supabaseKey);
    if (supabaseKey) {
      console.log("📋 Key starts with:", supabaseKey.substring(0, 20) + "...");
      // Decode JWT to check role
      try {
        const payload = JSON.parse(Buffer.from(supabaseKey.split('.')[1], 'base64').toString());
        console.log("📋 JWT Role:", payload.role);
        console.log("📋 JWT Issuer:", payload.iss);
      } catch (e) {
        console.log("📋 Cannot decode JWT");
      }
    }

    // Test 2: Test basic auth
    console.log("🔐 Testing authentication...");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.log("❌ Auth error:", authError.message);
    } else {
      console.log("✅ Auth successful");
    }

    // Test 3: Try different storage methods
    console.log("📦 Testing storage listBuckets...");
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.log("❌ listBuckets error:", {
        message: bucketsError.message,
        status: bucketsError.status,
        name: bucketsError.name
      });
    } else {
      console.log("✅ listBuckets success, buckets:", buckets);
    }

    // Test 4: Try to access attachments bucket directly
    console.log("📁 Testing direct bucket access...");
    const { data: files, error: filesError } = await supabase.storage
      .from("attachments")
      .list();
    
    if (filesError) {
      console.log("❌ Direct bucket access error:", filesError.message);
    } else {
      console.log("✅ Direct bucket access success, files:", files?.length || 0);
    }

    // Test 5: Try to create a bucket (should fail if it exists)
    console.log("🛠️ Testing bucket creation...");
    const { data: createTest, error: createError } = await supabase.storage.createBucket('test-temp-bucket', {
      public: true
    });
    
    if (createError) {
      console.log("ℹ️ Create test (expected if no permissions):", createError.message);
    } else {
      console.log("✅ Created test bucket");
      // Clean up
      await supabase.storage.deleteBucket('test-temp-bucket');
    }

    res.json({
      status: "Debug completed",
      credentials: {
        url: !!supabaseUrl,
        key: !!supabaseKey,
        keyPreview: supabaseKey ? supabaseKey.substring(0, 20) + "..." : null
      },
      authentication: authError ? { error: authError.message } : { success: true },
      storage: {
        listBuckets: bucketsError ? { error: bucketsError.message } : { buckets: buckets },
        directAccess: filesError ? { error: filesError.message } : { fileCount: files?.length || 0 },
        bucketCreation: createError ? { error: createError.message } : { success: true }
      }
    });

  } catch (error) {
    console.error("❌ Deep debug failed:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Get emails from MongoDB with performance optimizations
app.get("/api/emails", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    if (!mongoDb) {
      // Fallback to Supabase if MongoDB not available
      if (!supabase) {
        return res.status(500).json({ error: "No database connections available. Please check environment variables." });
      }

      const { search = "", sort = "date_desc", page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;

      let query = supabase
        .from('emails')
        .select('*', { count: 'exact' });

      if (search && search.trim().length > 0) {
        query = query.or(`subject.ilike.%${search.trim()}%,from_text.ilike.%${search.trim()}%`);
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

      const { data: emails, error, count } = await query;

      if (error) throw error;

      const hasMore = to < count - 1;

      const response = {
        emails: emails || [],
        total: count || 0,
        hasMore,
        page: pageNum,
        limit: limitNum,
        source: 'supabase_fallback'
      };

      res.json(response);
      return;
    }

    const { search = "", sort = "date_desc", page = 1, limit = 20 } = req.query;
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

    // Build query for search
    let query = {};
    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query = {
        $or: [
          { subject: searchRegex },
          { from: searchRegex },
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

    const emails = await db.collection("emails")
      .find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await db.collection("emails").countDocuments(query);
    const hasMore = skip + emails.length < total;

    const response = {
      emails,
      total,
      hasMore,
      page: pageNum,
      limit: limitNum,
      source: 'mongodb'
    };

    setToCache(cacheKey, response);

    res.json(response);

  } catch (error) {
    console.error("❌ MongoDB fetch error:", error);
    res.status(500).json({ error: "Failed to fetch emails from databases" });
  }
});

// Get emails from Supabase
app.get("/api/supabase/emails", async (req, res) => {
  try {
    const { search = "", sort = "date_desc", page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    const cacheKey = `supabase_emails:${search}:${sort}:${pageNum}:${limitNum}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log("📦 Serving Supabase from cache");
      return res.json(cached);
    }

    let query = supabase
      .from('emails')
      .select('*', { count: 'exact' });

    if (search && search.trim().length > 0) {
      query = query.or(`subject.ilike.%${search.trim()}%,from_text.ilike.%${search.trim()}%`);
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

    const { data: emails, error, count } = await query;

    if (error) {
      throw error;
    }

    const hasMore = to < count - 1;

    const response = {
      emails: emails || [],
      total: count || 0,
      hasMore,
      page: pageNum,
      limit: limitNum
    };

    setToCache(cacheKey, response);

    res.json(response);

  } catch (error) {
    console.error("❌ Supabase fetch error:", error);
    res.status(500).json({ error: "Failed to fetch emails from Supabase" });
  }
});

// NEW: Check for new emails count
app.get("/api/check-new-emails", async (req, res) => {
  try {
    // Get total count from server
    let serverCount = 0;
    
    try {
      await imapManager.connect();
      if (imapManager.connection.state === 'authenticated') {
        openInbox(async function(err, box) {
          if (!err) {
            serverCount = box.messages.total;
            
            // Get our current count from databases
            const mongoDb = await ensureMongoConnection();
            const [mongoCount, supabaseCount] = await Promise.allSettled([
              mongoDb ? mongoDb.collection("emails").countDocuments() : 0,
              supabase.from('emails').select('message_id', { count: 'exact', head: true })
            ]);
            
            const currentCount = Math.max(
              mongoCount.status === 'fulfilled' ? mongoCount.value : 0,
              supabaseCount.status === 'fulfilled' ? (supabaseCount.value.count || 0) : 0
            );
            
            const newEmails = Math.max(0, serverCount - currentCount);
            
            res.json({
              serverTotal: serverCount,
              currentTotal: currentCount,
              newEmails: newEmails,
              total: newEmails
            });
          } else {
            res.json({ total: 0, serverTotal: 0, currentTotal: 0, newEmails: 0 });
          }
        });
      } else {
        res.json({ total: 0, serverTotal: 0, currentTotal: 0, newEmails: 0 });
      }
    } catch (imapErr) {
      res.json({ total: 0, serverTotal: 0, currentTotal: 0, newEmails: 0 });
    }
  } catch (error) {
    console.error("❌ Check new emails error:", error);
    res.json({ total: 0, serverTotal: 0, currentTotal: 0, newEmails: 0 });
  }
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    const mongoStatus = mongoDb ? "connected" : "disconnected";

    let supabaseStatus = "not_configured";
    if (supabase) {
      try {
        const { data: supabaseData, error: supabaseError } = await supabase
          .from('emails')
          .select('count')
          .limit(1)
          .single();

        supabaseStatus = supabaseError ? "disconnected" : "connected";
      } catch (supabaseErr) {
        supabaseStatus = "error";
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
        imap: imapStatus
      },
      cache: {
        keys: cache.size
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

// NEW: Debug endpoint for duplicates
app.get("/api/debug/emails", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    const [mongoEmails, supabaseEmails] = await Promise.allSettled([
      mongoDb ? mongoDb.collection("emails").find({}).sort({ date: -1 }).limit(10).toArray() : [],
      supabase.from('emails').select('*').order('date', { ascending: false }).limit(10)
    ]);

    res.json({
      mongo: {
        connected: mongoDb ? true : false,
        count: mongoEmails.status === 'fulfilled' ? mongoEmails.value.length : 0,
        emails: mongoEmails.status === 'fulfilled' ? mongoEmails.value : []
      },
      supabase: {
        count: supabaseEmails.status === 'fulfilled' ? supabaseEmails.value.data?.length || 0 : 0,
        emails: supabaseEmails.status === 'fulfilled' ? supabaseEmails.value.data : []
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Email IMAP Backend Server - Enhanced & Fixed",
    version: "2.0.0",
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/emails": "Get emails from MongoDB (falls back to Supabase)",
      "GET /api/supabase/emails": "Get emails from Supabase",
      "POST /api/fetch-latest": "Fetch only latest emails (smart)",
      "POST /api/force-fetch": "Force fetch (bypass duplicates)",
      "POST /api/simple-fetch": "Simple fetch (bypass ALL checks)",
      "GET /api/check-new-emails": "Check for new emails count",
      "GET /api/debug/emails": "Debug email data",
      "POST /api/clear-cache": "Clear all caches",
      "GET /api/debug-storage-setup": "Debug and setup storage",
      "GET /api/debug-attachment-structure": "Debug attachment structure" // NEW
    },
    features: [
      "ES Modules compatible",
      "Vercel serverless ready",
      "Enhanced duplicate detection",
      "Better error handling",
      "Multi-database support",
      "Fixed Supabase storage",
      "Consistent attachment structure" // NEW
    ]
  });
});

// ========== MOVED: Static files serving and catch-all route ==========

// Serve static files from the React app build directory (for production/Vercel)
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// Handle client-side routing - serve index.html for all non-API routes
// THIS MUST BE THE LAST ROUTE
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log('Serving index.html for:', req.path);
    res.sendFile(indexPath);
  } else {
    // If it's an API route that doesn't exist, return 404
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Call this when your server starts
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

// Vercel serverless function handler with error handling
export default (req, res) => {
  try {
    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};