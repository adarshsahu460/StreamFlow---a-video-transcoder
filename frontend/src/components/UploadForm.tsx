import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { getUploadUrl, uploadVideo } from '../api';

interface UploadFormProps {
  onUploadComplete?: () => void;
}

const UploadForm = ({ onUploadComplete }: UploadFormProps) => {
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      // Validate file type
      if (!selectedFile.type.startsWith('video/')) {
        setError('Please select a valid video file');
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      
      // Auto-fill title from filename if empty
      if (!title) {
        const fileName = selectedFile.name.split('.')[0];
        setTitle(fileName);
      }
    }
  };

  // Error display component
  const ErrorMessage = ({ message }: { message: string }) => (
    <div className="p-3 mb-4 text-sm text-red-800 bg-red-50 rounded-md border border-red-200">
      <div className="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span>{message}</span>
      </div>
    </div>
  );
  
  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a video file');
      return;
    }
    
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    
    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);
      
      // Step 1: Get presigned URL
      const uploadData = await getUploadUrl({
        title,
        username,
        fileType: file.type
      });
      
      // Step 2: Upload the file with progress tracking
      await uploadVideo(
        uploadData.uploadUrl, 
        file, 
        (percentage) => {
          setUploadProgress(percentage);
        }
      );
      
      // Reset form
      setTitle('');
      setUsername('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Close modal and trigger refresh if needed
      setIsModalOpen(false);
      if (onUploadComplete) {
        onUploadComplete();
      }
      
    } catch (err) {
      console.error('Upload error:', err);
      
      // Provide more specific error messages based on the error
      if (err instanceof Error) {
        if (err.message.includes('Network')) {
          setError('Network error. Please check your internet connection and try again.');
        } else if (err.message.includes('aborted')) {
          setError('Upload was cancelled. Please try again.');
        } else if (err.message.includes('timed out')) {
          setError('Upload timed out. Please try with a smaller file or check your connection.');
        } else {
          setError(`Upload failed: ${err.message}`);
        }
      } else {
        setError('Failed to upload video. Please try again later.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Calculate file size in readable format
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <>
      {/* Upload Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="btn btn-primary flex items-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        Upload Video
      </button>

      {/* Upload Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Upload a Video</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Username Input */}
              <div className="mb-4">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="Enter your username"
                  disabled={isUploading}
                  required
                />
              </div>

              {/* Title Input */}
              <div className="mb-4">
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Video Title
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                  placeholder="Enter video title"
                  disabled={isUploading}
                  required
                />
              </div>

              {/* File Input */}
              <div className="mb-4">
                <label htmlFor="videoFile" className="block text-sm font-medium text-gray-700 mb-1">
                  Video File
                </label>
                <input
                  type="file"
                  id="videoFile"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                  accept="video/*"
                  disabled={isUploading}
                  required
                />
                {file && (
                  <p className="mt-2 text-sm text-gray-500">
                    {file.name} ({formatFileSize(file.size)})
                  </p>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Upload Progress */}
              {isUploading && (
                <div className="mb-4">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 text-center">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary mr-2"
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isUploading || !file}
                >
                  {isUploading ? 'Uploading...' : 'Upload Video'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default UploadForm;
