import { useState, useEffect } from 'react'
import VideoCard from '../components/VideoCard'
import FilterBar from '../components/FilterBar'
import { fetchVideos, Video } from '../api'

const HomePage = () => {
  const [videos, setVideos] = useState<Video[]>([])
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showProcessing, setShowProcessing] = useState(true)
  const [usernameFilter, setUsernameFilter] = useState('')
  const [isFiltered, setIsFiltered] = useState(false)
  
  useEffect(() => {
    const loadVideos = async () => {
      try {
        setLoading(true)
        const data = await fetchVideos(true) // Include pending videos
        setVideos(data)
        
        // If we have a filter applied, update filtered videos
        if (isFiltered) {
          applyFilters(data)
        } else {
          setFilteredVideos(data)
        }
        
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load videos')
        console.error('Error loading videos:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadVideos()
    
    // Refresh video list every 15 seconds to update processing status
    const refreshInterval = setInterval(loadVideos, 15000)
    
    return () => clearInterval(refreshInterval)
  }, [isFiltered, usernameFilter])
  
  // Apply all active filters
  const applyFilters = (videoList = videos) => {
    let result = [...videoList]
    
    // Filter by username if provided
    if (usernameFilter) {
      result = result.filter(video => 
        video.username.toLowerCase().includes(usernameFilter.toLowerCase())
      )
    }
    
    setFilteredVideos(result)
    setIsFiltered(!!usernameFilter)
  }
  
  // Handle applying filters
  const handleFilterApply = () => {
    applyFilters()
  }
  
  // Handle resetting filters
  const handleFilterReset = () => {
    setUsernameFilter('')
    setIsFiltered(false)
    setFilteredVideos(videos)
  }
  
  // Filter videos based on user preference for processing status
  const displayedVideos = showProcessing 
    ? filteredVideos 
    : filteredVideos.filter(video => video.status === 'COMPLETED')
  
  // Count videos by status
  const completedCount = filteredVideos.filter(v => v.status === 'COMPLETED').length
  const processingCount = filteredVideos.length - completedCount
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Discover Videos</h1>
        
        {processingCount > 0 && (
          <div className="flex items-center">
            <span className="text-sm text-gray-600 mr-2">
              Show processing videos
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={showProcessing}
                onChange={() => setShowProcessing(!showProcessing)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        )}
      </div>
      
      {/* Filter Bar */}
      <FilterBar
        username={usernameFilter}
        onUsernameChange={setUsernameFilter}
        onFilter={handleFilterApply}
        onReset={handleFilterReset}
      />
      
      {loading && !filteredVideos.length && (
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
      
      {!loading && !error && displayedVideos.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-md p-4 mb-6">
          {isFiltered ? (
            <p>No videos match your filter criteria. Try adjusting your filters or upload a new video.</p>
          ) : (
            <p>No videos available yet. Upload your first video to get started!</p>
          )}
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {displayedVideos.map(video => (
          <VideoCard 
            key={video.id} 
            video={video} 
            onUsernameClick={(username) => {
              setUsernameFilter(username);
              setIsFiltered(true);
              applyFilters(videos.filter(v => v.username === username));
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default HomePage