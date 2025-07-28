import { useState, useEffect } from 'react'
import VideoCard from '../components/VideoCard'
import { fetchVideos, Video } from '../api'

const HomePage = () => {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    const loadVideos = async () => {
      try {
        setLoading(true)
        const data = await fetchVideos()
        setVideos(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load videos')
        console.error('Error loading videos:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadVideos()
  }, [])
  
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Discover Videos</h1>
      
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
      
      {!loading && !error && videos.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-4 mb-6">
          <p>No videos available yet. Upload your first video to get started!</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {videos.map(video => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </div>
  )
}

export default HomePage
