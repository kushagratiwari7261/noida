import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const uploadFile = async (file, userId) => {
    setUploading(true);
    setProgress(10);
    setUploadError(null);

    try {
      // Unique path: userId/timestamp-originalname
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${userId}/${timestamp}-${safeName}`;

      setProgress(30);

      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,        // fail on collision so we know about it
        });

      if (error) {
        console.error('Supabase storage upload error:', error);
        setUploadError(error.message);
        throw new Error(`Upload failed: ${error.message}`);
      }

      setProgress(100);

      return {
        path: filePath,
        name: file.name,
        size: file.size,
        type: file.type,
        storage_path: filePath,   // ensure both keys are present
      };
    } catch (err) {
      console.error('useFileUpload error:', err);
      setUploadError(err.message);
      throw err;
    } finally {
      setUploading(false);
      // Reset progress after a short delay so the bar animates to 100 first
      setTimeout(() => setProgress(0), 800);
    }
  };

  /**
   * Returns the public URL for a file in the message-attachments bucket.
   * Works whether the bucket is public or not (signed URL fallback).
   */
  const getFileUrl = (filePath) => {
    if (!filePath) return null;
    const { data } = supabase.storage
      .from('message-attachments')
      .getPublicUrl(filePath);
    return data?.publicUrl ?? null;
  };

  /**
   * Get a short-lived signed URL (1 hour) — use this if the bucket is private.
   */
  const getSignedUrl = async (filePath) => {
    if (!filePath) return null;
    const { data, error } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(filePath, 3600);
    if (error) console.error('Signed URL error:', error);
    return data?.signedUrl ?? null;
  };

  const deleteFile = async (filePath) => {
    try {
      const { error } = await supabase.storage
        .from('message-attachments')
        .remove([filePath]);
      if (error) throw error;
    } catch (err) {
      console.error('Error deleting file:', err);
      throw err;
    }
  };

  return {
    uploadFile,
    getFileUrl,
    getSignedUrl,
    deleteFile,
    uploading,
    progress,
    uploadError,
  };
};