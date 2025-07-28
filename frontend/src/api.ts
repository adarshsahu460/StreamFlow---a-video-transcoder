export interface Video {
  id: string;
  title: string;
  username: string;
  thumbnailUrl: string;
  playbackUrl: string;
  createdAt: string;
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
      createdAt: '2023-07-19T14:36:33.032Z'
    },
    {
      id: 'johndoe###nature_documentary-1752947123456',
      title: 'Amazing Nature Documentary',
      username: 'johndoe',
      thumbnailUrl: 'https://s3.ap-south-1.amazonaws.com/production-videos.adarshsahu.site/processed/adarshsahu%23%23%23sai_pallavi-1752947793032/sprite.jpg#xywh=0,90,160,90',
      playbackUrl: 'https://s3.ap-south-1.amazonaws.com/production-videos.adarshsahu.site/processed/adarshsahu%23%23%23sai_pallavi-1752947793032/master.m3u8',
      createdAt: '2023-07-15T10:12:03.456Z'
    }
  ];
};

// Define API endpoint
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'https://your-api-gateway-id.execute-api.your-region.amazonaws.com/prod';

// Fetch all videos
export const fetchVideos = async (): Promise<Video[]> => {
  // For development without API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return getMockVideos();
  }
  
  const response = await fetch(`${API_ENDPOINT}/videos`);
  
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
