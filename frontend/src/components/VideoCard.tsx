import { Link, useNavigate } from 'react-router-dom'
import { Video } from '../api'

interface VideoCardProps {
  video: Video;
  onUsernameClick?: (username: string) => void;
}

const VideoCard = ({ video, onUsernameClick }: VideoCardProps) => {
  const navigate = useNavigate();
  
  // Handle videos that are still processing
  const isProcessing = video.status !== 'COMPLETED';
  
  // Get placeholder image or processing overlay if no thumbnail
  const thumbnailUrl = video.thumbnailUrl || 'https://placehold.co/400x225/e2e8f0/64748b?text=Processing...';
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Queued for processing';
      case 'PROCESSING':
        return 'Processing video...';
      case 'FAILED':
        return 'Processing failed';
      default:
        return status;
    }
  };
  
  const handleUsernameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (onUsernameClick) {
      onUsernameClick(video.username);
    }
  };
  
  const handleCardClick = () => {
    if (!isProcessing) {
      navigate(`/video/${video.id}`);
    }
  };
  
  return (
    <div 
      className={`block ${!isProcessing ? 'cursor-pointer' : ''}`} 
      onClick={handleCardClick}
    >
      <div className={`card ${!isProcessing ? 'card-hover' : ''}`}>
        <div className="relative">
          <img 
            src={thumbnailUrl} 
            alt={video.title}
            className="video-thumbnail"
            loading="lazy"
          />
          
          {isProcessing && (
            <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
              <div className="text-center px-4">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mx-auto mb-2"></div>
                <p className="text-white text-sm font-medium">{getStatusLabel(video.status)}</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-3">
          <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
            {video.title}
          </h3>
          <p 
            className="text-sm text-primary-600 hover:text-primary-800 hover:underline cursor-pointer"
            onClick={handleUsernameClick}
          >
            {video.username}
          </p>
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-gray-500">
              {new Date(video.createdAt).toLocaleDateString()}
            </p>
            
            {isProcessing && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {video.status}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default VideoCard
