import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer'
import { fetchVideo, Video } from '../api'

const VideoPage = () => {
  const { id } = useParams<{ id: string }>()
  const [video, setVideo] = useState<Video | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
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
  }, [id])
  
  // Generate thumbnails URL from playback URL
  const getThumbnailsUrl = (playbackUrl: string) => {
    return playbackUrl.replace('master.m3u8', 'thumbnails.vtt')
  }
  
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
          <div className="bg-black rounded-lg overflow-hidden mb-6">
            <VideoPlayer 
              playbackUrl={video.playbackUrl}
              thumbnailsUrl={getThumbnailsUrl(video.playbackUrl)}
            />
          </div>
          
          <h1 className="text-2xl font-bold mb-2">{video.title}</h1>
          <p className="text-gray-600 mb-4">Uploaded by <span className="font-medium">{video.username}</span> on {new Date(video.createdAt).toLocaleDateString()}</p>
        </div>
      )}
    </div>
  )
}

export default VideoPage
