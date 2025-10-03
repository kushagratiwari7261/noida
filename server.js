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

console.log("🔍 DEBUG: Environment check - EMAIL_USER:", !!process.env.EMAIL_USER, "EMAIL_PASS:", !!process.env.EMAIL_PASS, "MONGO_URI:", !!process.env.MONGO_URI, "SUPABASE_URL:", !!process.env.SUPABASE_URL);

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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY, 
  {
    auth: { persistSession: false }
  }
);

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

// FIXED: Improved duplicate detection with better logging
async function checkDuplicate(messageId) {
  try {
    if (!messageId) {
      console.log("⚠️ No messageId provided for duplicate check");
      return false;
    }

    console.log(`🔍 Checking duplicate for messageId: ${messageId.substring(0, 50)}...`);

    const mongoDb = await ensureMongoConnection();
    const [mongoDuplicate, supabaseDuplicate] = await Promise.allSettled([
      mongoDb ? mongoDb.collection("emails").findOne({ messageId: messageId }) : Promise.resolve(null),
      supabase.from('emails').select('message_id').eq('message_id', messageId).maybeSingle()
    ]);

    const mongoResult = mongoDuplicate.status === 'fulfilled' ? mongoDuplicate.value : null;
    const supabaseResult = supabaseDuplicate.status === 'fulfilled' ? supabaseDuplicate.value : null;

    const isDuplicate = !!(mongoResult || (supabaseResult && supabaseResult.message_id));

    if (isDuplicate) {
      console.log(`   ⚠️ Duplicate found: ${messageId.substring(0, 30)}...`);
    } else {
      console.log(`   ✅ No duplicate: ${messageId.substring(0, 30)}...`);
    }

    return isDuplicate;
  } catch (error) {
    console.error("❌ Duplicate check error:", error);
    return false;
  }
}

async function processAttachments(attachments) {
  if (!attachments || attachments.length === 0) return [];

  const attachmentPromises = attachments.map(async (att) => {
    try {
      const originalFilename = att.filename || `unnamed_${Date.now()}.bin`;
      const safeFilename = originalFilename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      
      const supabasePath = `emails/${Date.now()}_${safeFilename}`;
      const { data, error } = await supabase.storage
        .from("attachments")
        .upload(supabasePath, att.content, {
          contentType: att.contentType || 'application/octet-stream',
        });

      if (error) {
        console.error("❌ Supabase upload error:", error.message);
        return null;
      }

      const publicUrl = supabase.storage
        .from("attachments")
        .getPublicUrl(data.path).data.publicUrl;

      return {
        filename: safeFilename,
        url: publicUrl,
        type: att.contentType || 'application/octet-stream',
        supabasePath: data.path,
        size: att.content?.length || 0
      };

    } catch (attErr) {
      console.error("❌ Attachment processing error:", attErr.message);
      return null;
    }
  });

  const results = await Promise.allSettled(attachmentPromises);
  return results
    .filter(result => result.status === 'fulfilled' && result.value !== null)
    .map(result => result.value);
}

// NEW: Simple fetch that bypasses all duplicate checks
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

            const emailData = {
              messageId: messageId,
              subject: parsed.subject || '(No Subject)',
              from: parsed.from?.text || "",
              to: parsed.to?.text || "",
              date: parsed.date || new Date(),
              text: parsed.text || "",
              html: parsed.html || "",
              attachments: attachmentLinks,
              processedAt: new Date(),
              simpleFetched: true
            };

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

// FIXED: Enhanced latest email fetch
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

            const emailData = {
              messageId: messageId,
              subject: parsed.subject || '(No Subject)',
              from: parsed.from?.text || "",
              to: parsed.to?.text || "",
              date: parsed.date || new Date(),
              text: parsed.text || "",
              html: parsed.html || "",
              attachments: attachmentLinks,
              processedAt: new Date(),
              latestFetched: true
            };

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

// FIXED: Enhanced force fetch
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

            const emailData = {
              messageId: messageId,
              subject: parsed.subject || '(No Subject)',
              from: parsed.from?.text || "",
              to: parsed.to?.text || "",
              date: parsed.date || new Date(),
              text: parsed.text || "",
              html: parsed.html || "",
              attachments: attachmentLinks,
              processedAt: new Date(),
              forceFetched: true
            };

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

// Get emails from MongoDB with performance optimizations
app.get("/api/emails", async (req, res) => {
  try {
    const mongoDb = await ensureMongoConnection();
    if (!mongoDb) {
      // Fallback to Supabase if MongoDB not available
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
    
    const { data: supabaseData, error: supabaseError } = await supabase
      .from('emails')
      .select('count')
      .limit(1)
      .single();
    
    const supabaseStatus = supabaseError ? "disconnected" : "connected";
    
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
      "POST /api/clear-cache": "Clear all caches"
    },
    features: [
      "ES Modules compatible",
      "Vercel serverless ready",
      "Enhanced duplicate detection",
      "Better error handling",
      "Multi-database support"
    ]
  });
});

// Serve static files from the React app build directory (for production/Vercel)
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);
app.use(express.static(distPath));

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  console.log('Serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

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

// Start Express server only in development and when not in Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Enhanced backend server running on port ${PORT}`);
    console.log(`📧 Email API endpoints available at http://localhost:${PORT}/api`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Handle port already in use errors gracefully
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`❌ Port ${PORT} is already in use. Trying port ${Number(PORT) + 1}...`);
      const newPort = Number(PORT) + 1;
      app.listen(newPort, () => {
        console.log(`🚀 Server running on port ${newPort} instead`);
        console.log(`📧 Email API endpoints available at http://localhost:${newPort}/api`);
      });
    } else {
      console.error('Server error:', err);
    }
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  
  await imapManager.disconnect();
  
  if (isMongoConnected && mongoClient) {
    await mongoClient.close();
  }
  
  clearCache();
  process.exit(0);
});