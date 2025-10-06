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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// === ADD THIS: Explicit API route handler ===
app.use('/api', (req, res, next) => {
  // Let the API routes handle /api requests
  next();
});

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

// Enhanced IMAP Connection Manager for Serverless
class IMAPConnection {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 2;
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
        connTimeout: 15000,
        authTimeout: 10000,
        keepAlive: false
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

let supabase = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
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
    console.log("✅ Supabase client created");
  } else {
    console.error("❌ Supabase environment variables not set");
  }
} catch (error) {
  console.error("❌ Failed to create Supabase client:", error.message);
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
    const mongoDb = await ensureMongoConnection();
    if (mongoDb) {
      const existing = await mongoDb.collection("emails").findOne({ messageId });
      if (existing) return true;
    }

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

async function ensureStorageBucket() {
  try {
    console.log("🛠️ Ensuring storage bucket exists and is properly configured...");
    
    if (!supabase) {
      console.error("❌ Supabase client not initialized");
      return false;
    }

    const bucketPromise = supabase.storage.listBuckets();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Bucket check timeout')), 10000)
    );

    const { data: buckets, error: bucketsError } = await Promise.race([bucketPromise, timeoutPromise]);
    
    if (bucketsError) {
      console.error("❌ Cannot list buckets:", bucketsError);
      return false;
    }

    const attachmentsBucket = buckets?.find(b => b.name === 'attachments');
    
    if (!attachmentsBucket) {
      console.log("📦 Creating attachments bucket...");
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ['image/*', 'application/pdf', 'text/*', 'application/*', 'video/*', 'audio/*']
      });
      
      if (createError) {
        console.error("❌ Failed to create bucket:", createError);
        return false;
      }
      console.log("✅ Created attachments bucket");
    } else {
      console.log("✅ Attachments bucket exists");
      
      const { error: updateError } = await supabase.storage.updateBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800
      });
      
      if (updateError) {
        console.log("⚠️ Could not update bucket settings:", updateError.message);
      }
    }

    const testPath = `test-${Date.now()}.txt`;
    const { error: testError } = await supabase.storage
      .from("attachments")
      .upload(testPath, "test");

    if (testError) {
      console.error("❌ Storage test failed:", testError);
      return false;
    }

    await supabase.storage.from("attachments").remove([testPath]);
    
    console.log("✅ Storage bucket is ready");
    return true;
  } catch (error) {
    console.error("❌ Storage setup failed:", error);
    return false;
  }
}

async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) {
    console.log("📎 No attachments found");
    return [];
  }

  console.log(`📎 Processing ${attachments.length} attachments`);
  
  const storageReady = await ensureStorageBucket();
  if (!storageReady) {
    console.error("❌ Storage not ready, skipping attachments");
    return [];
  }

  const maxAttachments = process.env.VERCEL ? 5 : 10;
  const attachmentsToProcess = attachments.slice(0, maxAttachments);

  const attachmentPromises = attachmentsToProcess.map(async (att, index) => {
    try {
      console.log(`   🔍 Processing attachment ${index + 1}:`, att.filename);

      if (!att.content) {
        console.log(`   ❌ Attachment ${index + 1} has no content`);
        return null;
      }

      const originalFilename = att.filename || `attachment_${Date.now()}_${index}.bin`;
      const safeFilename = originalFilename
        .replace(/[^a-zA-Z0-9.\-_]/g, '_')
        .substring(0, 100);

      const uniquePath = `emails/${Date.now()}_${index}_${safeFilename}`;
      
      console.log(`   📤 Uploading: ${safeFilename}`);

      let contentBuffer;
      if (Buffer.isBuffer(att.content)) {
        contentBuffer = att.content;
      } else if (typeof att.content === 'string') {
        contentBuffer = Buffer.from(att.content, 'utf8');
      } else {
        contentBuffer = Buffer.from(att.content);
      }

      if (contentBuffer.length > 15 * 1024 * 1024) {
        console.log(`   ⚠️ Skipping large attachment: ${safeFilename} (${contentBuffer.length} bytes)`);
        return null;
      }

      const uploadPromise = supabase.storage
        .from("attachments")
        .upload(uniquePath, contentBuffer, {
          contentType: att.contentType || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600'
        });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Upload timeout')), 30000)
      );

      const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);

      if (error) {
        console.error(`   ❌ Upload failed for ${safeFilename}:`, error.message);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path);

      console.log(`   ✅ Upload successful: ${safeFilename}`);
      console.log(`   🔗 Public URL: ${urlData.publicUrl}`);

      return {
        id: `${Date.now()}_${index}`,
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

    } catch (attErr) {
      console.error(`   ❌ Attachment processing error:`, attErr.message);
      return null;
    }
  });

  const results = await Promise.allSettled(attachmentPromises);
  
  const successfulAttachments = results
    .filter(result => result.status === 'fulfilled' && result.value !== null)
    .map(result => result.value);

  console.log(`📎 Completed: ${successfulAttachments.length}/${attachmentsToProcess.length} successful`);
  
  return successfulAttachments;
}

