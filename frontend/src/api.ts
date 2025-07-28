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
  // For development without API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Mock response for local development
    return {
      uploadUrl: 'https://example.com/mock-upload-url',
      videoId: `${request.username}###${request.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-${Date.now()}`,
      key: `mock-key-${Date.now()}.mp4`
    };
  }
  
  const response = await fetch(`${API_ENDPOINT}/videos/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return await response.json();
};

// Upload a video file using the presigned URL
export const uploadVideo = async (
  presignedUrl: string, 
  file: File, 
  onProgress?: (percentage: number) => void
): Promise<void> => {
  // For development without API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Mock a delay with progress updates for local development
    const totalSteps = 10;
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (onProgress) {
        onProgress(Math.round((i / totalSteps) * 100));
      }
    }
    return;
  }
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Set up progress tracking
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        onProgress(percentage);
      }
    });
    
    // Set up completion handler
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    
    // Set up error handler
    xhr.addEventListener('error', () => {
      reject(new Error('Network error occurred during upload'));
    });
    
    // Set up abort handler
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was aborted'));
    });
    
    // Open and send the request
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
};
