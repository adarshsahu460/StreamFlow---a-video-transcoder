import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer'
import ShareButton from '../components/ShareButton'
import { fetchVideo, Video } from '../api'

const VideoPage = () => {
  const { id } = useParams<{ id: string }>()
  const [video, setVideo] = useState<Video | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  
  useEffect(() => {
    const loadVideo = async () => {
      if (!id) return
      
      try {
        setLoading(true)
        const data = await fetchVideo(id)
        setVideo(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load video')
        console.error('Error loading video:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadVideo()
    
    // If video is still processing or status is undefined but has playbackUrl, refresh the page every 10 seconds
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    
    // Only set up interval if video is processing (has a status that's not COMPLETED)
    if (video?.status && video.status !== 'COMPLETED') {
      refreshInterval = setInterval(loadVideo, 10000);
    }
    
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [id, video?.status])
  
  // Generate thumbnails URL from playback URL
  const getThumbnailsUrl = (playbackUrl: string) => {
    return playbackUrl.replace('master.m3u8', 'thumbnails.vtt')
  }
  
  // Check if video is still processing
  // If status is undefined (not present in API response), assume video is COMPLETED
  const isProcessing = video && video.status && video.status !== 'COMPLETED';
  
  // Get status message based on video status
  const getStatusMessage = () => {
    if (!video) return '';
    
    // If status is not present, video is completed
    if (!video.status) return 'Video is ready for playback.';
    
    switch (video.status) {
      case 'PENDING':
        return 'Your video is queued for processing.';
      case 'PROCESSING':
        return 'Your video is currently being processed.';
      case 'FAILED':
        return 'There was an error processing your video.';
      default:
        return `Status: ${video.status}`;
    }
  };
  
  return (
    <div>
      <Link 
        to="/" 
        className="inline-flex items-center text-primary-600 hover:text-primary-800 mb-6"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Videos
      </Link>
      
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700"></div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4 mb-6">
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
          >
            Try Again
          </button>
        </div>
      )}
      
      {video && (
        <div>
          {isProcessing ? (
            <div className="bg-black rounded-lg overflow-hidden mb-6 flex items-center justify-center" style={{ minHeight: '400px' }}>
              <div className="text-center px-4 py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                <h2 className="text-white text-xl font-bold mb-2">Processing Video</h2>
                <p className="text-white text-md mb-4">{getStatusMessage()}</p>
                <p className="text-white text-sm opacity-80">This page will automatically refresh when your video is ready.</p>
              </div>
            </div>
          ) : (
            <div className="bg-black rounded-lg overflow-hidden mb-6">
              <VideoPlayer 
                playbackUrl={video.playbackUrl}
                thumbnailsUrl={getThumbnailsUrl(video.playbackUrl)}
              />
            </div>
          )}
          
          <h1 className="text-2xl font-bold mb-2">{video.title}</h1>
          <div className="flex justify-between items-center">
            <p className="text-gray-600 mb-4">
              Uploaded by <span className="font-medium">{video.username}</span> on {new Date(video.createdAt).toLocaleDateString()}
            </p>
            
            <div className="flex items-center space-x-4">
              {!isProcessing && (
                <ShareButton videoId={video.id} title={video.title} />
              )}
              
              {isProcessing && (
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm">
                  {video.status}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoPage
