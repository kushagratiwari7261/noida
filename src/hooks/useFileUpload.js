import { useState } from 'react'; // Add this import
import { supabase } from '../lib/supabaseClient';

export const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file, userId) => {
    try {
      setUploading(true);
      setProgress(0);

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, file, {
          onUploadProgress: (progressEvent) => {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            setProgress(progress);
          }
        });

      if (error) throw error;

      return {
        path: filePath,
        name: file.name,
        size: file.size,
        type: file.type
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const getFileUrl = (filePath) => {
    const { data } = supabase.storage
      .from('message-attachments')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  };

  const deleteFile = async (filePath) => {
    try {
      const { error } = await supabase.storage
        .from('message-attachments')
        .remove([filePath]);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  };

  return {
    uploadFile,
    getFileUrl,
    deleteFile,
    uploading,
    progress
  };
};