function createEmailData(parsed, messageId, attachmentLinks, options = {}) {
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

app.get("/api/serverless-check", async (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
    region: process.env.VERCEL_REGION,
    hasSupabase: !!supabase,
    hasImapCreds: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    timestamp: new Date().toISOString()
  });
});

app.post("/api/simple-fetch", async (req, res) => {
  console.log("🔍 DEBUG: /api/simple-fetch called");
  
  res.setTimeout(60000, () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Request timeout" });
    }
  });

  try {
    await imapManager.connect();
    
    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log("🚀 SIMPLE FETCH: Starting email fetch");
    
    openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 Total Messages: ${box.messages.total}`);
      
      const totalMessages = box.messages.total;
      const fetchCount = process.env.VERCEL ? 10 : 15;
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
        console.log(`🚀 Processing message #${seqno}`);
        let buffer = "";

        msg.on("body", function (stream) {
          stream.on("data", function (chunk) {
            buffer += chunk.toString("utf8");
          });
        });

        msg.once("end", async function () {
          try {
            const parsed = await simpleParser(buffer);

            const messageId = parsed.messageId || `simple-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            const attachmentLinks = await processAttachments(parsed.attachments || []);

            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              simpleFetched: true
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ Added: ${parsed.subject} (${attachmentLinks.length} attachments)`);
            
            processingDetails.push({
              messageId: messageId.substring(0, 50) + '...',
              subject: parsed.subject || '(No Subject)',
              status: 'processed',
              attachments: attachmentLinks.length
            });

          } catch (parseErr) {
            console.error("   ❌ Parse error:", parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error("❌ Fetch error:", err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false,
            error: "Fetch error: " + err.message 
          });
        }
      });

      f.once("end", async function () {
        console.log(`🔄 Processing ${newEmails.length} messages...`);
        
        try {
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} emails to databases...`);
            
            const saveOps = newEmails.map(async (email) => {
              try {
                const mongoDb = await ensureMongoConnection();
                if (mongoDb) {
                  await mongoDb.collection("emails").updateOne(
                    { messageId: email.messageId },
                    { $set: email },
                    { upsert: true }
                  );
                }

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
          }

          await imapManager.disconnect();

          console.log(`✅ Simple fetch completed: ${processedCount} emails processed`);
          
          if (!res.headersSent) {
            res.json({
              success: true,
              message: `Processed ${processedCount} emails`,
              count: processedCount,
              added: processedCount,
              emails: newEmails,
              details: {
                totalProcessed: processedCount,
                processingDetails: processingDetails
              }
            });
          }

        } catch (batchError) {
          console.error("❌ Batch processing error:", batchError);
          if (!res.headersSent) {
            res.status(500).json({ 
              success: false,
              error: "Batch processing failed: " + batchError.message 
            });
          }
        }
      });
    });

  } catch (error) {
    console.error("❌ Simple fetch API error:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
});

app.post("/api/fetch-latest", async (req, res) => {
  console.log("🔍 DEBUG: /api/fetch-latest called");
  
  res.setTimeout(60000, () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Request timeout" });
    }
  });

  try {
    await imapManager.connect();
    
    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log("🔄 Fetching latest emails");
    
    openInbox(async function (err, box) {
      if (err) {
        return res.status(500).json({ error: "Failed to open inbox: " + err.message });
      }
      
      console.log(`📥 Total Messages: ${box.messages.total}`);
      
      const totalMessages = box.messages.total;
      const fetchCount = process.env.VERCEL ? 8 : 20;
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

            const messageId = parsed.messageId || `latest-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

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

            const attachmentLinks = await processAttachments(parsed.attachments || []);

            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              latestFetched: true
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
        console.error("❌ Latest fetch error:", err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false,
            error: "Latest fetch error: " + err.message 
          });
        }
      });

      f.once("end", async function () {
        console.log(`🔄 Processing ${newEmails.length} new emails...`);
        
        try {
          if (newEmails.length > 0) {
            console.log(`💾 Saving ${newEmails.length} new emails...`);
            
            const saveOps = newEmails.map(async (email) => {
              try {
                const mongoDb = await ensureMongoConnection();
                if (mongoDb) {
                  await mongoDb.collection("emails").updateOne(
                    { messageId: email.messageId },
                    { $set: email },
                    { upsert: true }
                  );
                }
                
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
          }

          await imapManager.disconnect();

          console.log(`✅ Latest fetch: ${processedCount} new, ${duplicateCount} duplicates`);
          if (!res.headersSent) {
            res.json({
              success: true,
              message: `Found ${processedCount} new emails`,
              count: processedCount,
              duplicates: duplicateCount,
              added: processedCount,
              details: {
                totalProcessed: processedCount + duplicateCount,
                newEmails: processedCount,
                duplicates: duplicateCount,
                processingDetails: processingDetails
              }
            });
          }

        } catch (batchError) {
          console.error("❌ Latest batch processing error:", batchError);
          if (!res.headersSent) {
            res.status(500).json({ 
              success: false,
              error: "Latest batch processing failed: " + batchError.message 
            });
          }
        }
      });
    });

  } catch (error) {
    console.error("❌ Latest fetch API error:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
});

app.post("/api/force-fetch", async (req, res) => {
  console.log("🔍 DEBUG: /api/force-fetch called");
  
  res.setTimeout(60000, () => {
    if (!res.headersSent) {
      res.status(500).json({ error: "Request timeout" });
    }
  });

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
      
      const totalMessages = box.messages.total;
      const fetchCount = process.env.VERCEL ? 8 : 10;
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

            const messageId = parsed.messageId || `force-${Date.now()}-${seqno}-${Math.random().toString(36).substring(2, 10)}`;

            const attachmentLinks = await processAttachments(parsed.attachments || []);

            const emailData = createEmailData(parsed, messageId, attachmentLinks, {
              forceFetched: true
            });

            newEmails.push(emailData);
            processedCount++;
            console.log(`   ✅ Force added: ${parsed.subject} (${attachmentLinks.length} attachments)`);
            
            processingDetails.push({
              messageId: messageId.substring(0, 50) + '...',
              subject: parsed.subject || '(No Subject)',
              status: 'force_processed',
              attachments: attachmentLinks.length
            });

          } catch (parseErr) {
            console.error("   ❌ Force parse error:", parseErr.message);
          }
        });
      });

      f.once("error", function (err) {
        console.error("❌ Force fetch error:", err);
        if (!res.headersSent) {
          res.status(500).json({ 
            success: false,
            error: "Force fetch error: " + err.message 
          });
        }
      });

      f.once("end", async function () {
        console.log(`🔄 Force processing ${newEmails.length} messages...`);
        
        try {
          if (newEmails.length > 0) {
            console.log(`💾 Force saving ${newEmails.length} emails...`);
            
            const saveOps = newEmails.map(async (email) => {
              try {
                const mongoDb = await ensureMongoConnection();
                if (mongoDb) {
                  await mongoDb.collection("emails").updateOne(
                    { messageId: email.messageId },
                    { $set: email },
                    { upsert: true }
                  );
                }

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
          }

          await imapManager.disconnect();

          console.log(`✅ Force processed ${processedCount} emails`);
          if (!res.headersSent) {
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
          }

        } catch (batchError) {
          console.error("❌ Force batch processing error:", batchError);
          if (!res.headersSent) {
            res.status(500).json({ 
              success: false,
              error: "Force batch processing failed: " + batchError.message 
            });
          }
        }
      });
    });

  } catch (error) {
    console.error("❌ Force fetch API error:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  }
});

