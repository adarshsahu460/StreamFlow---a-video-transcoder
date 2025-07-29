export interface Video {
  id: string;
  title: string;
  username: string;
  thumbnailUrl: string;
  playbackUrl: string;
  status: string;
  createdAt: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  videoId: string;
  key: string;
}

export interface UploadRequest {
  title: string;
  username: string;
  fileType: string;
}

// Mock API function to use when real API is unavailable (development mode)
export const getMockVideos = (): Video[] => {
  return [
    {
      id: 'adarshsahu###sai_pallavi-1752947793032',
      title: 'Sai Pallavi',
      username: 'adarshsahu',
      thumbnailUrl: 'https://s3.ap-south-1.amazonaws.com/production-videos.adarshsahu.site/processed/adarshsahu%23%23%23sai_pallavi-1752947793032/sprite.jpg#xywh=0,0,160,90',
      playbackUrl: 'https://s3.ap-south-1.amazonaws.com/production-videos.adarshsahu.site/processed/adarshsahu%23%23%23sai_pallavi-1752947793032/master.m3u8',
      status: 'COMPLETED',
      createdAt: '2023-07-19T14:36:33.032Z'
    },
    {
      id: 'johndoe###nature_documentary-1752947123456',
      title: 'Amazing Nature Documentary',
      username: 'johndoe',
      thumbnailUrl: 'https://s3.ap-south-1.amazonaws.com/production-videos.adarshsahu.site/processed/adarshsahu%23%23%23sai_pallavi-1752947793032/sprite.jpg#xywh=0,90,160,90',
      playbackUrl: 'https://s3.ap-south-1.amazonaws.com/production-videos.adarshsahu.site/processed/adarshsahu%23%23%23sai_pallavi-1752947793032/master.m3u8',
      status: 'COMPLETED',
      createdAt: '2023-07-15T10:12:03.456Z'
    }
  ];
};

// Define API endpoint
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'https://your-api-gateway-id.execute-api.your-region.amazonaws.com/prod';

// Fetch all videos
export const fetchVideos = async (includePending = false): Promise<Video[]> => {
  // For development without API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const mockVideos = getMockVideos();
    
    // Add some mock pending videos if requested
    if (includePending) {
      mockVideos.push({
        id: 'mockuser###pending_video-' + Date.now(),
        title: 'Processing Video',
        username: 'mockuser',
        thumbnailUrl: '',
        playbackUrl: '',
        status: 'PROCESSING',
        createdAt: new Date().toISOString()
      });
    }
    
    return mockVideos;
  }
  
  const url = includePending 
    ? `${API_ENDPOINT}/videos?includePending=true` 
    : `${API_ENDPOINT}/videos`;
    
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.videos;
};

// Fetch a single video by ID
export const fetchVideo = async (id: string): Promise<Video> => {
  // For development without API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const video = getMockVideos().find(v => v.id === id);
    if (!video) {
      throw new Error('Video not found');
    }
    return video;
  }
  
  const response = await fetch(`${API_ENDPOINT}/videos/${id}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return await response.json();
};

// Get a presigned URL for uploading a video
export const getUploadUrl = async (request: UploadRequest): Promise<UploadUrlResponse> => {
  console.log('🚀 getUploadUrl called with request:', request);
  
  // For development without API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('🔧 Development mode: returning mock upload URL');
    // Mock response for local development
    return {
      uploadUrl: 'https://example.com/mock-upload-url',
      videoId: `${request.username}###${request.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-${Date.now()}`,
      key: `mock-key-${Date.now()}.mp4`
    };
  }
  
  console.log('📡 Making API request to get upload URL:', {
    endpoint: `${API_ENDPOINT}/videos/upload`,
    method: 'POST',
    request: request
  });
  
  try {
    const response = await fetch(`${API_ENDPOINT}/videos/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    console.log('📥 API response received:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API request failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText
      });
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const responseData = await response.json();
    console.log('✅ Upload URL obtained successfully:', {
      videoId: responseData.videoId,
      key: responseData.key,
      hasUploadUrl: !!responseData.uploadUrl
    });
    
    return responseData;
    
  } catch (error) {
    console.error('❌ Error in getUploadUrl:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      request: request,
      apiEndpoint: API_ENDPOINT
    });
    throw error;
  }
};

// Upload a video file using the presigned URL
export const uploadVideo = async (
  presignedUrl: string, 
  file: File, 
  onProgress?: (percentage: number) => void
): Promise<void> => {
  console.log('📤 Starting video upload:', {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    fileSizeInMB: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
    presignedUrlDomain: new URL(presignedUrl).hostname
  });
  
  // For development without API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('🔧 Development mode: simulating upload progress');
    // Mock a delay with progress updates for local development
    const totalSteps = 10;
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (onProgress) {
        const percentage = Math.round((i / totalSteps) * 100);
        console.log(`📊 Mock upload progress: ${percentage}%`);
        onProgress(percentage);
      }
    }
    console.log('✅ Mock upload completed');
    return;
  }
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Set up progress tracking
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        console.log(`📊 Upload progress: ${percentage}%`, {
          loaded: event.loaded,
          total: event.total,
          loadedMB: (event.loaded / (1024 * 1024)).toFixed(2),
          totalMB: (event.total / (1024 * 1024)).toFixed(2)
        });
        onProgress(percentage);
      }
    });
    
    // Set up completion handler
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('✅ Video upload completed successfully:', {
          status: xhr.status,
          statusText: xhr.statusText,
          fileName: file.name,
          fileSize: file.size
        });
        resolve();
      } else {
        console.error('❌ Upload failed with HTTP error:', {
          status: xhr.status,
          statusText: xhr.statusText,
          responseText: xhr.responseText,
          fileName: file.name
        });
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });
    
    // Set up error handler
    xhr.addEventListener('error', () => {
      console.error('❌ Network error during upload:', {
        fileName: file.name,
        fileSize: file.size,
        readyState: xhr.readyState,
        status: xhr.status
      });
      reject(new Error('Network error occurred during upload'));
    });
    
    // Set up abort handler
    xhr.addEventListener('abort', () => {
      console.warn('⚠️ Upload was aborted:', {
        fileName: file.name,
        fileSize: file.size
      });
      reject(new Error('Upload was aborted'));
    });
    
    console.log('🚀 Starting XMLHttpRequest upload...');
    // Open and send the request
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.timeout = 300000; // 5 minutes timeout
    xhr.send(file);
  });
};
