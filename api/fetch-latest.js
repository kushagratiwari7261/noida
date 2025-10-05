import { simpleParser } from "mailparser";
import { ensureMongoConnection, supabase, imapManager, checkDuplicate, processAttachments, openInbox } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log("🔍 DEBUG: /api/fetch-latest called");
  try {
    await imapManager.connect();

    if (imapManager.connection.state !== 'authenticated') {
      return res.status(400).json({ error: "IMAP not connected" });
    }

    console.log("🔄 Fetching latest emails with duplicate detection");

    const box = await openInbox(imapManager.connection);

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

  } catch (error) {
    console.error("❌ Latest fetch API error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}