app.get("/api/test-attachment-urls", async (req, res) => {
  try {
    const { data: files, error } = await supabase.storage
      .from("attachments")
      .list("emails", {
        limit: 20,
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
        size: file.metadata?.size,
        type: file.metadata?.mimetype,
        uploaded: file.created_at,
        testUrl: `${urlData.publicUrl}?test=${Date.now()}`
      };
    });

    res.json({
      bucket: 'attachments',
      totalFiles: files.length,
      files: filesWithUrls
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
      environment: process.env.NODE_ENV || 'development',
      isVercel: !!process.env.VERCEL
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

app.get("/api/emails", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    if (!mongoDb) {
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
        default:
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

    const cacheKey = `emails:${search}:${sort}:${pageNum}:${limitNum}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      console.log("📦 Serving from cache");
      return res.json(cached);
    }

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
      default:
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

app.post("/api/clear-cache", (req, res) => {
  const cacheSize = cache.size;
  clearCache();
  res.json({ 
    success: true, 
    message: `Cleared ${cacheSize} cache entries` 
  });
});

app.get("/api/debug-storage-setup", async (req, res) => {
  try {
    console.log("🛠️ Setting up and debugging storage...");
    
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.log("❌ Cannot list buckets:", bucketsError);
    } else {
      console.log("✅ Available buckets:", buckets);
    }

    if (!buckets?.find(b => b.name === 'attachments')) {
      console.log("🛠️ Creating attachments bucket...");
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('attachments', {
        public: true,
        fileSizeLimit: 52428800
      });
      
      if (createError) {
        console.log("❌ Failed to create bucket:", createError);
      } else {
        console.log("✅ Created attachments bucket:", newBucket);
      }
    }

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
      
      const { data: urlData } = supabase.storage
        .from("attachments")
        .getPublicUrl(uploadData.path);
      console.log("🔗 Public URL:", urlData.publicUrl);
      
      await supabase.storage.from("attachments").remove([testPath]);
    }

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

app.get("/", (req, res) => {
  res.json({
    message: "Email IMAP Backend Server - Vercel Optimized",
    version: "3.0.0",
    environment: process.env.NODE_ENV || 'development',
    isVercel: !!process.env.VERCEL,
    endpoints: {
      "GET /api/health": "Check service status",
      "GET /api/serverless-check": "Check Vercel environment",
      "GET /api/emails": "Get emails from databases",
      "POST /api/fetch-latest": "Fetch latest emails",
      "POST /api/simple-fetch": "Simple fetch (bypass checks)",
      "POST /api/force-fetch": "Force fetch emails",
      "GET /api/test-attachment-urls": "Test attachment URLs",
      "GET /api/debug-storage-setup": "Debug storage setup",
      "POST /api/clear-cache": "Clear all caches"
    },
    features: [
      "Vercel serverless optimized",
      "Enhanced attachment handling",
      "Better timeout management",
      "Fixed Supabase storage"
    ]
  });
});

const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log('Serving index.html for:', req.path);
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

async function initializeApp() {
  console.log("🚀 Initializing application...");
  
  if (supabase) {
    await ensureStorageBucket();
  }
  
  console.log("✅ Application initialized");
}

initializeApp();

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